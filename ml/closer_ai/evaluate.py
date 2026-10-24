"""Evaluation on held-out simulated cohorts.

Every policy runs on the same children with the same random draws (common random
numbers), so differences come from decisions, not luck, and paired bootstraps are tight.
Seeds: assessor training < 100k, validation 100k+, test 200k+, ward 300k+, RL training 1M+.
"""

from __future__ import annotations

import math
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
from sklearn.metrics import roc_auc_score

from .assessor import Assessor
from .datasets import assessor_dataset
from .policy.baselines import NeverAlert, Oracle, PPOPolicy, SpecRules, Threshold, ThresholdAsk
from .policy.env import AlertEnv
from .policy.obs import DIGEST, PRIORITY
from .simulator import DISTRESS, FRAGILE, SimConfig

VALIDATION_SEED, TEST_SEED = 100_000, 200_000


@dataclass
class ChildResult:
    weeks: float
    distress_days: int = 0
    unsupported_days: int = 0
    fragile_alone_days: int = 0
    episodes: int = 0
    supported: int = 0
    delays: list[int] = field(default_factory=list)
    digests: int = 0
    priorities: int = 0
    forced: int = 0
    asks: int = 0
    useful_alerts: int = 0
    crisis_notes: int = 0
    crisis_caught: int = 0

    @property
    def load(self) -> float:
        return self.digests + 1.5 * self.priorities


def score_stay(env: AlertEnv) -> ChildResult:
    """Outcome of one finished stay, from the hidden truth."""
    z = np.array(env.sim.truth.states)
    visits = sorted(env.sim.truth.psy_visits)
    res = ChildResult(weeks=len(z) / 7)
    t = 0
    while t < len(z):
        if z[t] != DISTRESS:
            if z[t] == FRAGILE and not any(t - 6 <= v <= t for v in visits):
                res.fragile_alone_days += 1
            t += 1
            continue
        start = t
        while t < len(z) and z[t] == DISTRESS:
            res.distress_days += 1
            if not any(start - 2 <= v <= t for v in visits):
                res.unsupported_days += 1
            t += 1
        res.episodes += 1
        helped = [v for v in visits if start - 2 <= v < t]
        if helped:
            res.supported += 1
            res.delays.append(max(0, helped[0] - start))
    for day, source, priority in env.state.alerts:
        if source != "policy":
            res.forced += 1
            if priority == "urgent" and day in env.sim.truth.crisis_notes:
                res.crisis_caught += 1
            continue
        res.digests += priority == "digest"
        res.priorities += priority == "priority"
        res.useful_alerts += bool(z[day] >= FRAGILE or DISTRESS in z[day + 1: day + 3])
    res.asks = len(env.state.asks)
    res.crisis_notes = len(env.sim.truth.crisis_notes)
    return res


def run_child(env: AlertEnv, policy, child_seed: int, lam: float) -> ChildResult:
    env.reset(options={"child_seed": child_seed, "lam": lam})
    done = False
    while not done:
        _, _, done, _, _ = env.step(policy.act(env))
    return score_stay(env)


# -- parallel cohorts ------------------------------------------------------------
@lru_cache(maxsize=4)
def _assessor(path: str) -> Assessor:
    return Assessor.load(path)


@lru_cache(maxsize=8)
def _ppo(path: str):
    from sb3_contrib import MaskablePPO

    return MaskablePPO.load(path, device="cpu")


def make_policy(spec: tuple):
    kind, *args = spec
    if kind == "never":
        return NeverAlert()
    if kind == "spec":
        return SpecRules()
    if kind == "threshold":
        return Threshold(*args)
    if kind == "threshold_ask":
        return ThresholdAsk(*args)
    if kind == "oracle":
        return Oracle()
    if kind == "ppo":
        path, lam = args
        return PPOPolicy(_ppo(path), lam)
    if kind == "tree":
        from .policy.distill import TreePolicy

        return TreePolicy.load(args[0])
    raise ValueError(kind)


def _run_chunk(job: tuple) -> list[ChildResult]:
    import torch

    torch.set_num_threads(1)
    spec, assessor_path, seeds, lam, config, enable_ask = job
    env = AlertEnv(_assessor(assessor_path), config=config, randomize=False, enable_ask=enable_ask)
    policy = make_policy(spec)
    return [run_child(env, policy, s, lam) for s in seeds]


def make_pool(workers: int = 14) -> ProcessPoolExecutor:
    """Worker processes keep the assessor and agents loaded between cohorts."""
    return ProcessPoolExecutor(workers, mp_context=multiprocessing.get_context("forkserver"))


