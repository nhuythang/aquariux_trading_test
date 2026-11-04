"""Business rules as plain functions over validated records.

Each check returns a list of violations (empty when the rule holds), so a test can assert `== []` and a
failure names every broken field at once. Rule ids (R2, R5, ...) refer to docs/assumptions.md.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable

from aqx.models import (
    STATE_CANCELED,
    STATE_FILLED,
    HistoryOrder,
    HistoryPosition,
    OpenPosition,
    OrderNotification,
    PendingOrder,
    SymbolDetail,
    TradeResult,
)

BUY, SELL = 0, 1
BUY_STOP_LIMIT = 8
BUY_SIDE_PENDING = {2, 4, 8}
"""Buy limit, buy stop, buy stop limit; 3 and 5 are the sell side."""
MONEY = 0.005
"""Half a cent: P/L values are compared at 2 decimals."""


def close(a: float, b: float, tolerance: float = 1e-9) -> bool:
    return math.isclose(a, b, abs_tol=tolerance)


def is_step_multiple(value: float, step: float) -> bool:
    return close(round(value / step) * step, value, 1e-9)


# --- single records ------------------------------------------------------------------------------------


def stops_on_correct_side(side: int, entry: float, stop_loss: float, take_profit: float) -> list[str]:
    """R2. Buy: SL < entry < TP. Sell: TP < entry < SL. 0 means not set."""
    issues = []
    below, above = (stop_loss, take_profit) if side == BUY else (take_profit, stop_loss)
    below_name, above_name = ("stopLoss", "takeProfit") if side == BUY else ("takeProfit", "stopLoss")
    if below and not below < entry:
        issues.append(f"{below_name} {below} must be below entry {entry}")
    if above and not above > entry:
        issues.append(f"{above_name} {above} must be above entry {entry}")
    return issues


def position_rules(p: OpenPosition) -> list[str]:
    """R2 and R4 on an open position, plus units = lots x contract size."""
    issues = stops_on_correct_side(p.orderType, p.openPrice, p.stopLoss, p.takeProfit)
    if p.lotSize < p.minContractLotSize:
        issues.append(f"lotSize {p.lotSize} below minimum {p.minContractLotSize}")
    if not is_step_multiple(p.lotSize, p.lotSizeStep):
        issues.append(f"lotSize {p.lotSize} is not a multiple of {p.lotSizeStep}")
    if not close(p.units, p.lotSize * p.contractSize, 1e-6):
        issues.append(f"units {p.units} != lotSize {p.lotSize} x contractSize {p.contractSize}")
    return issues


def pending_rules(o: PendingOrder) -> list[str]:
    """R2 around the order price; Stop Limit: a buy's limit price (priceTrigger) is at or below its stop
    price, other types have none; dated expiries carry an expiration after the order time."""
    side = BUY if o.orderType in BUY_SIDE_PENDING else SELL
    entry = o.priceTrigger if o.orderType == BUY_STOP_LIMIT and o.priceTrigger else o.price
    issues = stops_on_correct_side(side, entry, o.stopLoss, o.takeProfit)
    if o.orderType == BUY_STOP_LIMIT:
        if o.priceTrigger is None:
            issues.append("buy stop limit without a limit price (priceTrigger)")
        elif o.priceTrigger > o.price:
            issues.append(f"buy stop limit: limit {o.priceTrigger} above stop {o.price}")
    elif o.priceTrigger:
        issues.append(f"priceTrigger {o.priceTrigger} set on a non stop-limit order")
    if o.tradeExpiry in ("SPECIFIED_DAY", "SPECIFIED_TIMESTAMP") and not (o.expiration or 0) > o.openTime:
        issues.append(f"expiry {o.tradeExpiry} needs an expiration after openTime, got {o.expiration}")
    return issues


def symbol_rules(d: SymbolDetail) -> list[str]:
    """Trading parameters are coherent: R4 lot limits, price step = 10^-digits, Ask >= Bid, and R26 a closed
    market is not tradable."""
    issues = []
    if d.minContractLotSize > d.maxContractLotSize:
        issues.append(f"min lot {d.minContractLotSize} above max lot {d.maxContractLotSize}")
    if not is_step_multiple(d.minContractLotSize, d.lotSizeStep):
        issues.append(f"min lot {d.minContractLotSize} is not a multiple of the step {d.lotSizeStep}")
    if not close(d.pointStep, 10**-d.digits, 1e-12):
        issues.append(f"pointStep {d.pointStep} != 10^-{d.digits}")
    if d.ask < d.bid:
        issues.append(f"ask {d.ask} below bid {d.bid}")
    if d.status == "CLOSED" and (d.tradable or d.closable):
        issues.append(f"closed symbol reports tradable={d.tradable}, closable={d.closable} (R26)")
    if "MARKET" not in d.orderTypes:
        issues.append(f"market orders not offered: {d.orderTypes}")
    return issues


def history_rules(h: HistoryPosition) -> list[str]:
    issues = stops_on_correct_side(h.orderType, h.openPrice, h.stopLoss, h.takeProfit)
    if h.closeTime < h.openTime:
        issues.append(f"closeTime {h.closeTime} before openTime {h.openTime}")
    if not close(h.units, h.lotSize * h.contractSize, 1e-6):
        issues.append(f"units {h.units} != lotSize {h.lotSize} x contractSize {h.contractSize}")
    return issues


def order_rules(o: HistoryOrder) -> list[str]:
    """Filled orders: fully filled by their deals. R7: cancelled orders have no fill and no deal."""
    issues = []
    filled_by_deals = sum(d.lotSize for d in o.deals)
    if o.state == STATE_FILLED:
        if not close(o.lotSizeFilled, o.lotSize):
            issues.append(f"filled order {o.orderId}: lotSizeFilled {o.lotSizeFilled} != lotSize {o.lotSize}")
        if not close(filled_by_deals, o.lotSizeFilled, 1e-9):
            issues.append(f"order {o.orderId}: deals add up to {filled_by_deals}, filled {o.lotSizeFilled}")
    if o.state == STATE_CANCELED:
        if o.lotSizeFilled != 0:
            issues.append(f"cancelled order {o.orderId} has lotSizeFilled {o.lotSizeFilled}")
        if o.deals:
            issues.append(f"cancelled order {o.orderId} has {len(o.deals)} deal(s)")
    if o.closeTime < o.openTime:
        issues.append(f"order {o.orderId}: closeTime before openTime")
    return issues


def notification_text_rules(n: OrderNotification) -> list[str]:
    """The message the user reads states the same Order No., symbol, size and price as the metadata.

    The price is compared as a number: the message drops trailing zeros ("4,040.5" for 4040.50) while the
    bell prints the symbol's fixed decimals, so the text format is not part of the rule.
    """
    m = n.metadata
    expected_price = m.openPrice if n.notificationTemplate == "NT_ORDER_CREATE" else m.closePrice
    issues = [
        f"message {n.message!r} does not contain {part!r}"
        for part in (f"#{m.orderId}", m.symbol, f"Size {m.lotSize:g}")
        if part not in n.message
    ]
    shown = re.search(r"@ ([\d,]+(?:\.\d+)?)", n.message)
    if not shown:
        issues.append(f"message {n.message!r} has no price")
    elif not close(float(shown.group(1).replace(",", "")), expected_price, 10**-m.digit / 2):
        issues.append(f"message price {shown.group(1)} != {expected_price}")
    return issues


def response_names(response: TradeResult, order_id: str) -> list[str]:
    """Modify, close and delete responses identify the order they acted on in all three id fields."""
    ids = {
        "clOrdId": response.clOrdId,
        "positionId": response.positionId,
        "positionReference": response.positionReference,
    }
    return [f"{name} {value} != {order_id}" for name, value in ids.items() if value != order_id]


# --- across records ------------------------------------------------------------------------------------


def notification_matches_position(n: OrderNotification, p: OpenPosition, digits: int) -> list[str]:
    m = n.metadata
    issues = []
    for field, expected, actual in [
        ("orderId", p.orderId, m.orderId),
        ("symbol", p.symbol, m.symbol),
        ("side", p.orderType, m.cmd),
        ("lotSize", p.lotSize, m.lotSize),
    ]:
        if expected != actual:
            issues.append(f"notification {field} {actual!r} != position {expected!r}")
    for field, expected, actual in [
        ("openPrice", p.openPrice, m.openPrice),
        ("stopLoss", p.stopLoss, m.stopLoss),
        ("takeProfit", p.takeProfit, m.takeProfit),
    ]:
        if not close(expected, actual, 10**-digits / 2):
            issues.append(f"notification {field} {actual} != position {expected}")
    return issues


def history_matches_position(h: HistoryPosition, p: OpenPosition, digits: int) -> list[str]:
    issues = []
    if h.positionId != p.orderId:
        issues.append(f"history positionId {h.positionId} != Order No. {p.orderId}")
    for field in ("symbol", "orderType", "lotSize"):
        if getattr(h, field) != getattr(p, field):
            issues.append(f"history {field} {getattr(h, field)!r} != position {getattr(p, field)!r}")
    for field in ("openPrice", "stopLoss", "takeProfit"):
        if not close(getattr(h, field), getattr(p, field), 10**-digits / 2):
            issues.append(f"history {field} {getattr(h, field)} != position {getattr(p, field)}")
    if h.openTime < p.openTime - 1000:  # history rounds to the second
        issues.append(f"history openTime {h.openTime} before the position opened {p.openTime}")
    return issues


def closed_notification_matches_history(n: OrderNotification, h: HistoryPosition, digits: int) -> list[str]:
    m = n.metadata
    issues = []
    if m.orderId != h.positionId:
        issues.append(f"notification Order No. {m.orderId} != history positionId {h.positionId}")
    if not close(m.closePrice, h.closePrice, 10**-digits / 2):
        issues.append(f"notification closePrice {m.closePrice} != history {h.closePrice}")
    if not close(m.profit, h.profit, MONEY):
        issues.append(f"notification profit {m.profit} != history profit {h.profit}")
    return issues


def partial_close_reconciles(h: HistoryPosition, closings: Iterable[HistoryOrder]) -> list[str]:
    """R5: closing orders add up to the position's volume; history's close price is their volume-weighted
    average. R6: the position's P/L is the sum of its closing deals' profit."""
    closings = list(closings)
    deals = [d for o in closings for d in o.deals]
    issues = []
    closed = sum(o.lotSizeFilled for o in closings)
    if not close(closed, h.lotSize, 1e-9):
        issues.append(f"closing orders filled {closed}, position volume {h.lotSize} (R5)")
    if deals:
        vwap = sum(d.price * d.lotSize for d in deals) / sum(d.lotSize for d in deals)
        if not close(vwap, h.closePrice, 1e-6):
            issues.append(f"close price {h.closePrice} != volume-weighted closing price {vwap} (R5)")
    deal_profit = sum(d.profit for d in deals)
    if not close(deal_profit, h.profit, MONEY):
        issues.append(f"closing deals profit {deal_profit:.2f} != position P/L {h.profit:.2f} (R6)")
    return issues


def cancelled_matches_pending(cancelled: HistoryOrder, pending: PendingOrder, digits: int) -> list[str]:
    issues = order_rules(cancelled)
    if cancelled.state != STATE_CANCELED:
        issues.append(f"order {cancelled.orderId} state {cancelled.state}, expected CANCELED ({STATE_CANCELED})")
    for field, expected, actual in [
        ("orderId", pending.orderId, cancelled.orderId),
        ("symbol", pending.symbol, cancelled.symbol),
        ("orderType", pending.orderType, cancelled.orderType),
        ("lotSize", pending.lotSize, cancelled.lotSize),
    ]:
        if expected != actual:
            issues.append(f"cancelled {field} {actual!r} != pending {expected!r}")
    if not close(cancelled.openPrice, pending.price, 10**-digits / 2):
        issues.append(f"cancelled price {cancelled.openPrice} != pending price {pending.price}")
    return issues


def position_modified(before: OpenPosition, after: OpenPosition) -> list[str]:
    """Modifying SL/TP changes only SL/TP: same Order No., symbol, side, volume, entry and open time; R2 still holds."""
    issues = []
    for field in ("orderId", "symbol", "orderType", "lotSize", "openPrice", "openTime"):
        if getattr(before, field) != getattr(after, field):
            issues.append(f"{field} changed from {getattr(before, field)!r} to {getattr(after, field)!r}")
    if (before.stopLoss, before.takeProfit) == (after.stopLoss, after.takeProfit):
        issues.append("SL/TP did not change")
    return issues + stops_on_correct_side(after.orderType, after.openPrice, after.stopLoss, after.takeProfit)


def pending_modified(before: PendingOrder, after: PendingOrder) -> list[str]:
    """Editing a pending order keeps its identity, type, volume and expiry; the new values satisfy pending_rules."""
    issues = []
    for field in ("orderId", "symbol", "orderType", "lotSize", "tradeExpiry"):
        if getattr(before, field) != getattr(after, field):
            issues.append(f"{field} changed from {getattr(before, field)!r} to {getattr(after, field)!r}")
    if (before.price, before.stopLoss, before.takeProfit) == (after.price, after.stopLoss, after.takeProfit):
        issues.append("price/SL/TP did not change")
    return issues + pending_rules(after)
