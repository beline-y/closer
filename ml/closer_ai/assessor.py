"""Wellbeing assessor: P(stable, fragile, distress) for today, with faithful explanations.

An additive model (a GAM): each feature goes through its own cubic spline, then a
multinomial logistic regression. Because the model is additive, the log-odds of distress
vs stable split exactly into one contribution per feature, so the "why" shown to the
psychologist is the model's real reasoning, not a post-hoc approximation.

In the RL formulation the assessor is the belief filter: its probabilities summarize the
history for the policy. Inference is plain numpy (about 50 microseconds per day).
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

from .features import FEATURES, describe

STABLE, FRAGILE, DISTRESS = 0, 1, 2


def bspline_basis(u: np.ndarray, n_knots: int) -> np.ndarray:
    """Uniform cubic B-spline basis on [0, 1]: (n, F) -> (n, F, n_knots + 2), rows sum to 1."""
    h = 1.0 / (n_knots - 1)
    starts = (np.arange(n_knots + 2) - 3) * h
    s = (np.clip(u, 0.0, 1.0)[..., None] - starts) / h
    return np.select(
        [(s >= 0) & (s < 1), (s >= 1) & (s < 2), (s >= 2) & (s < 3), (s >= 3) & (s < 4)],
        [s**3, -3 * s**3 + 12 * s**2 - 12 * s + 4, 3 * s**3 - 24 * s**2 + 60 * s - 44, (4 - s) ** 3],
        default=0.0,
    ) / 6.0


class Assessor:
    def __init__(self, C: float = 0.3, n_knots: int = 5):
        self.C = C
        self.n_knots = n_knots
        self.version = "untrained"

    # -- fitting -----------------------------------------------------------------
    def fit(self, X: np.ndarray, y: np.ndarray) -> Assessor:
        X = np.asarray(X, float)
        self.low_ = np.nan_to_num(np.nanpercentile(X, 1, axis=0))
        self.high_ = np.nan_to_num(np.nanpercentile(X, 99, axis=0))
        self.medians_ = np.nan_to_num(np.nanmedian(X, axis=0))
        self.spline_cols_ = np.flatnonzero(self.high_ > self.low_)
        self.nan_cols_ = np.flatnonzero(np.isnan(X).any(axis=0))
        per_feature = self.n_knots + 1  # n_knots + 2 basis functions, minus one (collinear with the intercept)
        self.owner_ = np.concatenate([np.repeat(self.spline_cols_, per_feature), self.nan_cols_])
        design = self._design(X)
        self.design_mean_ = design.mean(axis=0)
        model = LogisticRegression(C=self.C, max_iter=4000).fit(design, y)
        self.coef_, self.intercept_ = model.coef_, model.intercept_
        self.version = "gam-" + hashlib.sha1(np.ascontiguousarray(self.coef_).tobytes()).hexdigest()[:8]
        return self

    def _design(self, X: np.ndarray) -> np.ndarray:
        X = np.atleast_2d(np.asarray(X, float))
        cols = self.spline_cols_
        filled = np.where(np.isnan(X[:, cols]), self.medians_[cols], X[:, cols])
        u = (filled - self.low_[cols]) / (self.high_[cols] - self.low_[cols])
        splines = bspline_basis(u, self.n_knots)[:, :, :-1].reshape(len(X), -1)
        return np.hstack([splines, np.isnan(X[:, self.nan_cols_]).astype(float)])

    # -- inference ---------------------------------------------------------------
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        logits = self._design(X) @ self.coef_.T + self.intercept_
        logits -= logits.max(axis=1, keepdims=True)
        expo = np.exp(logits)
        return expo / expo.sum(axis=1, keepdims=True)

    def contributions(self, x: np.ndarray) -> np.ndarray:
        """Per-feature contribution to log P(distress)/P(stable), relative to an average child-day."""
        design = self._design(x)[0]
        delta = self.coef_[DISTRESS] - self.coef_[STABLE]
        return np.bincount(self.owner_, weights=delta * (design - self.design_mean_), minlength=len(FEATURES))

    def explain(self, x: np.ndarray, top: int = 3, min_weight: float = 0.15) -> list[dict]:
        """The signals pushing most toward distress today, in words the care team can check."""
        x = np.asarray(x, float).ravel()
        contrib = self.contributions(x)
        factors = []
        for j in np.argsort(-contrib)[:top]:
            if contrib[j] < min_weight:
                break
            value = float(x[j])
            factors.append({
                "feature": FEATURES[j],
                "value": None if math.isnan(value) else round(value, 2),
                "weight": round(float(contrib[j]), 2),
                "text": describe(FEATURES[j], value),
            })
        return factors

    # -- persistence -------------------------------------------------------------
    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @staticmethod
    def load(path: str | Path) -> Assessor:
        return joblib.load(path)


def level(probs: np.ndarray) -> str:
    """Ordinal reading of the three probabilities. A real chance of distress is never shown as stable."""
    if probs[DISTRESS] >= 0.5:
        return "distress"
    if probs[FRAGILE] + probs[DISTRESS] >= 0.5 or probs[DISTRESS] >= 0.25:
        return "fragile"
    return "stable"
