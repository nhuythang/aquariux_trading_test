"""Shared fixtures. Records are read once per session from aqx.records.records_dir():
AQX_RECORDS_DIR, else the last UI run (artifacts/records), else the committed samples."""

from __future__ import annotations

from collections.abc import Callable

import pytest

from aqx.records import RecordFile, load_records, records_dir


def pytest_report_header() -> str:
    return f"records: {records_dir()}"


@pytest.fixture(scope="session")
def records() -> dict[str, RecordFile]:
    loaded = load_records()
    assert loaded, f"no records found in {records_dir()}"
    return loaded


@pytest.fixture(scope="session")
def record(records: dict[str, RecordFile]) -> Callable[[str], dict]:
    """record("CR-01") -> that test's records; skips when the UI test was not part of the run."""

    def get(test_id: str) -> dict:
        if test_id not in records:
            pytest.skip(f"{test_id} was not recorded in {records_dir()}")
        return records[test_id].records

    return get
