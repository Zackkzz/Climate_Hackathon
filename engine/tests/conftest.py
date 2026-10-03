"""Shared test fixtures. Tests never use the network: weather comes from the cached file in data/cache."""
import os

os.environ["METERWISE_OFFLINE"] = "1"

import pytest  # noqa: E402

from meterwise.models import AssessRequest  # noqa: E402
from meterwise.weather import get_weather  # noqa: E402

PILOT_LAT, PILOT_LON = -33.92, 151.07


@pytest.fixture(scope="session")
def weather():
    w, _ = get_weather(PILOT_LAT, PILOT_LON, allow_network=False)
    return w


def make_request(**kw) -> AssessRequest:
    """A 3-storey, 12-flat custom building with optional overrides per section."""
    building = {"storeys": 3, "flats": 12, "roof_m2": 320.0, "lat": PILOT_LAT, "lon": PILOT_LON, "heat_anomaly_c": 1.0}
    building.update(kw.pop("building", {}))
    return AssessRequest(building=building, **kw)
