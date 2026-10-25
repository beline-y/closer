"""VIPER: extract the neural policy into a small decision tree a psychologist can read.

Bastani, Pu & Solar-Lezama (2018), "Verifiable Reinforcement Learning via Policy
Extraction". DAgger-style imitation of the teacher (the PPO agent), where each state is
weighted by how much the choice matters there: max_a Q(s, a) - min_a Q(s, a). Q is
estimated by rolling the teacher out from a clone of the environment for a few days,
then bootstrapping with the teacher's critic. The simulator's common random numbers make
the rollouts for different actions directly comparable.

The result is a policy you can print, audit and veto rule by rule.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
from sklearn.tree import DecisionTreeClassifier

from .baselines import PPOPolicy
from .env import AlertEnv
from .obs import ACTIONS, DIGEST, OBS_NAMES, PRIORITY, WAIT

# Turn normalized observations back into units people use, for printed rules.
_UNITS = {
    "checkins_3d": (3, 0, "check-ins in 3 days"), "days_since_checkin": (7, 0, "days"),
    "days_since_alert": (14, 0, "days"), "days_since_psy_contact": (14, 0, "days"),
    "alerts_7d": (3, 0, "agent alerts in 7 days"), "days_since_ask": (7, 0, "days"),
    "age": (12, 5, "years"), "day_of_stay": (42, 0, "days"),
}


class TreePolicy:
    def __init__(self, tree: DecisionTreeClassifier, lam: float):
        self.tree, self.lam = tree, lam
        self.name = f"Distilled tree ({tree.get_n_leaves()} rules)"

    def act(self, env) -> int:
        return self.act_obs(env.obs, env.action_masks())

    def act_obs(self, obs: np.ndarray, mask: np.ndarray) -> int:
        action = int(self.tree.predict(np.asarray(obs, dtype=np.float32)[None])[0])
        return action if mask[action] else WAIT

    def _uniform(self, node: int) -> int | None:
        """The action every leaf under `node` takes, or None if they differ."""
        tree = self.tree.tree_
        if tree.children_left[node] == tree.children_right[node]:
            return int(self.tree.classes_[np.argmax(tree.value[node][0])])
        left, right = self._uniform(tree.children_left[node]), self._uniform(tree.children_right[node])
        return left if left is not None and left == right else None

    def path(self, obs: np.ndarray) -> list[str]:
        """The conditions that decided today's action, in readable units."""
        tree = self.tree.tree_
        x = np.asarray(obs, dtype=np.float32)
        node, steps = 0, []
        while self._uniform(node) is None:
            name, threshold = OBS_NAMES[tree.feature[node]], float(tree.threshold[node])
            below = x[tree.feature[node]] <= threshold
            steps.append(_condition(name, "<=" if below else ">", threshold))
            node = tree.children_left[node] if below else tree.children_right[node]
        return steps

    def rules(self) -> str:
        """The whole policy as nested if/else rules, with redundant splits merged."""
        tree, lines = self.tree.tree_, []

        def walk(node: int, depth: int) -> None:
            pad = "    " * depth
            action = self._uniform(node)
            if action is not None:
                lines.append(f"{pad}-> {ACTIONS[action]}")
                return
            name, threshold = OBS_NAMES[tree.feature[node]], float(tree.threshold[node])
            lines.append(f"{pad}if {_condition(name, '<=', threshold)}:")
            walk(tree.children_left[node], depth + 1)
            lines.append(f"{pad}else:  # {_condition(name, '>', threshold)}")
            walk(tree.children_right[node], depth + 1)

        walk(0, 0)
        return "\n".join(lines)

    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: str | Path) -> TreePolicy:
        return joblib.load(path)


def _condition(name: str, op: str, threshold: float) -> str:
    """'days_since_psy_contact > 0.32' reads 'days_since_psy_contact > 4.5 days'."""
    if name in _UNITS:
        scale, offset, unit = _UNITS[name]
        return f"{name} {op} {threshold * scale + offset:.1f} {unit}"
    return f"{name} {op} {threshold:.2f}"


