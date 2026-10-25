"""Command line: python -m closer_ai <command> (run from ml/)."""

from __future__ import annotations

import argparse
import os
import time
from datetime import date
from pathlib import Path

import numpy as np

ML_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS = ML_DIR / "artifacts"
DEFAULT_DB = ML_DIR / "data" / "closer_ai.sqlite"
DEMO_SEED = 700_000
NICKNAMES = {
    "fr": ("Léo", "Inès", "Lina", "Noah", "Jade", "Adam", "Louise", "Gabriel", "Chloé", "Hugo", "Manon", "Sacha",
           "Nina", "Tom", "Rose", "Malo"),
    "en": ("Mia", "Liam", "Ava", "Ethan", "Zoe", "Lucas", "Ella", "Owen", "Ivy", "Max", "Ruby", "Leo", "Nora", "Finn",
           "Isla", "Theo"),
}


# Only these are read from .env.local: the Anthropic settings and the secret shared with the app's server.
LOCAL_VARIABLES = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLOSER_CLAUDE_MODEL", "CLOSER_AI_TOKEN")


def load_local_env(path: Path = ML_DIR.parent / ".env.local") -> None:
    """Read the Anthropic settings and CLOSER_AI_TOKEN from the repo's git-ignored .env.local; the environment wins."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() in LOCAL_VARIABLES and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip('"'))


def _today(value: str | None) -> date:
    return date.fromisoformat(value) if value else date.today()


# -- training -------------------------------------------------------------------------
def _train_assessor(args) -> None:
    from .assessor import Assessor
    from .datasets import assessor_dataset

    started = time.time()
    X, y, _, _ = assessor_dataset(args.children, seed=0, workers=args.workers)
    assessor = Assessor(C=args.C).fit(X, y)
    assessor.save(args.out)
    print(f"Assessor {assessor.version} trained on {len(X):,} simulated child-days in {time.time() - started:.0f}s")
    print(f"Saved to {args.out}")


def _train_policy(args) -> None:
    from .policy.train import train

    train(args.assessor, args.out, steps=args.steps, enable_ask=not args.no_ask, n_envs=args.envs, seed=args.seed)
    print(f"Saved to {args.out}")


def _evaluate(args) -> None:
    from .report import build_report

    if args.quick:
        build_report(ARTIFACTS, ML_DIR / "RESULTS.quick.md", budget=args.budget, n_val=60, n_test=80, quick=True)
    else:
        build_report(ARTIFACTS, ML_DIR / "RESULTS.md", budget=args.budget)
    print("Report written; deployment settings in artifacts/policy.json")


# -- data ---------------------------------------------------------------------------------
def seed_store(store, n_children: int, today: date, seed: int = DEMO_SEED) -> dict[str, dict]:
    """Fill the store with fictional children, each at a different point of their stay.

    Returns the hidden truth per patient (only the simulator knows it), for the demo.
    """
    from .contract import ChildHistory
    from .simulator import ChildSimulator
    from .store import shift_history

    truth = {}
    for i in range(n_children):
        rng = np.random.default_rng([seed, i])
        sim = ChildSimulator(seed=seed + i)
        sim.reset(seed + i)
        stop = int(rng.integers(min(7, sim.params.stay - 1), sim.params.stay))
        while sim.t < stop:
            sim.step()
        last = sim.history.days[stop].day
        known = [e for e in sim.history.context if (e.known_on or e.starts_on) <= last]
        history = shift_history(ChildHistory(sim.profile, sim.history.days[: stop + 1], known), today)
        names = NICKNAMES[sim.params.lang]
        nickname = names[i % len(names)]
        store.add_patient(history.profile, nickname, today.year - sim.params.age)
        store.add_context(history.profile.patient_id, history.context)
        for record in history.days:
            store.add_day(history.profile.patient_id, record)
        truth[history.profile.patient_id] = {"states": sim.truth.states[: stop + 1], "masking": sim.params.masking}
    return truth


def _seed(args) -> None:
    from .store import Store

    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    store = Store(args.db)
    seed_store(store, args.children, _today(args.date), args.seed)
    print(f"{args.children} fictional children written to {args.db}")


# -- daily job ------------------------------------------------------------------------------
def _components(store, use_claude: bool, language: str):
    from .assessor import Assessor
    from .pipeline import load_policy
    from .policy.distill import TreePolicy

    assessor = Assessor.load(ARTIFACTS / "assessor.joblib")
    policy, _ = load_policy(ARTIFACTS)
    tree_path = ARTIFACTS / "policy_tree.joblib"
    tree = TreePolicy.load(tree_path) if tree_path.exists() else None
    reader = summarizer = None
    if use_claude:
        from .claude import ClaudeReader, ClaudeSummarizer, StoreCache, check_access

        problem = check_access()
        if problem:
            print(f"Claude unavailable ({problem}): running with the lexicon and template summaries.")
        else:
            reader = ClaudeReader(cache=StoreCache(store))
            summarizer = ClaudeSummarizer(language=language)
    return assessor, policy, tree, reader, summarizer


def print_digest(decisions, truth: dict | None = None) -> None:
    """Alerted children first, then everyone else, each with their daily summary."""
    names = {0: "stable", 1: "fragile", 2: "distress"}
    alerted = [d for d in decisions if d.alerts]
    print(f"\n{len(alerted)} of {len(decisions)} children flagged for the psychologist today\n")
    for d in decisions:
        head = max(d.alerts, key=lambda a: {"digest": 0, "priority": 1, "urgent": 2}[a["priority"]]) if d.alerts else None
        tag = head["priority"].upper() if head else "-"
        line = f"[{tag:8}] {d.nickname} ({d.patient_id}) | {d.level}, P(distress) {d.probs[2]:.0%} | action: {d.action}"
        if d.urgency is not None:
            line += f" | urgency {d.urgency:.2f}"
        print(line)
        for alert in d.alerts:
            print(f"           - {alert['reason']}")
        print(f"           summary: {d.summary}")
        if d.rule:
            print(f"           rule: {' and '.join(d.rule)}")
        if truth is not None:
            states = truth[d.patient_id]["states"]
            run = next((k for k, z in enumerate(reversed(states)) if z != states[-1]), len(states))
            masked = " (hides it behind good moods)" if truth[d.patient_id]["masking"] else ""
            print(f"           hidden truth: {names[states[-1]]} for {run} day(s){masked}")


def _run(args) -> None:
    from .pipeline import run_daily
    from .store import Store

    store = Store(args.db)
    assessor, policy, tree, reader, summarizer = _components(store, args.claude, args.language)
    decisions = run_daily(store, assessor, policy, _today(args.date), reader, summarizer, tree, write=not args.dry_run)
    print_digest(decisions)
    if reader:
        print(f"\nClaude readings this run: {reader.calls} (cached readings are reused)")


def _demo(args) -> None:
    from .pipeline import run_daily
    from .store import Store

    store = Store(":memory:")
    today = _today(args.date)
    truth = seed_store(store, args.children, today, args.seed)
    assessor, policy, tree, reader, summarizer = _components(store, args.claude, args.language)
    decisions = run_daily(store, assessor, policy, today, reader, summarizer, tree)
    print_digest(decisions, truth)


def _serve(args) -> None:
    import logging

    from .bridge import Engine
    from .server import CareTabAPI

    token = os.environ.get("CLOSER_AI_TOKEN", "")
    if len(token) < 24:
        raise SystemExit("Set CLOSER_AI_TOKEN (24+ random characters) in the repo's .env.local, the same value the "
                         "app's server uses. For example: python -c \"import secrets; print(secrets.token_urlsafe(32))\"")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    from .assessor import Assessor
    from .pipeline import load_policy
    from .policy.distill import TreePolicy

    policy, _ = load_policy(ARTIFACTS)
    tree_path = ARTIFACTS / "policy_tree.joblib"
    client = None
    if not args.no_claude:
        import anthropic

        from .claude import check_access

        if problem := check_access():
            print(f"Claude unavailable ({problem}): template summaries and the lexicon only.")
        else:
            client = anthropic.Anthropic()
    engine = Engine(Assessor.load(ARTIFACTS / "assessor.joblib"), policy,
                    TreePolicy.load(tree_path) if tree_path.exists() else None, client, args.language)
    CareTabAPI(args.db, engine, token).serve(args.host, args.port)


def _add_drawing(args) -> None:
    """Analyze a drawing (colors here, content by Claude) and, with --patient, store its reading."""
    import json
    from dataclasses import asdict

    from .contract import DRAWING_VECTOR, Drawing
    from .drawings import analyze, image_hash
    from .store import Store

    store = Store(args.db) if args.patient else None
    reader = None
    if not args.no_claude:
        from .claude import ClaudeReader, StoreCache, check_access

        if problem := check_access():
            print(f"Claude unavailable ({problem}): colors only.")
        else:
            reader = ClaudeReader(cache=StoreCache(store) if store else None)
    image = Path(args.image).read_bytes()
    reading = analyze(image, reader, args.title)
    print(json.dumps(asdict(reading) | {"themes": list(reading.themes)}, ensure_ascii=False, indent=1))
    print("vector:", dict(zip(DRAWING_VECTOR, (round(v, 2) for v in reading.vector()))))
    if store:
        shared = Drawing(args.emotion, (), args.title) if args.shared else None
        new = store.add_drawing(args.patient, _today(args.date), image_hash(image), reading, shared)
        print("Stored." if new else "Already stored: the same image is counted once.")


def _alerts(args) -> None:
    from .store import Store

    for a in Store(args.db).alerts(_today(args.date) if args.date else None):
        status = a["outcome"] or "to review"
        print(f"#{a['id']:<4} {a['for_date']} [{a['priority']:8}] {a['nickname']}: {a['reason']} ({status})")


def _review(args) -> None:
    from .store import Store

    Store(args.db).review_alert(args.alert, args.outcome, args.by, args.note)
    print(f"Alert #{args.alert} reviewed: {args.outcome}")


def _eval_reader(args) -> None:
    """Lexicon vs Claude on simulated notes with a planted label. Calls the API once per note."""
    from .claude import ClaudeReader, check_access

    if problem := check_access():
        raise SystemExit(f"Claude unavailable: {problem}")
    from .safety import check_text
    from .simulator import simulate_stay

    notes = []
    for i in range(4000):
        sim = simulate_stay(800_000 + i, randomize=True)
        for t, r in enumerate(sim.history.days):
            if r.note:
                truth = "crisis" if t in sim.truth.crisis_notes else "concern" if t in sim.truth.concern_notes else "none"
                notes.append((truth, r.note))
    rng = np.random.default_rng(0)
    planted = [n for n in notes if n[0] != "none"][: args.n // 2]
    ordinary = [notes[k] for k in rng.choice(len(notes), args.n - len(planted), replace=False) if notes[k][0] == "none"]
    sample = planted + ordinary
    reader = ClaudeReader()
    rows = {"lexicon": {}, "claude": {}, "both": {}}
    for truth, text in sample:
        lex = (check_text(text) or [None])[0]
        reading = reader.read_note(text)
        got = {"lexicon": lex.level if lex else "none", "claude": reading.safety if reading else "none"}
        got["both"] = max(got.values(), key=["none", "concern", "crisis"].index)
        for who, level in got.items():
            rows[who][(truth, level)] = rows[who].get((truth, level), 0) + 1
    print(f"{len(sample)} notes ({len(planted)} with planted crisis or concern), {reader.calls} Claude calls\n")
    for who, counts in rows.items():
        def rate(truth, levels):
            total = sum(v for (t, _), v in counts.items() if t == truth)
            return sum(v for (t, g), v in counts.items() if t == truth and g in levels) / max(1, total)
        print(f"{who:8} crisis caught {rate('crisis', ('crisis',)):.0%} | crisis flagged at any level "
              f"{rate('crisis', ('crisis', 'concern')):.0%} | concern caught {rate('concern', ('crisis', 'concern')):.0%} "
              f"| ordinary notes flagged {rate('none', ('crisis', 'concern')):.1%}")


def main(argv: list[str] | None = None) -> None:
    load_local_env()
    parser = argparse.ArgumentParser(prog="closer_ai", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("train-assessor", help="fit the wellbeing assessor on simulated stays")
    p.add_argument("--children", type=int, default=4000)
    p.add_argument("--C", type=float, default=0.3)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--out", default=str(ARTIFACTS / "assessor.joblib"))
    p.set_defaults(func=_train_assessor)

    p = sub.add_parser("train-policy", help="train the lambda-conditioned PPO alert agent")
    p.add_argument("--assessor", default=str(ARTIFACTS / "assessor.joblib"))
    p.add_argument("--steps", type=int, default=5_000_000)
    p.add_argument("--envs", type=int, default=14)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--no-ask", action="store_true", help="ablation: remove the gentle-question action")
    p.add_argument("--out", default=str(ARTIFACTS / "policy.zip"))
    p.set_defaults(func=_train_policy)

    p = sub.add_parser("evaluate", help="full evaluation report (RESULTS.md) and deployment settings")
    p.add_argument("--budget", type=float, default=0.4, help="alert workload units per child-week")
    p.add_argument("--quick", action="store_true", help="small cohorts, for a smoke test")
    p.set_defaults(func=_evaluate)

    for name, func, text in (("seed", _seed, "fill a SQLite store with fictional children"),
                             ("demo", _demo, "seed fictional children in memory, run the job, reveal the hidden truth")):
        p = sub.add_parser(name, help=text)
        p.add_argument("--children", type=int, default=16)
        p.add_argument("--seed", type=int, default=DEMO_SEED)
        p.add_argument("--date", help="YYYY-MM-DD, default today")
        if name == "seed":
            p.add_argument("--db", default=str(DEFAULT_DB))
        else:
            p.add_argument("--claude", action="store_true", help="Claude reads notes and writes each child's daily summary")
            p.add_argument("--language", default="English", help="language of the daily summaries")
        p.set_defaults(func=func)

    p = sub.add_parser("run", help="the daily job: assess every child, raise alerts, write them to the store")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--date", help="YYYY-MM-DD, default today")
    p.add_argument("--claude", action="store_true", help="Claude reads notes and writes each child's daily summary")
    p.add_argument("--language", default="English", help="language of the daily summaries")
    p.add_argument("--dry-run", action="store_true", help="print decisions without writing them")
    p.set_defaults(func=_run)

    p = sub.add_parser("serve", help="JSON API for the app's care tab (localhost, secret in CLOSER_AI_TOKEN)")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--no-claude", action="store_true", help="template summaries and the lexicon only")
    p.add_argument("--language", default="English", help="language of the daily summaries")
    p.set_defaults(func=_serve)

    p = sub.add_parser("add-drawing", help="analyze a drawing image; with --patient, store its reading")
    p.add_argument("image")
    p.add_argument("--patient", help="patient id; without it the reading is only printed")
    p.add_argument("--date", help="YYYY-MM-DD, default today")
    p.add_argument("--title")
    p.add_argument("--shared", action="store_true", help="the child shared it with the care team")
    p.add_argument("--emotion", type=int, choices=range(1, 6), help="the emoji the child picked, 1..5")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--no-claude", action="store_true", help="colors only")
    p.set_defaults(func=_add_drawing)

    p = sub.add_parser("alerts", help="the psychologist's inbox")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--date", help="YYYY-MM-DD, default all dates")
    p.set_defaults(func=_alerts)

    p = sub.add_parser("review", help="record the psychologist's review of an alert (a training label)")
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--alert", type=int, required=True)
    p.add_argument("--outcome", choices=("support_needed", "not_needed", "already_followed"), required=True)
    p.add_argument("--by", required=True, help="reviewer name")
    p.add_argument("--note")
    p.set_defaults(func=_review)

    p = sub.add_parser("eval-reader", help="lexicon vs Claude on simulated notes (calls the API once per note)")
    p.add_argument("--n", type=int, default=120)
    p.set_defaults(func=_eval_reader)

    args = parser.parse_args(argv)
    args.func(args)
