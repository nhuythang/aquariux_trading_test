"""CR-04 (consistency): the same trade agrees across the records the UI tests captured for it.

Each test reads the records of one UI test (by its ID) and is skipped when that UI test was not run.
"""

from __future__ import annotations

import pytest

from aqx import rules
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

pytestmark = pytest.mark.consistency


def test_cr01_one_order_no_links_every_record(record):
    r = record("CR-01")
    trade = TradeResult.model_validate(r["tradeResponse"])
    position = OpenPosition.model_validate(r["position"])
    history = HistoryPosition.model_validate(r["history"])
    opened = OrderNotification.model_validate(r["notificationCreated"])
    closed = OrderNotification.model_validate(r["notificationClosed"])
    opening = HistoryOrder.model_validate(r["openingOrder"])
    digits = position.decimal

    assert trade.clOrdId == position.orderId == opening.orderId
    assert opened.notificationTemplate == "NT_ORDER_CREATE"
    assert closed.notificationTemplate == "NT_ORDER_CLOSE"
    assert rules.notification_matches_position(opened, position, digits) == []
    assert rules.history_matches_position(history, position, digits) == []
    assert rules.closed_notification_matches_history(closed, history, digits) == []
    assert rules.order_rules(opening) == []
    same = ("symbol", "orderType", "lotSize")
    assert [getattr(opening, f) for f in same] == [getattr(position, f) for f in same]
    assert opening.deals[0].price == pytest.approx(position.openPrice, abs=10**-digits / 2)


def test_cr02_partial_closes_reconcile_volume_price_and_pl(record):
    """R5 and R6 on a position closed in two parts."""
    r = record("CR-02")
    history = HistoryPosition.model_validate(r["history"])
    closings = [HistoryOrder.model_validate(o) for o in r["closingOrders"]]
    assert len(closings) == 2
    assert rules.partial_close_reconciles(history, closings) == []


def test_cr03_cancelled_order_matches_the_pending_order(record):
    r = record("CR-03")
    pending = PendingOrder.model_validate(r["pending"])
    cancelled = HistoryOrder.model_validate(r["cancelled"])
    assert rules.cancelled_matches_pending(cancelled, pending, pending.decimal) == []


def test_hn01_created_notification_matches_the_position(record):
    r = record("HN-01")
    position = OpenPosition.model_validate(r["position"])
    notification = OrderNotification.model_validate(r["notification"])
    assert rules.notification_matches_position(notification, position, position.decimal) == []


def test_hn02_closed_notification_matches_history(record):
    r = record("HN-02")
    history = HistoryPosition.model_validate(r["history"])
    notification = OrderNotification.model_validate(r["notification"])
    assert rules.closed_notification_matches_history(notification, history, history.decimal) == []


def test_hn04_orders_and_deals_states(record):
    orders = {name: HistoryOrder.model_validate(o) for name, o in record("HN-04")["orders"].items()}
    assert {name: o.state for name, o in orders.items()} == {"opening": 11, "closing": 11, "cancelled": 9}
    assert orders["opening"].orderType == 0
    assert orders["closing"].orderType == 1
    assert orders["closing"].lotSizeFilled == orders["opening"].lotSizeFilled
    for order in orders.values():
        assert rules.order_rules(order) == []


def test_pm04_partial_close_order_is_a_filled_opposite_order(record):
    closing = HistoryOrder.model_validate(record("PM-04")["closing"])
    assert (closing.orderType, closing.state) == (1, 11)
    assert rules.order_rules(closing) == []


def test_po10_deleted_pending_is_cancelled_without_deals(record):
    cancelled = HistoryOrder.model_validate(record("PO-10")["cancelled"])
    assert cancelled.state == 9
    assert rules.order_rules(cancelled) == []


def test_bo01_bulk_close_returns_distinct_ids(record):
    result = BulkCloseResult.model_validate(record("BO-01")["bulkClose"])
    assert len(result.closedOrderIds) == 3
    assert len(set(result.closedOrderIds)) == len(result.closedOrderIds)


