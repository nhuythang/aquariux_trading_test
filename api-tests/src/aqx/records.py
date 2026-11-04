"""Loading the records the UI suite writes, and routing each one to its model.

Every UI test that calls `recorder.add(key, value)` produces artifacts/records/<testId>.json:
    {"testId": "CR-01", "capturedAt": "...", "records": {"position": {...}, "history": {...}}}
The key names are the contract between the two layers: KEY_MODELS says which model each key holds.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict

from aqx.models import (
    BulkCloseResult,
    BulkDeleteResult,
    HistoryOrder,
    HistoryPosition,
    OpenPosition,
    OrderCounts,
    OrderNotification,
    PendingOrder,
    Record,
    SymbolDetail,
    TradeError,
    TradeResult,
)

ROOT = Path(__file__).resolve().parents[3]
CAPTURED_DIR = ROOT / "artifacts" / "records"
SAMPLE_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "records"

KEY_MODELS: dict[str, type[Record]] = {
    # trade endpoints
    "tradeResponse": TradeResult,
    "placePendingResponse": TradeResult,
    "modifyPositionResponse": TradeResult,
    "modifyPendingResponse": TradeResult,
    "closePositionResponse": TradeResult,
    "deletePendingResponse": TradeResult,
    "bulkDelete": BulkDeleteResult,
    "rejection": TradeError,
    # reads
    "symbolDetail": SymbolDetail,
    "counts": OrderCounts,
    "position": OpenPosition,
    "positionBefore": OpenPosition,
    "positionAfter": OpenPosition,
    "pending": PendingOrder,
    "pendingBefore": PendingOrder,
    "pendingAfter": PendingOrder,
    "history": HistoryPosition,
    "closing": HistoryOrder,
    "cancelled": HistoryOrder,
    "openingOrder": HistoryOrder,
    "notification": OrderNotification,
    "notificationCreated": OrderNotification,
    "notificationClosed": OrderNotification,
}
"""Keys holding one record. Lists and composite keys are handled in `typed_records`."""

ACCOUNT_FIELDS = frozenset({"account", "metatraderId", "tenantId"})
"""Fields that identify the demo account; removed before records are committed as samples."""


class RecordFile(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    testId: str
    capturedAt: datetime
    records: dict[str, Any]


def records_dir() -> Path:
    """AQX_RECORDS_DIR if set; else the records of the last UI run; else the committed samples."""
    if env := os.environ.get("AQX_RECORDS_DIR"):
        return Path(env)
    if CAPTURED_DIR.is_dir() and any(CAPTURED_DIR.glob("*.json")):
        return CAPTURED_DIR
    return SAMPLE_DIR


def load_records(directory: Path | None = None) -> dict[str, RecordFile]:
    directory = directory or records_dir()
    files = sorted(directory.glob("*.json"))
    return {f.stem: RecordFile.model_validate_json(f.read_text()) for f in files}


def typed_records(file: RecordFile) -> Iterator[tuple[str, type[Record], Any]]:
    """Yields (path, model, raw value) for every record in a file that has a model."""
    for key, value in file.records.items():
        if key in KEY_MODELS:
            yield key, KEY_MODELS[key], value
        elif key == "closingOrders":
            for i, item in enumerate(value):
                yield f"{key}[{i}]", HistoryOrder, item
        elif key == "orders":  # HN-04: {opening, closing, cancelled}
            for name, item in value.items():
                yield f"{key}.{name}", HistoryOrder, item
        elif key == "bulkClose" and "closedOrderIds" in value:  # BO-01
            yield key, BulkCloseResult, value
        elif key == "bulkClose":  # BO-03: {before, result, after}
            yield f"{key}.result", BulkCloseResult, value["result"]
            for snapshot in ("before", "after"):
                for i, item in enumerate(value[snapshot]):
                    yield f"{key}.{snapshot}[{i}]", OpenPosition, item


def scrub(value: Any) -> Any:
    """Copy of `value` without fields that identify the account."""
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items() if k not in ACCOUNT_FIELDS}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def refresh_samples(source: Path = CAPTURED_DIR, target: Path = SAMPLE_DIR) -> list[Path]:
    """Copies the last UI run's records into the committed samples, scrubbed. `python -m aqx.records`."""
    target.mkdir(parents=True, exist_ok=True)
    written = []
    for f in sorted(source.glob("*.json")):
        out = target / f.name
        out.write_text(json.dumps(scrub(json.loads(f.read_text())), indent=2) + "\n")
        written.append(out)
    return written


if __name__ == "__main__":
    for path in refresh_samples():
        print(path.relative_to(ROOT))
