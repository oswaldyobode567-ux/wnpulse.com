"""Small pure helpers for first-party journey and public results measurement."""
import hashlib
import math
import re

JOURNEY_EVENTS = ("visit", "free_pick", "signup", "return", "telegram", "pro")
JOURNEY_SOURCES = ("direct", "telegram", "facebook", "instagram", "tiktok", "campaign")


def journey_key(token):
    if not isinstance(token, str) or not re.fullmatch(r"[0-9a-f]{32}", token):
        return None
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def summarize_journeys(journeys, requests, now, parse_date):
    by_id = {row["_id"]: row for row in journeys}
    result = {}
    for row in by_id.values():
        source = row.get("source")
        source = source if source in JOURNEY_SOURCES else "direct"
        data = result.setdefault(source, {"visits": 0, "free_pick": 0, "telegram": 0, "pro": 0,
                                           "signup": 0, "return": 0, "checkout": 0, "paid": 0})
        data["visits"] += 1
        events = row.get("events") or []
        for name in ("free_pick", "signup", "telegram", "pro"):
            data[name] += int(name in events)
        data["return"] += int("signup" in events and "return" in events)
    checkout, paid = set(), set()
    for row in requests:
        key = row.get("journey_id")
        visit = by_id.get(key)
        created = parse_date(row.get("created_at"))
        started = parse_date(visit.get("started_at")) if visit else None
        if not started or not created or not started <= created <= now:
            continue
        user = str(row.get("user_id") or "")
        env = str(row.get("payment_environment") or "").lower()
        if not user or user.startswith("health-") or row.get("health_monitor_run_id") or env in {"sandbox", "test"}:
            continue
        checkout.add(key)
        confirmed = parse_date(row.get("paid_at")) or parse_date(row.get("approved_at"))
        provider = row.get("payment_provider")
        valid_provider = (provider in {"manual_momo", "manual_legacy"} or
            (provider == "fedapay" and env == "live" and row.get("activation_applied") is True
             and bool(row.get("fedapay_verified_at"))))
        if (confirmed and created <= confirmed <= now and row.get("status") == "approved" and valid_provider
                and str(row.get("payment_status") or "").lower() not in
                {"refunded", "reversed", "chargeback", "canceled", "cancelled", "declined", "failed"}):
            paid.add(key)
    for name, keys in (("checkout", checkout), ("paid", paid)):
        for key in keys:
            source = by_id[key].get("source")
            result[source if source in JOURNEY_SOURCES else "direct"][name] += 1
    return {"sources": result, "totals": {k: sum(v[k] for v in result.values())
        for k in ("visits", "free_pick", "signup", "return", "telegram", "pro", "checkout", "paid")}}


def record_published_roi(bucket, result, odds):
    try:
        price = float(odds)
    except (TypeError, ValueError, OverflowError):
        return
    if result not in ("won", "lost") or not math.isfinite(price) or price <= 1:
        return
    bucket["priced"] = bucket.get("priced", 0) + 1
    bucket["net"] = bucket.get("net", 0.0) + (price - 1 if result == "won" else -1)


def published_roi(bucket):
    priced = bucket.get("priced", 0)
    return {"roi_sample": priced,
            "roi_percent": round(100 * bucket.get("net", 0.0) / priced, 2) if priced else None}
