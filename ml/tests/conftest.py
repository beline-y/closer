import pytest

from closer_ai.assessor import Assessor
from closer_ai.datasets import assessor_dataset


@pytest.fixture(scope="session")
def assessor() -> Assessor:
    X, y, _, _ = assessor_dataset(150, seed=0, workers=1)
    return Assessor().fit(X, y)
