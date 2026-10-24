"""The daily job: read the store, assess, shield, decide, explain, write back.

    signals (SQLite) -> features -> assessor (belief) -> shield (rules + Claude) -> RL agent
                     -> Whittle index, distilled rule, explanation -> ai_assessments / ai_alerts

Run it every evening after the last check-ins (or more often: it is idempotent per day).
"""

from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np

from .assessor import DISTRESS, Assessor, level
from .features import FeatureBuilder
from .policy.baselines import PPOPolicy
from .policy.obs import ACTIONS, DIGEST, PRIORITY, WAIT, action_mask, observe, with_screenings
from .policy.whittle import indices_from
from .safety import ALERT_FOR_LEVEL, SafetyFlag, check_text, most_severe
from .store import PatientData, Store
from .text import analyze_note


class ThresholdFallback:
    """Used when no trained agent is available: P(distress) threshold with a 3-day cooldown."""

    version = "threshold"

    def __init__(self, tau: float = 0.5):
        self.tau = tau

    def act_obs(self, obs: np.ndarray, mask: np.ndarray) -> int:
        p_distress, days_since_alert = obs[2], obs[7] * 14
        if days_since_alert < 3:
            return WAIT
        if p_distress >= 0.8 and mask[PRIORITY]:
            return PRIORITY
        return DIGEST if p_distress >= self.tau and mask[DIGEST] else WAIT


def load_policy(artifacts: Path):
    """The trained agent at its deployment price lambda, or the threshold fallback."""
    meta_path = artifacts / "policy.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    path = artifacts / "policy.zip"
    if not path.exists():
        return ThresholdFallback(), meta
    policy = PPOPolicy(path, float(meta.get("lambda", 1.0)))
    policy.version = "ppo-" + hashlib.sha1(path.read_bytes()).hexdigest()[:8]
    return policy, meta


@dataclass
class Decision:
    patient_id: str
    nickname: str
    for_date: date
    probs: np.ndarray
    level: str
    factors: list[dict]
    action: str
    urgency: float | None
    rule: list[str]
    alerts: list[dict]
    data_days: int
    explanation: str


def _alert_reason(flag: SafetyFlag, where: str) -> str:
    if flag.level == "child_request":
        return "The child asked to talk to someone today"
    what = flag.category.removeprefix("claude_").replace("_", " ")
    if flag.level == "crisis":
        return f"Safety rule: possible {what} in today's {where}"
    return f"Safety rule: strong statement in today's {where}"


def template_explanation(level_name: str, probs: np.ndarray, factors: list[dict], action: str,
                         urgency: float | None) -> str:
    signals = "; ".join(f["text"] for f in factors) or "no single signal stands out"
    text = f"{level_name.capitalize()} (P(distress) {probs[DISTRESS]:.0%}). Main signals: {signals}. Decision: {action}"
    return text + (f" (urgency index {urgency:.2f})." if urgency is not None else ".")


