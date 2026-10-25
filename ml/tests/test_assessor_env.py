import numpy as np
from gymnasium.utils.env_checker import check_env

from closer_ai.assessor import DISTRESS, STABLE, bspline_basis, level
from closer_ai.datasets import assessor_dataset
from closer_ai.policy.env import AlertEnv
from closer_ai.policy.obs import ASK, DIGEST, PRIORITY, WAIT, AlertState, action_mask


def test_spline_basis_is_a_partition_of_unity():
    u = np.random.default_rng(0).random((50, 4))
    assert np.allclose(bspline_basis(u, 5).sum(-1), 1)


def test_contributions_explain_the_log_odds(assessor):
    X, _, _, _ = assessor_dataset(5, seed=900, workers=1)
    p = assessor.predict_proba(X)
    log_odds = np.log(p[:, DISTRESS] / p[:, STABLE])
    sums = np.array([assessor.contributions(x).sum() for x in X])
    # Additive model: the per-feature contributions account for every difference in log-odds between two days.
    assert np.allclose(sums - sums[0], log_odds - log_odds[0], atol=1e-6)


def test_explanations_name_real_features(assessor):
    X, _, _, _ = assessor_dataset(3, seed=901, workers=1)
    probs = assessor.predict_proba(X)
    assert np.allclose(probs.sum(1), 1)
    i = int(np.argmax(probs[:, DISTRESS]))
    for factor in assessor.explain(X[i]):
        assert factor["weight"] > 0 and factor["text"]
    assert level(np.array([0.1, 0.2, 0.7])) == "distress"
    assert level(np.array([0.4, 0.4, 0.2])) == "fragile"


def test_env_follows_the_gymnasium_api(assessor):
    check_env(AlertEnv(assessor, seed=0), skip_render_check=True)


def test_mask_blocks_alert_spam_and_young_children():
    state = AlertState(alerts=[(5, "policy", "digest")])
    mask = action_mask(state, 6, age=12)
    assert mask[WAIT] and not mask[DIGEST] and mask[PRIORITY] and mask[ASK]
    assert not action_mask(AlertState(), 6, age=6)[ASK]
    state.asks.append(5)
    assert not action_mask(state, 6, age=12)[ASK]


def test_shield_alerts_on_crisis_notes(assessor):
    env = AlertEnv(assessor, randomize=False)
    for seed in range(200):
        env.reset(options={"child_seed": seed, "lam": 1.0})
        done = False
        while not done:
            _, _, done, _, _ = env.step(WAIT)
        if env.sim.truth.crisis_notes:
            urgent = {d for d, source, priority in env.state.alerts if priority == "urgent"}
            assert urgent, "a crisis note must raise an urgent alert even when the agent waits"
            return
    raise AssertionError("no crisis note in 200 simulated stays")


def test_clones_replay_identically(assessor):
    env = AlertEnv(assessor, randomize=False)
    env.reset(options={"child_seed": 11, "lam": 0.5})
    clone = env.clone()
    for action in (WAIT, DIGEST, WAIT, ASK, WAIT):
        a, b = env.step(action), clone.step(action)
        assert a[1] == b[1] and np.array_equal(a[0], b[0])


def test_a_clear_answer_sharpens_the_belief():
    from closer_ai.policy.obs import with_screenings

    prior = np.array([0.5, 0.3, 0.2])
    assert with_screenings(prior, [(4, 0.8)], 5)[DISTRESS] > 0.9
    assert with_screenings(prior, [(4, 0.1)], 5)[STABLE] > 0.9
    assert np.allclose(with_screenings(prior, [(1, 0.8)], 5), prior)  # too old to count
