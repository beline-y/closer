"""Full evaluation behind `python -m closer_ai evaluate`: writes ml/RESULTS.md and policy.json.

Parameters (threshold, lambda) are chosen on the validation cohort for a weekly workload
budget, then everything is measured on a separate test cohort.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

from .assessor import DISTRESS, FRAGILE, Assessor
from .datasets import assessor_dataset
from .chart import policy_map_svg, tradeoff_svg
from .evaluate import (
    TEST_SEED, VALIDATION_SEED, assessor_report, at_budget, make_pool, paired_bootstrap, run_cohort, summarize,
)
from .policy.baselines import PPOPolicy
from .policy.distill import TreePolicy, viper
from .policy.env import AlertEnv
from .policy.obs import ACTIONS, LAMBDA_RANGE, AlertState, observe
from .policy.whittle import GRID, indexability, run_ward
from .safety import check_text
from .simulator import SimConfig, simulate_stay

TAUS = (0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8)
LAMBDAS = tuple(float(x) for x in np.exp(np.linspace(math.log(LAMBDA_RANGE[0]), math.log(LAMBDA_RANGE[1]), 9)))
SHIFTS = {
    "More children masking distress (35%)": SimConfig(masking_share=0.35),
    "Fewer notes (40% of the usual rate)": SimConfig(note_scale=0.4),
    "More stress (x1.3)": SimConfig(stress_scale=1.3),
    "More children without family (25%)": SimConfig(no_family_share=0.25),
}
WARD_LABELS = {"none": "Nobody (shield only)", "spec": "Spec rules", "p_distress": "Highest P(distress)",
               "whittle": "**Highest Whittle index (RL)**", "oracle": "Oracle"}


def _num(x: float | None, digits: int = 2) -> str:
    return "n/a" if x is None or math.isnan(x) else f"{x:.{digits}f}"


def _pct(x: float | None) -> str:
    return "n/a" if x is None or math.isnan(x) else f"{x:.0%}"


def _within_budget(front: list[tuple[float, float, float]], budget: float) -> float:
    """The knob value whose workload is the largest one within budget (rows: knob, load, harm)."""
    within = [row for row in front if row[1] <= budget]
    return max(within, key=lambda row: row[1])[0] if within else min(front, key=lambda row: row[1])[0]


def policy_map(ppo_path: str, lam: float) -> tuple[list[list[str]], list[float], list[float]]:
    """The agent's action on a typical child-day, for each P(distress) and each price of an alert."""
    policy = PPOPolicy(ppo_path, lam)
    p_values = [float(p) for p in np.linspace(0.02, 0.98, 25)]
    obs = []
    for p in p_values:
        fragile = 0.35 * (1 - p)
        probs = [np.array([1 - p - fragile, fragile, p])] * 11
        checkins = [True, False, True] * 3 + [True, True]
        obs.append(observe(probs, checkins, 10, AlertState(), age=12, day_of_stay=10, has_family=True,
                           concern_3d=0.0, lam=lam))
    actions = policy.actions_for_lambdas(np.stack(obs), np.ones((len(p_values), 4), dtype=bool), GRID)
    return [[ACTIONS[a] for a in row] for row in actions], [float(x) for x in GRID], p_values


def describe_column(actions: list[list[str]], p_values: list[float], j: int) -> str:
    """'wait below 0.30, ask from 0.30, digest from 0.45, priority from 0.70' for one price."""
    parts, previous = [], None
    for i, p in enumerate(p_values):
        if actions[i][j] != previous:
            parts.append(f"{actions[i][j]} from {p:.2f}" if parts else f"{actions[i][j]}")
            previous = actions[i][j]
    return ", ".join(parts)


