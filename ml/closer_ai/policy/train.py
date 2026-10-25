"""Train the lambda-conditioned, action-masked PPO agent on simulated stays."""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
from sb3_contrib import MaskablePPO
from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from ..assessor import Assessor
from .env import AlertEnv


def _make_env(assessor_path: str, seed: int, enable_ask: bool):
    def init():
        import torch

        torch.set_num_threads(1)
        return AlertEnv(Assessor.load(assessor_path), randomize=True, enable_ask=enable_ask, seed=seed)

    return init


class ProgressLog(BaseCallback):
    """Prints mean harm, workload and return per simulated child-week, every few rollouts."""

    def __init__(self, every: int = 10):
        super().__init__()
        self.every = every
        self.rollouts = 0
        self.harm = self.cost = self.reward = self.days = 0.0
        self.started = time.time()
        self.history: list[dict] = []

    def _on_step(self) -> bool:
        infos, rewards = self.locals["infos"], self.locals["rewards"]
        self.harm += sum(i["harm"] for i in infos)
        self.cost += sum(i["cost"] for i in infos)
        self.reward += float(np.sum(rewards))
        self.days += len(infos)
        return True

    def _on_rollout_end(self) -> None:
        self.rollouts += 1
        if self.rollouts % self.every or not self.days:
            return
        weeks = self.days / 7
        row = {
            "steps": self.num_timesteps, "harm_per_week": self.harm / weeks, "load_per_week": self.cost / weeks,
            "reward_per_week": self.reward / weeks, "minutes": (time.time() - self.started) / 60,
        }
        self.history.append(row)
        print(
            f"{row['steps']:>9,} steps | harm/child-week {row['harm_per_week']:.3f} | "
            f"load/child-week {row['load_per_week']:.3f} | reward/child-week {row['reward_per_week']:.3f} | "
            f"{row['minutes']:.1f} min", flush=True,
        )
        self.harm = self.cost = self.reward = self.days = 0.0


def train(
    assessor_path: str | Path, out_path: str | Path, steps: int = 3_000_000, enable_ask: bool = True,
    n_envs: int = 14, seed: int = 0,
) -> MaskablePPO:
    fns = [_make_env(str(assessor_path), seed * 1000 + i, enable_ask) for i in range(n_envs)]
    vec = SubprocVecEnv(fns) if n_envs > 1 else DummyVecEnv(fns)
    model = MaskablePPO(
        "MlpPolicy", vec, n_steps=256, batch_size=896, n_epochs=8, gamma=0.95, gae_lambda=0.95,
        learning_rate=lambda progress: 3e-4 * max(progress, 0.1), ent_coef=0.02, clip_range=0.2,
        policy_kwargs={"net_arch": {"pi": [128, 128], "vf": [128, 128]}}, seed=seed, device="cpu", verbose=0,
    )
    log = ProgressLog()
    model.learn(total_timesteps=steps, callback=log)
    vec.close()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(out_path))
    out_path.with_suffix(".log.json").write_text(json.dumps(log.history, indent=1))
    return model
