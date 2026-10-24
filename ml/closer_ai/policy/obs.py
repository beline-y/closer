"""Observation, action mask and alert bookkeeping, shared by the simulator env and production.

Keeping one implementation for both is what makes the trained policy safe to run on real
data: the policy sees exactly the same quantities in training and in the daily job.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

WAIT, DIGEST, PRIORITY, ASK = 0, 1, 2, 3
ACTIONS = ("wait", "digest", "priority", "ask")
ALERT_LOAD = {DIGEST: 1.0, PRIORITY: 1.5}  # psychologist workload units

LAMBDA_RANGE = (0.05, 5.0)  # price of one workload unit, in "unsupported distress days"
MIN_ASK_AGE = 8  # validated self-report scales start around this age
# Answer distribution of the validated scale for each hidden state (normalized score). For a real scale these
# come from its validation study; here they are the simulator's.
SCREENING_MEANS = np.array([0.15, 0.45, 0.75])
SCREENING_SD = 0.12

OBS_NAMES = (
    "p_stable", "p_fragile", "p_distress", "p_distress_change", "p_distress_max_3d",
    "checkins_3d", "days_since_checkin", "days_since_alert", "days_since_psy_contact", "alerts_7d",
    "screening_recent", "screening_score", "days_since_ask", "age", "day_of_stay", "has_family",
    "forced_alert_today", "concern_3d", "log_lambda",
)


@dataclass
class AlertState:
    """What the system knows about past alerts, psychologist contacts and gentle questions.

    Days are indices in the child's history (0 = first day).
    """

    alerts: list[tuple[int, str, str]] = field(default_factory=list)  # (day, source, priority)
    psy_contacts: list[int] = field(default_factory=list)
    asks: list[int] = field(default_factory=list)
    screenings: list[tuple[int, float]] = field(default_factory=list)

    def days_since(self, days: list[int], t: int, cap: int) -> int:
        past = [d for d in days if d <= t]
        return min(t - max(past), cap) if past else cap


def with_screenings(probs: np.ndarray, screenings: list[tuple[int, float]], t: int) -> np.ndarray:
    """Bayes' rule: fold the answers of the last 3 days into the belief (older answers weigh less)."""
    p = np.asarray(probs, dtype=float).copy()
    for day, score in screenings:
        age = t - day
        if 0 <= age < 3:
            likelihood = np.exp(-0.5 * ((score - SCREENING_MEANS) / SCREENING_SD) ** 2)
            p *= likelihood ** (1 - age / 3)
    return p / p.sum()


def lambda_feature(lam: float) -> float:
    lo, hi = LAMBDA_RANGE
    return (math.log(lam) - math.log(lo)) / (math.log(hi) - math.log(lo))


def observe(
    probs: list[np.ndarray], checkins: list[bool], t: int, state: AlertState, age: int, day_of_stay: int,
    has_family: bool, concern_3d: float, lam: float,
) -> np.ndarray:
    """Policy input for day t. `probs` and `checkins` cover days 0..t of the history."""
    p = probs[t]
    yesterday = probs[t - 1][2] if t >= 1 else p[2]
    recent = [s for d, s in state.screenings if t - 3 < d <= t]
    alert_days = [d for d, _, _ in state.alerts]
    agent_alerts = [d for d, source, _ in state.alerts if source == "policy" and t - 7 < d <= t]
    since_checkin = next((back for back in range(min(t, 6) + 1) if checkins[t - back]), min(t + 1, 7))
    obs = [
        p[0], p[1], p[2], float(np.clip(p[2] - yesterday, -1, 1)), max(q[2] for q in probs[max(0, t - 2): t + 1]),
        sum(checkins[max(0, t - 2): t + 1]) / 3, since_checkin / 7,
        state.days_since(alert_days, t, 14) / 14, state.days_since(state.psy_contacts, t, 14) / 14,
        min(len(agent_alerts), 3) / 3,
        float(bool(recent)), recent[-1] if recent else 0.0, state.days_since(state.asks, t, 7) / 7,
        (age - 5) / 12, min(day_of_stay, 42) / 42, float(has_family),
        float(any(d == t and source != "policy" for d, source, _ in state.alerts)),
        min(concern_3d, 1.0), lambda_feature(lam),
    ]
    return np.asarray(obs, dtype=np.float32)


def action_mask(state: AlertState, t: int, age: int, enable_ask: bool = True) -> np.ndarray:
    """The shield's action rules: no alert spam, questions only for older children, not every day."""
    recent_alerts = [(d, priority) for d, _, priority in state.alerts if t - 2 < d <= t]
    mask = np.ones(len(ACTIONS), dtype=bool)
    mask[DIGEST] = not recent_alerts
    mask[PRIORITY] = not any(priority in ("priority", "urgent") for _, priority in recent_alerts)
    mask[ASK] = enable_ask and age >= MIN_ASK_AGE and state.days_since(state.asks, t, 7) >= 3
    return mask
