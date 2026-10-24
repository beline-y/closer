"""Simulated cohorts and the supervised dataset for the assessor."""

from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor

import numpy as np

from .features import build
from .simulator import SimConfig, simulate_stay


def _child_rows(args: tuple[int, SimConfig | None, bool]) -> tuple[np.ndarray, np.ndarray, int, bool]:
    seed, config, randomize = args
    sim = simulate_stay(seed, config, randomize)
    return build(sim.history).matrix(), np.array(sim.truth.states), sim.profile.age, sim.params.masking


def assessor_dataset(
    n_children: int, seed: int = 0, config: SimConfig | None = None, randomize: bool = True, workers: int = 8,
    with_masking: bool = False,
) -> tuple[np.ndarray, ...]:
    """Feature rows, hidden states, child index and age for `n_children` simulated stays (no AI alerts).

    with_masking adds a fifth array: whether the row's child hides distress behind good moods.
    """
    jobs = [(seed + i, config, randomize) for i in range(n_children)]
    if workers > 1:
        with ProcessPoolExecutor(workers) as pool:
            results = list(pool.map(_child_rows, jobs, chunksize=32))
    else:
        results = [_child_rows(job) for job in jobs]
    X = np.vstack([r[0] for r in results])
    y = np.concatenate([r[1] for r in results])
    child = np.concatenate([np.full(len(r[1]), i) for i, r in enumerate(results)])
    age = np.concatenate([np.full(len(r[1]), r[2]) for r in results])
    if with_masking:
        return X, y, child, age, np.concatenate([np.full(len(r[1]), r[3]) for r in results])
    return X, y, child, age
