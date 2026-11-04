"""CR-04 (schema): every captured record matches its model, and the record files keep their contract."""

from __future__ import annotations

import pytest

from aqx.models import (
    BulkCloseResult,
    BulkDeleteResult,
    HistoryOrder,
    HistoryPosition,
    OpenPosition,
    OrderCounts,
    OrderNotification,
    PendingOrder,
    SymbolDetail,
    TradeError,
    TradeResult,
)
from aqx.records import KEY_MODELS, RecordFile, load_records, typed_records

pytestmark = pytest.mark.schema

TYPED = [
    pytest.param(model, raw, id=f"{test_id}:{path}")
    for test_id, file in load_records().items()
    for path, model, raw in typed_records(file)
]

COMPOSITE_KEYS = {"closingOrders", "orders", "bulkClose"}
UNMODELLED_KEYS = {"cancelledIds", "outcome"}
"""Keys that hold test observations rather than backend records (IDs, UI outcome)."""


@pytest.mark.parametrize(("model", "raw"), TYPED)
def test_record_matches_its_model(model, raw):
    model.model_validate(raw)


def test_every_record_key_is_known(records: dict[str, RecordFile]):
    """A new key in the UI recorder needs a model here, so nothing is silently left unchecked."""
    known = set(KEY_MODELS) | COMPOSITE_KEYS | UNMODELLED_KEYS
    unknown = {f"{test_id}:{key}" for test_id, f in records.items() for key in f.records if key not in known}
    assert unknown == set()


def test_every_model_has_records(records: dict[str, RecordFile]):
    """The run produced at least one record of each kind, so no model is validated against nothing."""
    seen = {model for f in records.values() for _, model, _ in typed_records(f)}
    expected = {
        TradeResult,
        TradeError,
        SymbolDetail,
        OrderCounts,
        OpenPosition,
        PendingOrder,
        HistoryPosition,
        HistoryOrder,
        OrderNotification,
    }
    if any(f.testId.startswith("BO-") for f in records.values()):
        expected |= {BulkCloseResult, BulkDeleteResult}
    assert expected - seen == set()