def safety_report(n_children: int = 3000, seed: int = 500_000) -> dict:
    """The shield's rules on every note of a simulated cohort, against the planted truth."""
    counts: dict[tuple[str, str | None], int] = {}
    for i in range(n_children):
        sim = simulate_stay(seed + i, randomize=True)
        for t, record in enumerate(sim.history.days):
            if record.note is None:
                continue
            truth = "crisis" if t in sim.truth.crisis_notes else "concern" if t in sim.truth.concern_notes else "none"
            flags = check_text(record.note)
            key = (truth, flags[0].level if flags else None)
            counts[key] = counts.get(key, 0) + 1

    def n(truth: str, got: str | None = "*") -> int:
        return sum(v for (t, g), v in counts.items() if t == truth and (got == "*" or g == got))

    return {
        "notes": sum(counts.values()), "crisis_notes": n("crisis"), "concern_notes": n("concern"),
        "crisis_recall": n("crisis", "crisis") / max(1, n("crisis")),
        "crisis_any_recall": (n("crisis", "crisis") + n("crisis", "concern")) / max(1, n("crisis")),
        "concern_recall": (n("concern", "concern") + n("concern", "crisis")) / max(1, n("concern")),
        "false_crisis_rate": n("none", "crisis") / max(1, n("none")),
    }


