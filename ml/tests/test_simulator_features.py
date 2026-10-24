import copy
import math

import numpy as np

from closer_ai.features import FEATURES, FeatureBuilder, build, describe
from closer_ai.simulator import ChildSimulator, simulate_stay


def test_same_seed_same_child():
    a, b = simulate_stay(42), simulate_stay(42)
    assert a.truth.states == b.truth.states
    assert [d.mood for d in a.history.days] == [d.mood for d in b.history.days]
    assert [d.note for d in a.history.days] == [d.note for d in b.history.days]


def test_records_stay_in_range():
    for seed in range(30):
        for d in simulate_stay(seed, randomize=True).history.days:
            assert d.mood is None or 1 <= d.mood <= 5
            assert d.pain is None or 0 <= d.pain <= 10
            assert d.worry is None or 0 <= d.worry <= 4
            assert d.note is None or len(d.note) <= 280
            assert d.drawings >= len(d.shared_drawings)


def test_alert_leads_to_a_psychologist_visit():
    sim = ChildSimulator(seed=7)
    sim.reset(7)
    sim.schedule_alert("urgent")
    sim.step()
    assert sim.truth.psy_visits == [1]


def test_common_random_numbers():
    """Two runs that make the same choices see the same world."""
    a, b = ChildSimulator(seed=3), ChildSimulator(seed=3)
    a.reset(3), b.reset(3)
    for _ in range(10):
        assert a.step().mood == b.step().mood


def test_features_are_causal():
    sim = simulate_stay(3)
    builder = build(sim.history)
    t = 8
    future = copy.deepcopy(sim.history)
    for d in future.days[t + 1:]:
        d.mood, d.note, d.family_contacts, d.drawings = 1, "je veux mourir", 0, 9
    assert np.allclose(builder.row(t), build(future).row(t), equal_nan=True)


def test_online_rows_match_batch_rows():
    sim = simulate_stay(5)
    batch = build(sim.history).matrix()
    online = FeatureBuilder(sim.profile, sim.history.context)
    for t, record in enumerate(sim.history.days):
        online.append(record)
        assert np.allclose(online.row(t), batch[t], equal_nan=True)


def test_every_feature_can_be_described():
    for name in FEATURES:
        assert describe(name, 1.0)
        assert describe(name, math.nan)
