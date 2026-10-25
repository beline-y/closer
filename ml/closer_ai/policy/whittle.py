"""Neural Whittle index: sharing one psychologist across a whole ward.

A ward is a restless multi-armed bandit: every child (arm) keeps evolving whether or not
the psychologist comes, and she can only see k children a day. Whittle's relaxation
prices each visit at lambda and splits the ward into independent one-child problems,
exactly the problem the lambda-conditioned agent was trained on. The Whittle index of a
child today is the highest price at which the agent still asks for a visit:

    index(child) = max { lambda : policy(obs, lambda) raises an alert }

Ranking children by index and visiting the top k is the classic asymptotically optimal
heuristic (Whittle 1988; Weber & Weiss 1990), here with the index read off the network.
It only makes sense if the problem is indexable (the agent alerts less as lambda rises);
`indexability` measures how often that holds.
"""

from __future__ import annotations

import math

import numpy as np

from ..features import INDEX
from ..simulator import DISTRESS, FRAGILE
from .baselines import PPOPolicy
from .env import AlertEnv
from .obs import DIGEST, LAMBDA_RANGE, PRIORITY, WAIT

GRID = np.exp(np.linspace(math.log(LAMBDA_RANGE[0]), math.log(LAMBDA_RANGE[1]), 25))


def whittle_indices(policy: PPOPolicy, envs: list[AlertEnv]) -> np.ndarray:
    """Index per child: the largest grid price at which the agent still alerts (0 if never)."""
    return indices_from(policy, np.stack([env.obs for env in envs]), np.stack([env.action_masks() for env in envs]))


def indices_from(policy: PPOPolicy, obs: np.ndarray, masks: np.ndarray) -> np.ndarray:
    actions = policy.actions_for_lambdas(obs, masks, GRID)
    alerting = np.isin(actions, (DIGEST, PRIORITY))
    last = np.where(alerting.any(axis=1), alerting.shape[1] - 1 - np.argmax(alerting[:, ::-1], axis=1), -1)
    return np.where(last >= 0, GRID[np.clip(last, 0, None)], 0.0)


def indexability(policy: PPOPolicy, envs: list[AlertEnv]) -> float:
    """Share of states where alerting is monotone (never off-then-on) as the price rises."""
    obs = np.stack([env.obs for env in envs])
    masks = np.stack([env.action_masks() for env in envs])
    alerting = np.isin(policy.actions_for_lambdas(obs, masks, GRID), (DIGEST, PRIORITY)).astype(int)
    return float(np.mean(np.all(np.diff(alerting, axis=1) <= 0, axis=1)))


def _priority(env: AlertEnv, rule: str) -> float:
    if rule == "p_distress":
        return float(env.probs[-1][DISTRESS])
    if rule == "spec":
        x = env.features
        hit = x[INDEX["low_mood_streak"]] >= 3 or x[INDEX["days_since_checkin"]] >= 2 or x[INDEX["days_since_family_contact"]] >= 2
        return float(hit) + 0.01 * float(env.probs[-1][DISTRESS])  # ties broken by the assessor
    if rule == "oracle":
        z, t, visits = env.sim.state, env.sim.t, env.sim.truth.psy_visits
        if z == DISTRESS and not any(env.episode_start - 2 <= v <= t for v in visits):
            return 2.0
        return 1.0 if z == FRAGILE and not any(t - 6 <= v <= t for v in visits) else 0.0
    raise ValueError(rule)


def run_ward(
    assessor, rule: str, policy: PPOPolicy | None = None, beds: int = 20, days: int = 90, capacity: int = 1,
    seed: int = 300_000, min_priority: float = 1e-9,
) -> dict:
    """Simulate a ward for `days` with a psychologist who can answer `capacity` alerts a day.

    rule: "whittle" (needs `policy`), "p_distress", "spec", "oracle" or "none".
    Discharged children are replaced by new admissions, so the ward stays full.
    """
    next_seed = seed
    envs = []
    for _ in range(beds):
        env = AlertEnv(assessor, randomize=False, enable_ask=False)
        env.reset(options={"child_seed": next_seed, "lam": 1.0})
        next_seed += 1
        envs.append(env)
    unsupported = child_days = alerts = 0
    for _ in range(days):
        allowed = [i for i, env in enumerate(envs) if env.action_masks()[PRIORITY]]
        if rule == "whittle":
            scores = whittle_indices(policy, envs)
        elif rule == "none":
            scores = np.zeros(beds)
        else:
            scores = np.array([_priority(env, rule) for env in envs])
        ranked = sorted(allowed, key=lambda i: -scores[i])
        chosen = {i for i in ranked[:capacity] if scores[i] > min_priority}
        for i, env in enumerate(envs):
            _, _, done, _, info = env.step(PRIORITY if i in chosen else WAIT)
            alerts += i in chosen
            child_days += 1
            unsupported += info["harm"] >= 1.0
            if done:
                env.reset(options={"child_seed": next_seed, "lam": 1.0})
                next_seed += 1
    weeks = child_days / 7
    return {"rule": rule, "unsupported_per_week": unsupported / weeks, "alerts_per_week": alerts / weeks}
