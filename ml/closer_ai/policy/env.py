"""Gymnasium environment: one simulated hospital stay, one decision per evening.

A constrained POMDP. The hidden state is the child's wellbeing; the belief is the
assessor's output. Each evening the agent waits, adds the child to the psychologist's
digest, raises a priority alert, or asks a gentle validated question (an
information-gathering action). The objective is a Lagrangian:

    reward = - harm - lambda * workload - burden

- harm: 1 per day a child spends in distress before anyone knows (no psychologist visit
  since 2 days before the episode started), 0.1 per fragile day without any contact;
- workload: 1 per digest alert, 1.5 per priority alert;
- burden: 0.05 per question asked to the child.

lambda, the price of a psychologist's time, is sampled per episode and given to the agent,
so a single network learns the whole family of policies (multi-objective RL). At deployment
lambda is set to meet the weekly alert budget, or swept to compute Whittle indices.

The shield sits outside the agent: crisis statements and "I'd like to talk" always raise an
alert, and the action mask forbids spam. The agent can make the system more attentive,
never less.
"""

from __future__ import annotations

import copy
import math

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from ..assessor import Assessor
from ..features import FeatureBuilder
from ..safety import ALERT_FOR_LEVEL, check_day, most_severe
from ..simulator import DISTRESS, FRAGILE, ChildSimulator, SimConfig
from .obs import (
    ACTIONS, ALERT_LOAD, ASK, DIGEST, LAMBDA_RANGE, OBS_NAMES, PRIORITY, AlertState, action_mask, observe,
    with_screenings,
)

ASK_BURDEN = 0.05
FRAGILE_HARM = 0.1


class AlertEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self, assessor: Assessor, config: SimConfig | None = None, randomize: bool = True,
        enable_ask: bool = True, lam: float | None = None, seed: int | None = None,
    ):
        super().__init__()
        self.assessor = assessor
        self.config = config
        self.randomize = randomize
        self.enable_ask = enable_ask
        self.fixed_lam = lam
        self.action_space = spaces.Discrete(len(ACTIONS))
        self.observation_space = spaces.Box(-1.0, 1.0, shape=(len(OBS_NAMES),), dtype=np.float32)
        self._seed_rng = np.random.default_rng(seed)

    # -- gym API ---------------------------------------------------------------
    def reset(self, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self._seed_rng = np.random.default_rng(seed)
        options = options or {}
        # Training children never collide with the evaluation cohorts (seeds below 1e6).
        child_seed = int(options.get("child_seed", self._seed_rng.integers(1_000_000, 2**31 - 1)))
        if "lam" in options:
            self.lam = float(options["lam"])
        elif self.fixed_lam is not None:
            self.lam = self.fixed_lam
        else:
            lo, hi = LAMBDA_RANGE
            self.lam = float(math.exp(self._seed_rng.uniform(math.log(lo), math.log(hi))))
        self.sim = ChildSimulator(self.config, child_seed)
        record = self.sim.reset(child_seed, randomize=self.randomize)
        self.builder = FeatureBuilder(self.sim.profile, self.sim.history.context)
        self.state = AlertState()
        self.probs: list[np.ndarray] = []
        self.checkins: list[bool] = []
        self.episode_start: int | None = None
        self._ingest(record)
        return self.obs, {}

    def step(self, action: int):
        action = int(action)
        if not self.action_masks()[action]:
            action = 0  # the shield turns a forbidden action into "wait"
        t = self.sim.t
        cost = ALERT_LOAD.get(action, 0.0)
        if action in (DIGEST, PRIORITY):
            priority = "digest" if action == DIGEST else "priority"
            self.sim.schedule_alert(priority)
            self.state.alerts.append((t, "policy", priority))
        elif action == ASK:
            self.sim.schedule_screening()
            self.state.asks.append(t)
        record = self.sim.step()
        self._ingest(record)
        harm = self._harm()
        reward = -harm - self.lam * cost - ASK_BURDEN * (action == ASK)
        info = {"harm": harm, "cost": cost, "action": action}
        return self.obs, float(reward), self.sim.done, False, info

    def action_masks(self) -> np.ndarray:
        return action_mask(self.state, self.sim.t, self.sim.profile.age, self.enable_ask)

    # -- internals -------------------------------------------------------------
    def _ingest(self, record) -> None:
        """Take in a new day: belief update, shield, bookkeeping."""
        self.builder.append(record)
        t = self.sim.t
        self.features = self.builder.row(t)
        if record.screening is not None:
            self.state.screenings.append((t, record.screening))
        belief = self.assessor.predict_proba(self.features[None])[0]
        self.probs.append(with_screenings(belief, self.state.screenings, t))
        self.checkins.append(record.checked_in)
        if t in self.sim.truth.psy_visits:
            self.state.psy_contacts.append(t)
        flag = most_severe(check_day(record))
        if flag is not None:
            source, priority = ALERT_FOR_LEVEL[flag.level]
            self.state.alerts.append((t, source, priority))
            self.sim.schedule_alert(priority)
        z = self.sim.state
        if z == DISTRESS and self.episode_start is None:
            self.episode_start = t
        elif z != DISTRESS:
            self.episode_start = None
        self.obs = observe(
            self.probs, self.checkins, t, self.state, self.sim.profile.age, t, self.sim.profile.has_family,
            sum(self.builder.ch["note_concern"][max(0, t - 2): t + 1]), self.lam,
        )

    def _harm(self) -> float:
        t, z, visits = self.sim.t, self.sim.state, self.sim.truth.psy_visits
        if z == DISTRESS:
            return 0.0 if any(self.episode_start - 2 <= v <= t for v in visits) else 1.0
        if z == FRAGILE and not any(t - 6 <= v <= t for v in visits):
            return FRAGILE_HARM
        return 0.0

    def clone(self) -> AlertEnv:
        """Independent copy for lookahead rollouts (the assessor is shared, it is read-only)."""
        other = copy.copy(self)
        for name in ("sim", "builder", "state", "probs", "checkins", "obs", "features"):
            setattr(other, name, copy.deepcopy(getattr(self, name)))
        return other