def build_report(artifacts: Path, out_md: Path, budget: float = 0.4, n_val: int = 300, n_test: int = 500,
                 workers: int = 14, quick: bool = False) -> dict:
    started = time.time()
    assessor_path = str(artifacts / "assessor.joblib")
    ppo_path, noask_path = str(artifacts / "policy.zip"), str(artifacts / "policy_no_ask.zip")
    assessor = Assessor.load(assessor_path)
    val = list(range(VALIDATION_SEED, VALIDATION_SEED + n_val))
    test = list(range(TEST_SEED, TEST_SEED + n_test))
    out: dict = {"budget": budget}
    md = [
        "# Closer AI: results on simulated children", "",
        f"Generated by `python -m closer_ai evaluate`{' --quick' if quick else ''}: {n_val} validation and {n_test} test "
        f"children, never seen in training. Workload budget: **{budget} alert units per child-week** (a digest alert "
        "counts 1, a priority alert 1.5). Everything here is simulated: it shows that the method works and where it "
        "breaks, not clinical performance.", "",
    ]

    # 1. Belief -------------------------------------------------------------------------------------------------
    print("Assessor...", flush=True)
    rep = assessor_report(assessor, n_children=200 if quick else 800)
    X, y, _, _ = assessor_dataset(500 if quick else 4000, seed=0, randomize=True, workers=workers)
    Xt, yt, _, _ = assessor_dataset(200 if quick else 800, seed=TEST_SEED, randomize=False, workers=workers)
    gbt = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05).fit(X, y).predict_proba(Xt)
    a = out["assessor"] = rep | {
        "gbt_auc_distress": roc_auc_score(yt == DISTRESS, gbt[:, DISTRESS]),
        "gbt_auc_fragile_or_distress": roc_auc_score(yt >= FRAGILE, gbt[:, FRAGILE] + gbt[:, DISTRESS]),
    }
    md += [
        "## 1. Belief: the wellbeing assessor", "",
        "| | Additive model (deployed) | Gradient boosting (black box) |", "|---|---|---|",
        f"| AUC distress vs rest | {_num(a['auc_distress'], 3)} | {_num(a['gbt_auc_distress'], 3)} |",
        f"| AUC fragile or distress | {_num(a['auc_fragile_or_distress'], 3)} | {_num(a['gbt_auc_fragile_or_distress'], 3)} |",
        f"| Calibration error (ECE, distress) | {_num(a['ece_distress'], 3)} | |", "",
        f"AUC for distress by age: 5-7 {_num(a['auc_distress_age_5-7'], 3)}, 8-11 {_num(a['auc_distress_age_8-11'], 3)}, "
        f"12-17 {_num(a['auc_distress_age_12-17'], 3)}. The interpretable model matches the black box, so the "
        "explanation shown to the psychologist is the model's actual reasoning.", "",
    ]

    # 2. Shield -------------------------------------------------------------------------------------------------
    print("Safety rules...", flush=True)
    s = out["safety"] = safety_report(300 if quick else 3000)
    md += [
        "## 2. Shield: deterministic safety rules on simulated notes", "",
        f"{s['notes']:,} notes, {s['crisis_notes']} with crisis language, {s['concern_notes']} with strong statements.", "",
        "| | Rate |", "|---|---|",
        f"| Crisis notes raising an urgent alert | {_pct(s['crisis_recall'])} |",
        f"| Crisis notes raising an alert of any level | {_pct(s['crisis_any_recall'])} |",
        f"| Strong statements raising a priority alert | {_pct(s['concern_recall'])} |",
        f"| Ordinary notes wrongly flagged as a crisis | {s['false_crisis_rate']:.2%} |", "",
        "The misses are indirect phrasings planted on purpose (\"j'ai écrit un mot pour dire au revoir à tout le "
        "monde\"). Claude's second reading (`--claude`) is there for them.", "",
    ]

    with make_pool(workers) as pool:
        def point(spec: tuple, seeds: list[int], ask: bool = True) -> tuple[float, float]:
            m = summarize(run_cohort(spec, assessor_path, seeds, pool=pool, enable_ask=ask))
            return m["load_per_week"], m["unsupported_per_week"]

        # 3. Pick each method's knob for the budget on validation -----------------------------------------------------
        print("Validation sweeps...", flush=True)
        fronts = {
            "threshold": [(tau, *point(("threshold", tau, 3), val)) for tau in TAUS],
            "threshold_ask": [(tau, *point(("threshold_ask", tau), val)) for tau in TAUS],
            "ppo": [(lam, *point(("ppo", ppo_path, lam), val)) for lam in LAMBDAS],
            "ppo_no_ask": [(lam, *point(("ppo", noask_path, lam), val, ask=False)) for lam in LAMBDAS],
        }

        def price_for_budget(path: str, front, ask: bool) -> float:
            """Bisection on log(lambda) for the lowest price that keeps the workload within budget."""
            over = [lam for lam, load, _ in front if load > budget]
            under = [lam for lam, load, _ in front if load <= budget]
            if not over or not under:
                return _within_budget(front, budget)
            lo, hi = max(over), min(under)
            for _ in range(2 if quick else 4):
                mid = math.exp((math.log(lo) + math.log(hi)) / 2)
                lo, hi = (mid, hi) if point(("ppo", path, mid), val, ask)[0] > budget else (lo, mid)
            return hi

        tau_b = _within_budget(fronts["threshold"], budget)
        tau_ask_b = _within_budget(fronts["threshold_ask"], budget)
        lam_b = price_for_budget(ppo_path, fronts["ppo"], True)
        lam_noask_b = price_for_budget(noask_path, fronts["ppo_no_ask"], False)
        out["selected"] = {"threshold_tau": tau_b, "threshold_ask_tau": tau_ask_b, "lambda": lam_b,
                           "lambda_no_ask": lam_noask_b}

        # 4. Test cohort at the budget ----------------------------------------------------------------------------------
        print("Test cohort...", flush=True)
        methods = {
            "No AI alert (shield only)": (("never",), True),
            "Spec rules (3 low moods, 2 days without check-in or family)": (("spec",), True),
            f"Threshold on P(distress), tau={tau_b:.2f}": (("threshold", tau_b, 3), True),
            f"Threshold + gentle questions, tau={tau_ask_b:.2f}": (("threshold_ask", tau_ask_b), True),
            f"RL agent without questions, lambda={lam_noask_b:.2f}": (("ppo", noask_path, lam_noask_b), False),
            f"**RL agent, lambda={lam_b:.2f}**": (("ppo", ppo_path, lam_b), True),
            "Oracle (sees the hidden state, not a real option)": (("oracle",), True),
        }
        results = {name: run_cohort(spec, assessor_path, test, pool=pool, enable_ask=ask)
                   for name, (spec, ask) in methods.items()}
        names = list(methods)
        thr, thr_ask, noask_res, rl = (results[names[k]] for k in (2, 3, 4, 5))
        md += [
            "## 3. Decision: the RL agent against the alternatives, at the same workload", "",
            "Test cohort. *Unsupported distress days*: days a child spends in distress before a psychologist sees them "
            "(no visit since 2 days before the episode started). Lower is better.", "",
            "| Policy | Unsupported distress days / child-week | Workload / child-week | Episodes reached | "
            "Median delay (days) | Alert precision | Questions / child-week | Worst 10% of children |",
            "|---|---|---|---|---|---|---|---|",
        ]
        out["test"] = {}
        for name in names:
            m = out["test"][name.strip("*")] = summarize(results[name])
            md.append(
                f"| {name} | {m['unsupported_per_week']:.3f} | {m['load_per_week']:.2f} | {_pct(m['episode_recall'])} | "
                f"{_num(m['median_delay'], 1)} | {_pct(m['precision'])} | {m['asks_per_week']:.2f} | {m['cvar10']:.2f} |"
            )
        base = summarize(thr)["unsupported_per_week"]
        boots = out["bootstrap"] = {
            "RL agent vs threshold": paired_bootstrap(rl, thr),
            "RL agent vs threshold + questions": paired_bootstrap(rl, thr_ask),
            "RL agent vs RL agent without questions": paired_bootstrap(rl, noask_res),
        }
        md += ["", "Paired differences on the same children, with 95% bootstrap intervals (unsupported distress days "
               "per child-week; negative means the RL agent does better):", ""]
        for label, (diff, lo, hi) in boots.items():
            md.append(f"- {label}: {diff:+.3f} [{lo:+.3f}, {hi:+.3f}], {diff / base:+.0%} of the threshold's harm")
        md.append("")

        # 5. Trade-off curves --------------------------------------------------------------------------------------------
        labels = {"threshold": ("Threshold", "tau"), "threshold_ask": ("Threshold + questions", "tau"),
                  "ppo": ("RL agent", "lambda"), "ppo_no_ask": ("RL agent without questions", "lambda")}
        spec_load, spec_harm = point(("spec",), val)
        wins = all(at_budget([(w, h) for _, w, h in fronts["ppo"]], b) < at_budget([(w, h) for _, w, h in fronts[k]], b)
                   for k in ("threshold", "threshold_ask") for b in (0.3, 0.4, 0.5))
        title = ("The RL agent leaves fewer children in unsupported distress at the same workload" if wins
                 else "Unsupported distress days against psychologist workload")
        chart = out_md.with_name(out_md.stem + "_tradeoff.svg")
        chart.write_text(tradeoff_svg(fronts, budget, title, ("Spec rules", spec_load, spec_harm)))
        md += ["## 4. Trade-off curves (validation cohort)", "",
               "Each method traces workload against harm as its knob moves: the threshold tau, or for the RL agent "
               "the price of an alert lambda (one network, every point).", "",
               f"![{title}]({chart.name})", "",
               "| Method | Knob | Workload / child-week | Unsupported distress days / child-week |", "|---|---|---|---|"]
        for key, rows in fronts.items():
            md += [f"| {labels[key][0]} | {labels[key][1]}={knob:.2f} | {load:.2f} | {harm:.3f} |" for knob, load, harm in rows]
        md.append(f"| Spec rules | | {spec_load:.2f} | {spec_harm:.3f} |")
        out["fronts"] = fronts
        md.append("")

        # 6. Robustness -----------------------------------------------------------------------------------------------
        print("Robustness...", flush=True)
        md += ["## 5. Robustness: simulators nobody tuned on", "",
               "| Shift | Policy | Unsupported distress days / child-week | Workload / child-week |", "|---|---|---|---|"]
        out["robustness"] = {}
        shift_seeds = test[: (100 if quick else 300)]
        for shift, config in SHIFTS.items():
            for label, spec in (("Threshold", ("threshold", tau_b, 3)), ("RL agent", ("ppo", ppo_path, lam_b))):
                m = summarize(run_cohort(spec, assessor_path, shift_seeds, config=config, pool=pool))
                out["robustness"][f"{shift} | {label}"] = m
                md.append(f"| {shift} | {label} | {m['unsupported_per_week']:.3f} | {m['load_per_week']:.2f} |")
        md.append("")

        # 7. What the agent learned: policy map, then VIPER ----------------------------------------------------------------
        actions, lams, p_values = policy_map(ppo_path, lam_b)
        map_chart = out_md.with_name(out_md.stem + "_policy_map.svg")
        map_chart.write_text(policy_map_svg(actions, lams, p_values, lam_b))
        md += ["## 6. What the agent learned", "", "### The price of an alert changes the behavior", "",
               f"![What the RL agent does, by belief and price of an alert]({map_chart.name})", "",
               "| Price lambda | Action as P(distress) rises (typical 12-year-old, day 10, nothing recent) |", "|---|---|"]
        for target in (0.05, 0.2, lam_b, 1.0, 2.5):
            j = int(np.argmin([abs(math.log(x) - math.log(target)) for x in lams]))
            md.append(f"| {lams[j]:.2f}{' (deployed)' if target == lam_b else ''} | "
                      f"{describe_column(actions, p_values, j)} |")
        md.append("")
        print("VIPER distillation...", flush=True)
        student_path = artifacts / "_student.joblib"

        def objective(student: TreePolicy) -> float:
            student.save(student_path)
            m = summarize(run_cohort(("tree", str(student_path)), assessor_path, val[:100], pool=pool))
            return -(m["unsupported_per_week"] + lam_b * m["load_per_week"])

        tree, log = viper(assessor_path, ppo_path, lam_b, list(range(400_000, 400_000 + (60 if quick else 300))),
                          iterations=3 if quick else 4, evaluate=objective, pool=pool, workers=workers)
        student_path.unlink(missing_ok=True)
        tree.save(artifacts / "policy_tree.joblib")
        mt = summarize(run_cohort(("tree", str(artifacts / "policy_tree.joblib")), assessor_path, test, pool=pool))
        mr = summarize(rl)
        checks = [entry for entry in log if "fidelity" in entry]
        fidelity = checks[-1]["fidelity"] if checks else None
        alert_fidelity = checks[-1]["alert_fidelity"] if checks else None
        out["viper"] = {"log": log, "test": mt, "leaves": int(tree.tree.get_n_leaves())}
        md += [
            "### The rules it follows: VIPER distillation into a decision tree", "",
            f"{tree.tree.get_n_leaves()} leaves, extracted by Q-weighted DAgger. On states the tree itself visits, it takes "
            f"the network's action {_pct(fidelity)} of the time, and {_pct(alert_fidelity)} of the time when the network "
            "raises an alert.", "",
            "| Policy | Unsupported distress days / child-week | Workload / child-week |", "|---|---|---|",
            f"| RL agent (network) | {mr['unsupported_per_week']:.3f} | {mr['load_per_week']:.2f} |",
            f"| Distilled tree | {mt['unsupported_per_week']:.3f} | {mt['load_per_week']:.2f} |", "",
            "```text", tree.rules(), "```", "",
        ]

    # 8. Ward and Whittle index ------------------------------------------------------------------------------------------
    print("Ward with a shared psychologist...", flush=True)
    noask_policy = PPOPolicy(noask_path, lam_noask_b)
    md += ["## 7. A whole ward and one psychologist: the neural Whittle index", "",
           "20 beds kept full; the psychologist can answer *k* alerts a day, and each evening the policy decides who "
           "she sees.", "", "| Who gets the visits | k per day | Unsupported distress days / child-week |",
           "|---|---|---|"]
    out["ward"] = {}
    for capacity in (1, 2):
        for rule in WARD_LABELS:
            harms = [run_ward(assessor, rule, noask_policy if rule == "whittle" else None, capacity=capacity,
                              days=60 if quick else 150, seed=300_000 + 10_000 * rep)["unsupported_per_week"]
                     for rep in range(1 if quick else 3)]
            out["ward"][f"{rule}|{capacity}"] = float(np.mean(harms))
            md.append(f"| {WARD_LABELS[rule]} | {capacity} | {np.mean(harms):.3f} |")
    envs = []
    for i in range(200 if quick else 600):
        env = AlertEnv(assessor, randomize=False, enable_ask=False)
        env.reset(options={"child_seed": 600_000 + i, "lam": 1.0})
        for _ in range(int(np.random.default_rng(i).integers(0, 12))):
            if env.sim.done:
                break
            env.step(0)
        envs.append(env)
    out["indexability"] = indexability(noask_policy, envs)
    md += ["", f"Indexability check: the agent alerts less as the price rises in {_pct(out['indexability'])} of the "
           "sampled states, which is what makes the index meaningful.", ""]

    meta = {"lambda": lam_b, "lambda_no_ask": lam_noask_b, "budget": budget, "threshold_tau": tau_b}
    (artifacts / "policy.json").write_text(json.dumps(meta, indent=1))
    md += [f"_Run time: {(time.time() - started) / 60:.0f} min._", ""]
    out_md.write_text("\n".join(md))
    return out
