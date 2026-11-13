"""Prospective comparison of a stricter ranking against WinPulse's published pick.

One unit is hypothetical and used only for comparing published prices.
Nothing in this module can publish, change or settle a customer's picks.
"""
import math

from prediction_engine import _hybrid_dt, _quote_timestamp_for, settle_comparison_candidate


PROTOCOL = "paired-football-selective-v2-20261110"
MIN_ODDS = 1.20
MIN_WIN = 65.0
MIN_BOOKS = 3
MAX_QUOTE_AGE = 90 * 60
MIN_EVIDENCE = 100
PICK_FIELDS = (
    "market", "pick", "pick_raw", "pick_point", "team", "pick_odds",
    "best_bookmaker", "estimated_win_probability", "estimated_loss_probability",
    "push_probability", "probability_basis", "probability_source", "num_books",
)


def _number(value):
    try:
        n = float(value)
        return n if not isinstance(value, bool) and math.isfinite(n) else None
    except (ValueError, TypeError, OverflowError):
        return None


def _probabilities(row):
    # Confidence or a percentage conditional on refund is not a win probability.
    win = _number(row.get("estimated_win_probability"))
    push = _number(row.get("push_probability"))
    if push is None and row.get("market") in {"h2h", "double_chance", "btts"}:
        push = 0.0
    if win is None or push is None or not (0 <= win <= 100 and 0 <= push <= 100 - win + 1e-8):
        return None
    return win, push


def _freeze(row, match):
    if not row.get("pick") or not settle_comparison_candidate(
        row, 0, 0, match["home_team"], match["away_team"],
    ):
        return None
    return {key: row.get(key) for key in PICK_FIELDS}


def select_candidate(markets, match, now):
    eligible = []
    for row in markets:
        if (row.get("synthetic") or row.get("analysis_only") or row.get("selection_available") is False
                or row.get("quote_status") == "stale"):
            continue
        odds = _number(row.get("pick_odds")) or 0
        books = _number(row.get("num_books")) or 0
        probabilities = _probabilities(row)
        if odds < MIN_ODDS or books < MIN_BOOKS or not probabilities or probabilities[0] < MIN_WIN:
            continue
        win, push = probabilities
        # Remove two probability points as a conservative ranking rule, not a
        # confidence interval. Refunds return the unit; they are not victories.
        conservative_return = ((win - 2.0) * odds + push) / 100 - 1
        if conservative_return < 0:
            continue
        frozen = _freeze(row, match)
        if not frozen:
            continue
        quote_at = _quote_timestamp_for(match, row)
        if not quote_at or not 0 <= (now - quote_at).total_seconds() <= MAX_QUOTE_AGE:
            continue
        frozen.update(quote_updated_at=quote_at.isoformat(), num_books=int(books),
                      estimated_win_probability=win, push_probability=push,
                      estimated_loss_probability=max(0.0, 100 - win - push),
                      probability_basis="unconditional")
        eligible.append((win, min(books, 8), conservative_return, str(frozen["pick"]), frozen))
    if not eligible:
        return None
    return max(eligible, key=lambda item: item[:-1])[-1]


def comparison_forecast(prediction, match, now):
    kickoff = _hybrid_dt(match.get("commence_time"))
    official_at = _hybrid_dt(prediction.get("official_frozen_at"))
    if (not prediction.get("is_primary_official") or not match.get("id")
            or not str(match.get("sport_key") or "").startswith("soccer_")
            or not kickoff or not official_at or not official_at <= now < kickoff
            or prediction.get("is_live") or prediction.get("is_finished")
            or match.get("is_live") or match.get("completed") or match.get("is_finished")
            or not match.get("home_team") or not match.get("away_team")):
        return None
    baseline = _freeze(prediction, match)
    if not baseline:
        return None
    return {
        "version": PROTOCOL, "captured_at": now.isoformat(), "baseline": baseline,
        "challenger": select_candidate(prediction.get("markets") or [], match, now),
    }


def _paired_roi_interval(rows):
    """Bootstrap paired ROI differences by match day to preserve daily clusters."""
    import random
    blocks = {}
    for row in rows:
        value = row.get("evaluation") or {}
        stamp = _hybrid_dt(row.get("commence_time"))
        if row.get("state") != "resolved" or not value.get("challenger") or not stamp:
            continue
        gap = value["challenger"]["unit_return"] - value["baseline"]["unit_return"]
        blocks.setdefault(stamp.date(), []).append(gap)
    if len(blocks) < 10:
        return None
    days = [(sum(values), len(values)) for values in blocks.values()]
    rng = random.Random(260113)
    samples = []
    for _ in range(1000):
        draw = rng.choices(days, k=len(days))
        samples.append(100 * sum(total for total, _ in draw) / sum(n for _, n in draw))
    samples.sort()
    return {"low": round(samples[25], 2), "high": round(samples[974], 2), "days": len(days),
            "matches": sum(n for _, n in days)}


def summarize(rows):
    settled = [r["evaluation"] for r in rows if r.get("state") == "resolved" and r.get("evaluation")]
    both = [v for v in settled if v.get("challenger")]
    same_target = [v for v in both if v.get("same_selection") and all(
        "brier" in v[arm] and "log_loss" in v[arm] for arm in ("baseline", "challenger")
    )]
    def metrics(values, events):
        n = len(values)
        won = sum(v["result"] == "won" for v in values)
        lost = sum(v["result"] == "lost" for v in values)
        net = sum(v["unit_return"] - 1 for v in values)
        return dict(bets=n, won=won, lost=lost, void=n-won-lost,
                    win_rate=round(100*won/(won+lost), 2) if won+lost else None,
                    roi=round(100*net/n, 2) if n else None,
                    net_per_100_events=round(100*net/events, 2) if events else None)
    arms = {a: metrics([v[a] for v in settled if v.get(a)], len(settled))
            for a in ("baseline", "challenger")}
    paired = {a: metrics([v[a] for v in both], len(both)) for a in arms}
    competitions = {}
    for row in rows:
        value = row.get("evaluation") or {}
        if row.get("state") != "resolved" or not value.get("challenger") or not row.get("sport_key"):
            continue
        competitions.setdefault(row["sport_key"], []).append(value)
    by_competition = [
        {"competition": key, "paired": len(values),
         **{arm: metrics([value[arm] for value in values], len(values)) for arm in arms}}
        for key, values in sorted(competitions.items(), key=lambda item: (-len(item[1]), item[0]))
    ]
    return {
        "by_competition": by_competition,
        "paired_roi_interval": _paired_roi_interval(rows),
        "protocol": PROTOCOL, "observed": len(rows), "resolved": len(settled),
        "pending": len(rows)-len(settled), "paired": len(both),
        "passed": len(settled)-len(both),
        "coverage": round(100*len(both)/len(settled), 1) if settled else None,
        "different_choices": sum(not v["same_selection"] for v in both),
        "min_review_pairs": MIN_EVIDENCE, "arms": arms, "same_event_arms": paired,
        "identical_market_count": len(same_target),
        "probability_metrics": {
            a: {m: round(sum(v[a][m] for v in same_target)/len(same_target), 5) if same_target else None
                for m in ("brier", "log_loss")} for a in arms
        },
        "automatic_promotion": False,
    }
