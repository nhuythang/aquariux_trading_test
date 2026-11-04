"""Pydantic models for the records the Web Trader backend returns.

They are the schema contract for the JSON records the UI suite captures (artifacts/records). Only fields
the checks rely on are declared; anything else the API adds is ignored, so a new backend field does not
break validation, while a missing, mistyped or out-of-range field does.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, NonNegativeFloat, PositiveFloat

OrderId = Annotated[str, Field(pattern=r"^\d+$")]
"""Order No. / position id: numeric, sent as a string."""

EpochMs = Annotated[int, Field(gt=1_600_000_000_000)]
"""Timestamp in epoch milliseconds, after 2020 (rules out 0, seconds and negative sentinels)."""

Price = PositiveFloat
StopPrice = NonNegativeFloat
"""SL/TP: 0 means "not set"."""

# Order type codes (MT5): 0 buy, 1 sell, 2 buy limit, 3 sell limit, 4 buy stop, 5 sell stop, 8 buy stop limit.
MarketType = Literal[0, 1]
PendingType = Literal[2, 3, 4, 5, 8]
OrderType = Literal[0, 1, 2, 3, 4, 5, 8]

STATE_CANCELED = 9
STATE_FILLED = 11


class Record(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class TradeResult(Record):
    """Response of the trade endpoints: POST /market and /limit (place; `clOrdId` is the new Order No.),
    PATCH /market and /limit (modify), PUT /v1 (close) and DELETE /v1 (delete pending)."""

    clOrdId: OrderId
    positionId: OrderId
    """"0" when placing a pending order (no position yet)."""
    positionReference: OrderId
    traceId: str


class OpenPosition(Record):
    """GET /api/trade/order/v1 (one open position)."""

    orderId: OrderId
    symbol: str
    orderType: MarketType
    decimal: int
    lotSize: PositiveFloat
    lotSizeStep: PositiveFloat
    minContractLotSize: PositiveFloat
    contractSize: PositiveFloat
    units: PositiveFloat
    openPrice: Price
    currentPrice: Price
    stopLoss: StopPrice
    takeProfit: StopPrice
    profit: float
    openTime: EpochMs
    comment: str


class PendingOrder(Record):
    """GET /api/trade/order/v1/pending (one pending order)."""

    orderId: OrderId
    symbol: str
    orderType: PendingType
    decimal: int
    lotSize: PositiveFloat
    units: PositiveFloat
    price: Price
    priceTrigger: StopPrice | None = None
    """Stop Limit only: the limit price placed once `price` (the stop) is reached; 0 or null otherwise."""
    stopLoss: StopPrice
    takeProfit: StopPrice
    tradeExpiry: Literal["GTC", "GTD", "SPECIFIED_DAY", "SPECIFIED_TIMESTAMP"]
    expiration: int | None = None
    openTime: EpochMs


class HistoryPosition(Record):
    """GET /api/order/v3/histories?type=POSITION (one closed position, aggregated over partial closes)."""

    positionId: OrderId
    orderId: OrderId
    symbol: str
    orderType: MarketType
    status: Literal["CLOSED"]
    decimal: int
    lotSize: PositiveFloat
    contractSize: PositiveFloat
    units: PositiveFloat
    openPrice: Price
    closePrice: Price
    stopLoss: StopPrice
    takeProfit: StopPrice
    profit: float
    openTime: EpochMs
    closeTime: EpochMs


class Deal(Record):
    dealId: OrderId
    symbol: str
    lotSize: PositiveFloat
    price: Price
    profit: float
    openTime: EpochMs


class HistoryOrder(Record):
    """GET /api/trade/order/v1/deal/histories (one order of Orders & Deals with its executions)."""

    orderId: OrderId
    symbol: str
    orderType: OrderType
    state: Literal[9, 11]
    lotSize: PositiveFloat
    lotSizeFilled: NonNegativeFloat
    openPrice: Price
    openTime: EpochMs
    closeTime: EpochMs
    deals: list[Deal]


class NotificationMetadata(Record):
    orderId: OrderId
    """The position's Order No. (for a close notification too)."""
    symbol: str
    cmd: MarketType
    lotSize: PositiveFloat
    openPrice: Price
    closePrice: Price
    stopLoss: StopPrice
    takeProfit: StopPrice
    profit: float
    digit: int


class OrderNotification(Record):
    """GET /api/notification/v2?notificationType=ORDER (one item of the bell's Positions tab)."""

    id: str
    message: str
    orderId: OrderId
    created: EpochMs
    notificationTemplate: Literal["NT_ORDER_CREATE", "NT_ORDER_CLOSE"]
    metadata: NotificationMetadata


class BulkCloseResult(Record):
    """Response of PUT /api/trade/trade/v1/bulk."""

    closedOrderIds: list[int]


class BulkDeleteResult(Record):
    """Response of PUT /api/trade/trade/v1/limit/bulk."""

    deletedOrderIds: list[int]


class OrderCounts(Record):
    """GET /api/trade/order/v1/counts."""

    marketOrderCounts: Annotated[int, Field(ge=0)]
    pendingOrderCounts: Annotated[int, Field(ge=0)]


class SymbolDetail(Record):
    """GET /api/market/v1/symbol/detail?symbol=: trading parameters the UI and the tests rely on."""

    symbol: str
    digits: Annotated[int, Field(ge=0, le=8)]
    pointStep: PositiveFloat
    stopsLevel: Annotated[int, Field(ge=0)]
    contractSize: PositiveFloat
    minContractLotSize: PositiveFloat
    maxContractLotSize: PositiveFloat
    lotSizeStep: PositiveFloat
    ask: Price
    bid: Price
    status: Literal["TRADING", "CLOSED", "OFFQUOTES"]
    tradable: bool
    tradableExeMode: bool
    holiday: bool
    online: bool
    closable: bool
    orderTypes: list[Literal["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]]
    expirationTypes: list[Literal["GTC", "GTD", "SPECIFIED_TIMESTAMP", "SPECIFIED_DAY"]]


class TradeError(Record):
    """A refused trade request as the UI test saw it: HTTP status plus the backend's error envelope."""

    status: Annotated[int, Field(ge=400, lt=500)]
    code: Annotated[str, Field(pattern=r"^MT\d_\d+$")]
    message: Annotated[str, Field(min_length=1)]