def run_cohort(
    spec: tuple, assessor_path: str, seeds: list[int], lam: float = 1.0, config: SimConfig | None = None,
    enable_ask: bool = True, pool: ProcessPoolExecutor | None = None, workers: int = 14,
) -> list[ChildResult]:
    """Results in seed order, whatever the number of workers."""
    lam = spec[2] if spec[0] == "ppo" else lam
    chunks = [seeds[i::workers] for i in range(workers) if seeds[i::workers]]
    jobs = [(spec, assessor_path, chunk, lam, config, enable_ask) for chunk in chunks]
    parts = list(pool.map(_run_chunk, jobs)) if pool else [_run_chunk(job) for job in jobs]
    ordered: dict[int, ChildResult] = {}
    for chunk, part in zip(chunks, parts):
        ordered.update(zip(chunk, part))
    return [ordered[s] for s in seeds]


# -- metrics -----------------------------------------------------------------------
def summarize(results: list[ChildResult]) -> dict:
    weeks = sum(r.weeks for r in results)
    alerts = sum(r.digests + r.priorities for r in results)
    per_child = np.array([r.unsupported_days / r.weeks for r in results])
    worst = np.sort(per_child)[-max(1, len(per_child) // 10):]
    delays = [d for r in results for d in r.delays]
    crisis = sum(r.crisis_notes for r in results)
    return {
        "unsupported_per_week": sum(r.unsupported_days for r in results) / weeks,
        "fragile_alone_per_week": sum(r.fragile_alone_days for r in results) / weeks,
        "load_per_week": sum(r.load for r in results) / weeks,
        "alerts_per_week": alerts / weeks,
        "asks_per_week": sum(r.asks for r in results) / weeks,
        "episode_recall": sum(r.supported for r in results) / max(1, sum(r.episodes for r in results)),
        "median_delay": float(np.median(delays)) if delays else math.nan,
        "precision": sum(r.useful_alerts for r in results) / alerts if alerts else math.nan,
        "cvar10": float(worst.mean()),
        "crisis_recall": sum(r.crisis_caught for r in results) / crisis if crisis else math.nan,
    }


def paired_bootstrap(a: list[ChildResult], b: list[ChildResult], n: int = 2000, seed: int = 0) -> tuple[float, float, float]:
    """Difference in unsupported distress days per child-week (a - b), with a 95% interval."""
    rng = np.random.default_rng(seed)
    ua, ub = np.array([r.unsupported_days for r in a]), np.array([r.unsupported_days for r in b])
    weeks = np.array([r.weeks for r in a])
    diff = (ua.sum() - ub.sum()) / weeks.sum()
    idx = rng.integers(0, len(a), size=(n, len(a)))
    boots = (ua[idx].sum(1) - ub[idx].sum(1)) / weeks[idx].sum(1)
    return float(diff), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def at_budget(front: list[tuple[float, float]], budget: float) -> float:
    """Harm at a given workload, interpolated along a (load, harm) front."""
    pts = sorted(front)
    loads, harms = np.array([p[0] for p in pts]), np.array([p[1] for p in pts])
    harms = np.minimum.accumulate(harms)  # any policy can waste budget, so harm never increases with load
    if budget <= loads[0]:
        return float(harms[0])
    return float(np.interp(budget, loads, harms))


def assessor_report(assessor: Assessor, n_children: int = 800, seed: int = TEST_SEED) -> dict:
    X, y, _, age = assessor_dataset(n_children, seed=seed, randomize=False)
    P = assessor.predict_proba(X)
    bins = np.clip((P[:, DISTRESS] * 10).astype(int), 0, 9)
    ece = sum(
        np.mean(bins == b) * abs(P[bins == b, DISTRESS].mean() - np.mean(y[bins == b] == DISTRESS))
        for b in range(10) if np.any(bins == b)
    )
    report = {
        "child_days": len(y),
        "auc_distress": roc_auc_score(y == DISTRESS, P[:, DISTRESS]),
        "auc_fragile_or_distress": roc_auc_score(y >= FRAGILE, P[:, FRAGILE] + P[:, DISTRESS]),
        "brier": float(np.mean(np.sum((P - np.eye(3)[y]) ** 2, axis=1))),
        "ece_distress": float(ece),
    }
    for name, (lo, hi) in {"5-7": (5, 7), "8-11": (8, 11), "12-17": (12, 17)}.items():
        m = (age >= lo) & (age <= hi)
        report[f"auc_distress_age_{name}"] = roc_auc_score(y[m] == DISTRESS, P[m, DISTRESS])
    return report


def is_alert(action: int) -> bool:
    return action in (DIGEST, PRIORITY)
