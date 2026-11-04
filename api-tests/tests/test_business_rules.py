"""CR-04 (rules): business rules that must hold for every captured record of a kind (R2, R4, R7, ...)."""

from __future__ import annotations

import pytest

from aqx import rules
from aqx.models import HistoryOrder, HistoryPosition, OpenPosition, OrderNotification, PendingOrder, SymbolDetail
from aqx.records import load_records, typed_records

pytestmark = pytest.mark.rules


def of_kind(model):
    """Raw records of one kind; validated inside each test so a schema error fails that test, not collection."""
    return [
        pytest.param(raw, id=f"{test_id}:{path}")
        for test_id, file in load_records().items()
        for path, kind, raw in typed_records(file)
        if kind is model
    ]


@pytest.mark.parametrize("position", of_kind(OpenPosition))
def test_open_position(position):
    """R2 stops on the correct side, R4 volume within limits and on the step, units = lots x contract."""
    assert rules.position_rules(OpenPosition.model_validate(position)) == []


@pytest.mark.parametrize("order", of_kind(PendingOrder))
def test_pending_order(order):
    """R2 around the order price; Stop Limit limit <= stop; dated expiries carry a future expiration."""
    assert rules.pending_rules(PendingOrder.model_validate(order)) == []


@pytest.mark.parametrize("position", of_kind(HistoryPosition))
def test_closed_position(position):
    assert rules.history_rules(HistoryPosition.model_validate(position)) == []


@pytest.mark.parametrize("order", of_kind(HistoryOrder))
def test_history_order(order):
    """Filled orders are fully filled by their deals; cancelled ones have no fill and no deal (R7)."""
    assert rules.order_rules(HistoryOrder.model_validate(order)) == []


@pytest.mark.parametrize("notification", of_kind(OrderNotification))
def test_notification_text_matches_its_data(notification):
    assert rules.notification_text_rules(OrderNotification.model_validate(notification)) == []


@pytest.mark.parametrize("detail", of_kind(SymbolDetail))
def test_symbol_detail(detail):
    """R4 lot limits, price step = 10^-digits, Ask >= Bid, a closed market is not tradable (R26)."""
    assert rules.symbol_rules(SymbolDetail.model_validate(detail)) == []