def test_bo03_loss_bulk_close_only_closes_positions_that_were_open(record):
    snapshot = record("BO-03")["bulkClose"]
    result = BulkCloseResult.model_validate(snapshot["result"])
    before = {int(OpenPosition.model_validate(p).orderId) for p in snapshot["before"]}
    after = {int(OpenPosition.model_validate(p).orderId) for p in snapshot["after"]}
    closed = set(result.closedOrderIds)
    assert closed, "Loss Positions closed nothing"
    assert closed <= before
    assert closed.isdisjoint(after)


# --- trade endpoints: what each response says about the order it acted on -------------------------------


@pytest.mark.parametrize("test_id", ["PO-01", "PO-02", "PO-03", "PO-04", "PO-05"])
def test_place_pending_response_names_the_new_order(record, test_id):
    r = record(test_id)
    response = TradeResult.model_validate(r["placePendingResponse"])
    assert response.clOrdId == PendingOrder.model_validate(r["pending"]).orderId
    assert response.positionId == "0", "a pending order has no position yet"


def test_po06_wrong_side_limit_is_refused_with_mt_invalid_price(record):
    assert TradeError.model_validate(record("PO-06")["rejection"]).model_dump() == {
        "status": 400,
        "code": "MT4_1009",
        "message": "Metatrader Invalid Price",
    }


def test_po09_modify_pending_changes_only_price_sl_tp(record):
    r = record("PO-09")
    before = PendingOrder.model_validate(r["pendingBefore"])
    after = PendingOrder.model_validate(r["pendingAfter"])
    response = TradeResult.model_validate(r["modifyPendingResponse"])
    assert rules.response_names(response, before.orderId) == []
    assert rules.pending_modified(before, after) == []


def test_po10_delete_response_and_cancelled_order(record):
    r = record("PO-10")
    response = TradeResult.model_validate(r["deletePendingResponse"])
    cancelled = HistoryOrder.model_validate(r["cancelled"])
    assert rules.response_names(response, cancelled.orderId) == []
    assert cancelled.state == 9


def test_pm02_modify_position_changes_only_sl_tp(record):
    r = record("PM-02")
    before = OpenPosition.model_validate(r["positionBefore"])
    after = OpenPosition.model_validate(r["positionAfter"])
    response = TradeResult.model_validate(r["modifyPositionResponse"])
    assert rules.response_names(response, before.orderId) == []
    assert rules.position_modified(before, after) == []


def test_pm04_close_response_names_the_position(record):
    r = record("PM-04")
    response = TradeResult.model_validate(r["closePositionResponse"])
    closing = HistoryOrder.model_validate(r["closing"])
    # The response names the position that was reduced; the closing SELL gets the next Order No.
    assert rules.response_names(response, response.positionId) == []
    assert int(closing.orderId) > int(response.positionId)
    assert closing.orderType == 1


def test_pm06_full_close_response_names_the_position(record):
    r = record("PM-06")
    response = TradeResult.model_validate(r["closePositionResponse"])
    position = OpenPosition.model_validate(r["position"])
    history = HistoryPosition.model_validate(r["history"])
    assert rules.response_names(response, position.orderId) == []
    assert history.positionId == position.orderId


def test_bo02_bulk_delete_returns_exactly_the_cancelled_orders(record):
    r = record("BO-02")
    result = BulkDeleteResult.model_validate(r["bulkDelete"])
    assert sorted(map(str, result.deletedOrderIds)) == sorted(r["cancelledIds"])


# --- reads ---------------------------------------------------------------------------------------------


@pytest.mark.parametrize("test_id", ["AC-00", "AC-99"])
def test_account_guard_counts_are_zero(record, test_id):
    counts = OrderCounts.model_validate(record(test_id)["counts"])
    assert (counts.marketOrderCounts, counts.pendingOrderCounts) == (0, 0)


def test_sm01_primary_symbol_is_open_and_tradable(record):
    detail = SymbolDetail.model_validate(record("SM-01")["symbolDetail"])
    assert (detail.symbol, detail.status, detail.tradable, detail.tradableExeMode) == ("XAUUSD", "TRADING", True, True)
    assert {"MARKET", "LIMIT", "STOP", "STOP_LIMIT"} <= set(detail.orderTypes)


def test_mc04_really_closed_symbol_reports_closed_flags(record):
    detail = SymbolDetail.model_validate(record("MC-04")["symbolDetail"])
    assert (detail.status, detail.tradable, detail.closable) == ("CLOSED", False, False)