def decide(data: PatientData, assessor: Assessor, policy, reader=None, explainer=None, tree=None,
           model_version: str = "") -> Decision:
    h = data.history
    t = len(h.days) - 1
    today = h.days[t]
    builder = FeatureBuilder(h.profile, h.context, reader.note_analyzer if reader else analyze_note)
    for record in h.days:
        builder.append(record)
    X = builder.matrix()
    probs = np.array([with_screenings(p, data.state.screenings, k) for k, p in enumerate(assessor.predict_proba(X))])
    factors = assessor.explain(X[t])
    lam = getattr(policy, "lam", 1.0)

    # Shield: rules first, then Claude's second reading. Either can raise an alert; nothing can lower one.
    flags = [(f, "check-in note") for f in check_text(today.note)]
    flags += [(f, "drawing") for d in today.shared_drawings for f in check_text(d.title)]
    if today.wants_to_talk:
        flags.append((SafetyFlag("child_request", "wants_to_talk", ""), ""))
    if reader:
        texts = [(today.note, "check-in note")] + [(d.title, "drawing") for d in today.shared_drawings if d.title]
        for text, where in texts:
            reading = reader.read_note(text) if text else None
            if reading and (flag := reading.flag(text)):
                flags.append((flag, where))
    state = copy.deepcopy(data.state)
    alerts = []
    worst = most_severe([f for f, _ in flags])
    if worst is not None:
        where = next(w for f, w in flags if f is worst)
        source, priority = ALERT_FOR_LEVEL[worst.level]
        alerts.append({"source": source, "priority": priority, "reason": _alert_reason(worst, where),
                       "evidence": {"excerpt": worst.excerpt, "category": worst.category,
                                    "detected_by": "claude" if worst.category.startswith("claude_") else "rules"}})
        state.alerts.append((t, source, priority))

    profile = h.profile
    day_of_stay = (today.day - profile.admitted_on).days if profile.admitted_on else t
    concern_3d = sum(builder.ch["note_concern"][max(0, t - 2): t + 1])
    obs = observe(list(probs), [r.checked_in for r in h.days], t, state, profile.age, day_of_stay,
                  profile.has_family, concern_3d, lam)
    mask = action_mask(state, t, profile.age)
    action = policy.act_obs(obs, mask)
    urgency = float(indices_from(policy, obs[None], mask[None])[0]) if isinstance(policy, PPOPolicy) else None
    rule = tree.path(obs) if tree is not None else []
    lvl = level(probs[t])
    if action in (DIGEST, PRIORITY):
        reason = f"AI triage ({lvl}, P(distress) {probs[t][DISTRESS]:.0%}): " + "; ".join(f["text"] for f in factors)
        alerts.append({"source": "policy", "priority": ACTIONS[action], "reason": reason[:300],
                       "evidence": {"factors": factors, "urgency": urgency, "lambda": lam, "rule": rule}})

    explanation = template_explanation(lvl, probs[t], factors, ACTIONS[action], urgency)
    if explainer is not None:
        facts = {
            "age": profile.age, "day_of_stay": day_of_stay, "level": lvl,
            "probabilities": {"stable": round(float(probs[t][0]), 2), "fragile": round(float(probs[t][1]), 2),
                              "distress": round(float(probs[t][2]), 2)},
            "main_signals": [f["text"] for f in factors], "decision": ACTIONS[action],
            "urgency_index": urgency, "rule_checked": rule, "check_ins_last_7_days": int(sum(builder.ch["checked_in"][-7:])),
            "safety_alerts": [a["reason"] for a in alerts if a["source"] != "policy"],
        }
        explanation = explainer.explain(facts) or explanation
    for alert in alerts:
        alert["evidence"]["explanation"] = explanation

    return Decision(
        patient_id=profile.patient_id, nickname=data.nickname, for_date=today.day, probs=probs[t], level=lvl,
        factors=factors, action=ACTIONS[action], urgency=urgency, rule=rule, alerts=alerts,
        data_days=int(sum(builder.ch["checked_in"][-7:])), explanation=explanation,
    )


def run_daily(store: Store, assessor: Assessor, policy, today: date, reader=None, explainer=None, tree=None,
              write: bool = True) -> list[Decision]:
    version = f"{assessor.version}+{getattr(policy, 'version', 'policy')}"
    decisions = [decide(data, assessor, policy, reader, explainer, tree, version) for data in store.load(today)]
    if write:
        for d in decisions:
            assessment_id = store.save_assessment({
                "patient_id": d.patient_id, "for_date": d.for_date.isoformat(), "level": d.level,
                "p_stable": float(d.probs[0]), "p_fragile": float(d.probs[1]), "p_distress": float(d.probs[2]),
                "factors": d.factors, "data_days": d.data_days, "policy_action": d.action, "urgency": d.urgency,
                "model_version": version,
            })
            for alert in d.alerts:
                store.save_alert(alert | {"patient_id": d.patient_id, "for_date": d.for_date.isoformat(),
                                          "model_version": version,
                                          "evidence": alert["evidence"] | {"assessment_id": assessment_id}})
    rank = {"urgent": 0, "priority": 1, "digest": 2}
    return sorted(decisions, key=lambda d: (min((rank[a["priority"]] for a in d.alerts), default=3),
                                            -(d.urgency or 0), -d.probs[DISTRESS]))
