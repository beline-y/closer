"""Policies to compare against: what the spec does today, sensible heuristics, an oracle.

Every policy maps the current env to an action. Baselines only read what production
would have (features, belief, alert history); the oracle cheats on purpose, as a bound.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..features import INDEX
from ..simulator import DISTRESS, FRAGILE
from .obs import ASK, DIGEST, PRIORITY, WAIT, lambda_feature


def _allowed(env, action: int) -> int:
    return action if env.action_masks()[action] else WAIT


def _days_since_alert(env) -> int:
    days = [d for d, _, _ in env.state.alerts]
    return env.sim.t - max(days) if days else 10**6


class NeverAlert:
    name = "No AI alert (safety rules only)"

    def act(self, env) -> int:
        return WAIT


class SpecRules:
    """The care-team alert rules from docs/SPEC.md, sent to the digest."""

    name = "Spec rules (3 low moods, 2 days silent)"

    def act(self, env) -> int:
        x = env.features
        triggered = (
            x[INDEX["low_mood_streak"]] >= 3 or x[INDEX["days_since_checkin"]] >= 2
            or x[INDEX["days_since_family_contact"]] >= 2
        )
        return _allowed(env, DIGEST) if triggered and _days_since_alert(env) >= 3 else WAIT


class Threshold:
    """Alert when the assessor's P(distress) crosses a threshold, with a cooldown."""

    def __init__(self, tau: float, cooldown: int = 3):
        self.tau, self.cooldown = tau, cooldown
        self.name = f"Threshold on P(distress) (tau={tau:.2f})"

    def act(self, env) -> int:
        p = env.probs[-1][DISTRESS]
        if _days_since_alert(env) < self.cooldown:
            return WAIT
        if p >= min(0.95, self.tau + 0.3):
            return _allowed(env, PRIORITY)
        return _allowed(env, DIGEST) if p >= self.tau else WAIT


class ThresholdAsk(Threshold):
    """Hand-made value-of-information heuristic: ask when unsure, act on the answer."""

    def __init__(self, tau: float, band: float = 0.2, cooldown: int = 3):
        super().__init__(tau, cooldown)
        self.band = band
        self.name = f"Threshold + questions (tau={tau:.2f})"

    def act(self, env) -> int:
        t = env.sim.t
        recent = [s for d, s in env.state.screenings if t - 3 < d <= t]
        if recent and _days_since_alert(env) >= self.cooldown:
            if recent[-1] >= 0.6:
                return _allowed(env, PRIORITY)
            if recent[-1] >= 0.35:
                return _allowed(env, DIGEST)
        action = super().act(env)
        if action == WAIT and env.probs[-1][DISTRESS] >= self.tau - self.band:
            return _allowed(env, ASK)
        return action


class Oracle:
    """Knows the hidden state. Not a real option: it bounds what any policy could do."""

    name = "Oracle (sees the hidden state)"

    def act(self, env) -> int:
        z, t = env.sim.state, env.sim.t
        visits = env.sim.truth.psy_visits
        if z == DISTRESS and not any(env.episode_start - 2 <= v <= t for v in visits):
            return _allowed(env, PRIORITY)
        if z == FRAGILE and not any(t - 6 <= v <= t for v in visits):
            return _allowed(env, DIGEST)
        return WAIT


class PPOPolicy:
    """The trained agent, at a fixed price of an alert lambda."""

    def __init__(self, model_or_path, lam: float, name: str | None = None):
        if isinstance(model_or_path, (str, Path)):
            from sb3_contrib import MaskablePPO

            model_or_path = MaskablePPO.load(str(model_or_path), device="cpu")
        self.model = model_or_path
        self.lam = lam
        self.name = name or f"RL agent (lambda={lam:.2f})"

    def act(self, env) -> int:
        env.lam = self.lam
        return self.act_obs(env.obs, env.action_masks())

    def act_obs(self, obs: np.ndarray, mask: np.ndarray) -> int:
        obs = np.array(obs, dtype=np.float32)
        obs[-1] = lambda_feature(self.lam)
        action, _ = self.model.predict(obs, action_masks=mask, deterministic=True)
        return int(action)

    def actions_for_lambdas(self, obs: np.ndarray, masks: np.ndarray, lams: np.ndarray) -> np.ndarray:
        """Greedy action for each (child, lambda) pair in one batch: shape (n_children, n_lambdas)."""
        import torch

        n, k = len(obs), len(lams)
        batch = np.repeat(obs[:, None, :], k, axis=1).reshape(n * k, -1).copy()
        batch[:, -1] = np.tile([lambda_feature(lam) for lam in lams], n)
        with torch.no_grad():
            dist = self.model.policy.get_distribution(self.model.policy.obs_to_tensor(batch)[0],
                                                      action_masks=np.repeat(masks, k, axis=0))
            actions = dist.distribution.probs.argmax(dim=1).cpu().numpy()
        return actions.reshape(n, k)