def _q_values(env: AlertEnv, teacher: PPOPolicy, horizon: int, gamma: float) -> np.ndarray:
    """Q(s, a) for each allowed action; -inf for masked ones."""
    import torch

    q = np.full(len(ACTIONS), -np.inf)
    for action in np.flatnonzero(env.action_masks()):
        sim = env.clone()
        _, ret, done, _, _ = sim.step(int(action))
        discount = gamma
        for _ in range(horizon - 1):
            if done:
                break
            _, reward, done, _, _ = sim.step(teacher.act(sim))
            ret += discount * reward
            discount *= gamma
        if not done:
            obs = sim.obs.copy()
            with torch.no_grad():
                value = teacher.model.policy.predict_values(teacher.model.policy.obs_to_tensor(obs[None])[0])
            ret += discount * float(value.item())
        q[action] = ret
    return q


def collect(env: AlertEnv, teacher: PPOPolicy, student: TreePolicy | None, seeds: list[int],
            horizon: int = 7, gamma: float = 0.95) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Visit states with the current student (DAgger), label them with the teacher's choice."""
    X, y, w = [], [], []
    for seed in seeds:
        env.reset(options={"child_seed": seed, "lam": teacher.lam})
        done = False
        while not done:
            q = _q_values(env, teacher, horizon, gamma)
            finite = q[np.isfinite(q)]
            X.append(env.obs.copy())
            y.append(teacher.act(env))
            w.append(float(finite.max() - finite.min()) if len(finite) > 1 else 0.0)
            action = y[-1] if student is None else student.act(env)
            _, _, done, _, _ = env.step(action)
    return np.array(X), np.array(y), np.array(w)


def _collect_chunk(job: tuple) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    import torch

    from ..assessor import Assessor

    torch.set_num_threads(1)
    assessor_path, teacher_path, lam, student, seeds = job
    env = AlertEnv(Assessor.load(assessor_path), randomize=False, enable_ask=True)
    return collect(env, PPOPolicy(teacher_path, lam), student, seeds)


def viper(assessor_path: str, teacher_path: str, lam: float, seeds: list[int], iterations: int = 4,
          max_leaves: int = 20, evaluate=None, pool=None, workers: int = 14) -> tuple[TreePolicy, list[dict]]:
    """Returns the best student (by `evaluate`, or by weighted fidelity if no evaluator) and a log."""
    X = np.empty((0, len(OBS_NAMES)))
    y = np.empty(0, dtype=int)
    w = np.empty(0)
    student, best, best_score, log = None, None, -np.inf, []
    per_iter = np.array_split(np.array(seeds), iterations)
    for i, chunk in enumerate(per_iter):
        jobs = [(assessor_path, teacher_path, lam, student, [int(s) for s in chunk[k::workers]])
                for k in range(workers) if len(chunk[k::workers])]
        parts = list(pool.map(_collect_chunk, jobs)) if pool else [_collect_chunk(job) for job in jobs]
        Xi, yi, wi = (np.concatenate([p[k] for p in parts]) for k in range(3))
        entry = {"iteration": i, "new_states": len(Xi)}
        if student is not None:  # held-out check on the states the student itself visited
            predicted = student.tree.predict(Xi)
            agree = predicted == yi
            alerts = np.isin(yi, (DIGEST, PRIORITY))
            entry |= {"fidelity": float(agree.mean()), "weighted_fidelity": float(np.average(agree, weights=wi + 1e-3)),
                      "alert_fidelity": float(agree[alerts].mean()) if alerts.any() else None}
        X, y, w = np.vstack([X, Xi]), np.concatenate([y, yi]), np.concatenate([w, wi])
        tree = DecisionTreeClassifier(max_leaf_nodes=max_leaves, min_samples_leaf=20, random_state=0)
        tree.fit(X, y, sample_weight=w + 1e-3)
        student = TreePolicy(tree, lam)
        entry["score"] = score = evaluate(student) if evaluate else float(np.average(tree.predict(X) == y, weights=w + 1e-3))
        log.append(entry)
        if score > best_score:
            best, best_score = student, score
    return best, log
