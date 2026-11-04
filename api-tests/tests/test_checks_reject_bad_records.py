"""The checks themselves are tested: each one must reject a record broken in the way it guards against.

Without this, a rule that always returns [] would pass every record. Inputs are the committed samples,
so these tests do not depend on the last UI run.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from pydantic import ValidationError

from aqx import rules
from aqx.models import (
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
from aqx.records import SAMPLE_DIR, scrub

pytestmark = pytest.mark.guard


def sample(test_id: str, key: str) -> dict[str, Any]:
    return json.loads((SAMPLE_DIR / f"{test_id}.json").read_text())["records"][key]


def changed(raw: dict[str, Any], **fields: Any) -> dict[str, Any]:
    return {**raw, **fields}


# --- schema ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("model", "raw", "field"),
    [
        (OpenPosition, changed(sample("CR-01", "position"), orderId="ABC"), "orderId"),
        (OpenPosition, changed(sample("CR-01", "position"), lotSize=0), "lotSize"),
        (OpenPosition, changed(sample("CR-01", "position"), openTime=0), "openTime"),
        (OpenPosition, changed(sample("CR-01", "position"), orderType=2), "orderType"),
        (HistoryPosition, changed(sample("CR-01", "history"), status="OPEN"), "status"),
        (HistoryOrder, changed(sample("CR-03", "cancelled"), state=1), "state"),
        (PendingOrder, changed(sample("CR-03", "pending"), tradeExpiry="FOREVER"), "tradeExpiry"),
        (OrderNotification, changed(sample("CR-01", "notificationCreated"), notificationTemplate="X"), "template"),
        (SymbolDetail, changed(sample("SM-01", "symbolDetail"), status="HALTED"), "symbolStatus"),
        (SymbolDetail, changed(sample("SM-01", "symbolDetail"), orderTypes=["MARKET", "OCO"]), "orderTypes"),
        (OrderCounts, changed(sample("AC-00", "counts"), pendingOrderCounts=-1), "counts"),
        (TradeError, changed(sample("PO-06", "rejection"), code="oops"), "errorCode"),
        (TradeError, changed(sample("PO-06", "rejection"), status=200), "errorStatus"),
    ],
    ids=lambda v: v if isinstance(v, str) else "",
)
def test_schema_rejects(model, raw, field):
    with pytest.raises(ValidationError):
        model.model_validate(raw)


def test_schema_rejects_a_missing_field():
    raw = sample("CR-01", "position")
    del raw["openPrice"]
    with pytest.raises(ValidationError, match="openPrice"):
        OpenPosition.model_validate(raw)


def test_close_notification_open_time_is_not_a_timestamp():
    """Documents a product oddity: NT_ORDER_CLOSE metadata.openTime is -7200000, so it is not modelled."""
    assert sample("CR-01", "notificationClosed")["metadata"]["openTime"] < 0


# --- single-record rules --------------------------------------------------------------------------------


def test_r2_rejects_buy_stop_loss_above_entry():
    p = OpenPosition.model_validate(sample("CR-01", "position"))
    broken = p.model_copy(update={"stopLoss": p.openPrice + 1})
    assert rules.position_rules(broken) == [f"stopLoss {p.openPrice + 1} must be below entry {p.openPrice}"]


def test_r2_rejects_buy_take_profit_below_entry():
    p = OpenPosition.model_validate(sample("CR-01", "position"))
    assert rules.position_rules(p.model_copy(update={"takeProfit": p.openPrice - 1}))


def test_r4_rejects_volume_off_step_and_below_minimum():
    p = OpenPosition.model_validate(sample("CR-01", "position"))
    assert any("multiple" in i for i in rules.position_rules(p.model_copy(update={"lotSize": 0.15, "units": 15})))
    assert any("minimum" in i for i in rules.position_rules(p.model_copy(update={"lotSize": 0.05, "units": 5})))


def test_units_must_follow_lots():
    p = OpenPosition.model_validate(sample("CR-01", "position"))
    assert any("units" in i for i in rules.position_rules(p.model_copy(update={"units": p.units + 1})))


def test_r7_rejects_cancelled_order_with_a_fill_or_deal():
    cancelled = HistoryOrder.model_validate(sample("CR-03", "cancelled"))
    deal = HistoryOrder.model_validate(sample("CR-01", "openingOrder")).deals[0]
    assert rules.order_rules(cancelled.model_copy(update={"deals": [deal]}))
    assert rules.order_rules(cancelled.model_copy(update={"lotSizeFilled": 0.1}))


def test_filled_order_must_be_covered_by_its_deals():
    order = HistoryOrder.model_validate(sample("CR-01", "openingOrder"))
    assert rules.order_rules(order.model_copy(update={"deals": []}))
    assert rules.order_rules(order.model_copy(update={"lotSizeFilled": order.lotSize / 2}))


def test_stop_limit_rejects_limit_above_stop():
    order = PendingOrder.model_validate(sample("PO-05", "pending"))
    assert order.orderType == rules.BUY_STOP_LIMIT
    assert rules.pending_rules(order.model_copy(update={"priceTrigger": order.price + 1}))


def test_symbol_rules_reject_incoherent_parameters():
    d = SymbolDetail.model_validate(sample("SM-01", "symbolDetail"))
    assert rules.symbol_rules(d) == []
    assert any("max lot" in i for i in rules.symbol_rules(d.model_copy(update={"maxContractLotSize": 0.01})))
    assert any("pointStep" in i for i in rules.symbol_rules(d.model_copy(update={"pointStep": 0.1})))
    assert any("bid" in i for i in rules.symbol_rules(d.model_copy(update={"ask": d.bid - 1})))
    assert any("R26" in i for i in rules.symbol_rules(d.model_copy(update={"status": "CLOSED"})))


def test_pending_rules_reject_stops_on_the_wrong_side():
    order = PendingOrder.model_validate(sample("PO-09", "pendingAfter"))
    assert rules.pending_rules(order) == []
    assert rules.pending_rules(order.model_copy(update={"stopLoss": order.price + 1}))


def test_modification_rules_reject_identity_changes():
    before = OpenPosition.model_validate(sample("PM-02", "positionBefore"))
    after = OpenPosition.model_validate(sample("PM-02", "positionAfter"))
    assert rules.position_modified(before, after) == []
    assert any("lotSize" in i for i in rules.position_modified(before, after.model_copy(update={"lotSize": 1.0})))
    assert rules.position_modified(before, before) == ["SL/TP did not change"]
    pending_before = PendingOrder.model_validate(sample("PO-09", "pendingBefore"))
    pending_after = PendingOrder.model_validate(sample("PO-09", "pendingAfter"))
    assert rules.pending_modified(pending_before, pending_after) == []
    assert rules.pending_modified(pending_before, pending_after.model_copy(update={"orderType": 3}))


def test_notification_text_must_match_its_data():
    n = OrderNotification.model_validate(sample("CR-01", "notificationCreated"))
    wrong = n.model_copy(update={"metadata": n.metadata.model_copy(update={"lotSize": 9.9})})
    assert any("Size 9.9" in i for i in rules.notification_text_rules(wrong))
    moved = n.model_copy(update={"metadata": n.metadata.model_copy(update={"openPrice": n.metadata.openPrice + 1})})
    assert any("message price" in i for i in rules.notification_text_rules(moved))


def test_notification_price_is_compared_as_a_number():
    """A price printed without its trailing zero ("4,040.5") is the same price as 4040.50."""
    n = OrderNotification.model_validate(sample("CR-01", "notificationCreated"))
    m = n.metadata.model_copy(update={"openPrice": 4040.5, "digit": 2})
    text = f"Open Position: #{m.orderId} {m.symbol}: Size {m.lotSize:g} / Units 10 @ 4,040.5"
    assert rules.notification_text_rules(n.model_copy(update={"metadata": m, "message": text})) == []


# --- cross-record rules ---------------------------------------------------------------------------------


def test_r5_r6_reject_mismatched_partial_close():
    history = HistoryPosition.model_validate(sample("CR-02", "history"))
    closings = [HistoryOrder.model_validate(o) for o in sample("CR-02", "closingOrders")]
    assert rules.partial_close_reconciles(history, closings) == []
    assert any("(R6)" in i for i in rules.partial_close_reconciles(history.model_copy(update={"profit": 10}), closings))
    assert any("(R5)" in i for i in rules.partial_close_reconciles(history, closings[:1]))


def test_history_must_match_its_position():
    position = OpenPosition.model_validate(sample("CR-01", "position"))
    history = HistoryPosition.model_validate(sample("CR-01", "history"))
    assert rules.history_matches_position(history, position, position.decimal) == []
    assert rules.history_matches_position(history.model_copy(update={"positionId": "1"}), position, 2)
    assert rules.history_matches_position(history.model_copy(update={"stopLoss": 1.0}), position, 2)


def test_closed_notification_must_match_history_pl():
    history = HistoryPosition.model_validate(sample("CR-01", "history"))
    n = OrderNotification.model_validate(sample("CR-01", "notificationClosed"))
    wrong = n.model_copy(update={"metadata": n.metadata.model_copy(update={"profit": n.metadata.profit + 1})})
    assert any("profit" in i for i in rules.closed_notification_matches_history(wrong, history, 2))


def test_response_must_name_the_order_it_acted_on():
    response = TradeResult.model_validate(sample("PM-02", "modifyPositionResponse"))
    assert rules.response_names(response, response.clOrdId) == []
    assert len(rules.response_names(response, "1")) == 3


def test_scrub_removes_account_identifiers():
    raw = {"account": "1", "a": [{"metatraderId": "1", "tenantId": "t", "keep": 1}]}
    assert scrub(raw) == {"a": [{"keep": 1}]}
