#!/usr/bin/env python3
"""Aggregate Caddy JSON access logs into a public, non-sensitive health snapshot."""

from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import tempfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from glob import glob
from pathlib import Path
from typing import Iterable

BREACH_EXIT_CODE = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log-pattern", required=True, help="Glob for active and rotated Caddy JSON logs.")
    window = parser.add_mutually_exclusive_group()
    window.add_argument("--since-minutes", type=positive_float)
    window.add_argument(
        "--window-start",
        type=parse_time,
        help="Fixed ISO-8601 UTC window start. Unlike --since-minutes, this does not imply a requested duration.",
    )
    parser.add_argument("--max-5xx-rate-percent", type=non_negative_float, default=1.0)
    parser.add_argument("--min-requests", type=positive_int, default=20)
    parser.add_argument("--exclude-path", action="append", default=[], help="Exact request path to omit from user-traffic metrics.")
    parser.add_argument(
        "--exclude-user-agent-prefix",
        action="append",
        default=[],
        help="Case-insensitive User-Agent prefix to omit from user-traffic metrics.",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--now", help="Fixed ISO-8601 time for deterministic verification.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)
    if args.window_start is not None:
        cutoff = args.window_start
        if cutoff > now:
            raise SystemExit("--window-start must not be later than --now/current time.")
    else:
        since_minutes = args.since_minutes if args.since_minutes is not None else 60.0
        cutoff = now - timedelta(minutes=since_minutes)
    paths = sorted(Path(path) for path in glob(args.log_pattern) if Path(path).is_file())

    statuses: Counter[int] = Counter()
    durations_ms: list[float] = []
    invalid_lines = 0
    excluded_requests = 0
    excluded_user_agent_requests = 0
    requests = 0
    excluded_paths = set(args.exclude_path)
    excluded_user_agent_prefixes = tuple(prefix.casefold() for prefix in args.exclude_user_agent_prefix)
    first_observed_at: datetime | None = None
    last_observed_at: datetime | None = None
    log_coverage_start: datetime | None = None
    log_coverage_end: datetime | None = None

    for path in paths:
        for line in read_lines(path):
            try:
                entry = json.loads(line)
                timestamp = datetime.fromtimestamp(float(entry["ts"]), tz=timezone.utc)
                status = int(entry["status"])
                duration_ms = max(0.0, float(entry.get("duration", 0.0)) * 1000.0)
                request = entry.get("request") or {}
                request_path = str(request.get("uri", "")).split("?", 1)[0]
                user_agent = request_user_agent(request)
            except (KeyError, TypeError, ValueError, json.JSONDecodeError, OverflowError):
                invalid_lines += 1
                continue

            if timestamp > now + timedelta(minutes=1):
                continue
            log_coverage_start = timestamp if log_coverage_start is None else min(log_coverage_start, timestamp)
            log_coverage_end = timestamp if log_coverage_end is None else max(log_coverage_end, timestamp)
            if timestamp < cutoff:
                continue
            if request_path in excluded_paths:
                excluded_requests += 1
                continue
            if excluded_user_agent_prefixes and user_agent.casefold().startswith(excluded_user_agent_prefixes):
                excluded_requests += 1
                excluded_user_agent_requests += 1
                continue

            requests += 1
            statuses[status] += 1
            durations_ms.append(duration_ms)
            first_observed_at = timestamp if first_observed_at is None else min(first_observed_at, timestamp)
            last_observed_at = timestamp if last_observed_at is None else max(last_observed_at, timestamp)

    server_errors = sum(count for status, count in statuses.items() if 500 <= status <= 599)
    client_errors = sum(count for status, count in statuses.items() if 400 <= status <= 499)
    server_error_rate = (server_errors / requests * 100.0) if requests else 0.0

    if requests < args.min_requests:
        status = "insufficient_data"
    elif server_error_rate >= args.max_5xx_rate_percent:
        status = "breach"
    else:
        status = "ok"

    report = {
        "status": status,
        "generatedAt": iso_time(now),
        "logCoverageStart": iso_time(log_coverage_start) if log_coverage_start else None,
        "logCoverageEnd": iso_time(log_coverage_end) if log_coverage_end else None,
        "retentionCoversWindowStart": log_coverage_start is not None and log_coverage_start <= cutoff,
        **(
            {"windowMinutes": since_minutes}
            if args.window_start is None
            else {
                "windowMode": "fixed_start",
                "windowStart": iso_time(cutoff),
                "logCoverageStart": iso_time(log_coverage_start) if log_coverage_start else None,
                "logCoverageEnd": iso_time(log_coverage_end) if log_coverage_end else None,
                "retentionCoversWindowStart": log_coverage_start is not None and log_coverage_start <= cutoff,
            }
        ),
        "cutoff": iso_time(cutoff),
        "thresholds": {
            "minimumRequests": args.min_requests,
            "maximumServerErrorRatePercentExclusive": args.max_5xx_rate_percent,
        },
        "filesRead": len(paths),
        "invalidLines": invalid_lines,
        "excludedPaths": sorted(excluded_paths),
        "excludedUserAgentPrefixes": list(args.exclude_user_agent_prefix),
        "excludedRequests": excluded_requests,
        "excludedUserAgentRequests": excluded_user_agent_requests,
        "requests": requests,
        "firstObservedAt": iso_time(first_observed_at) if first_observed_at else None,
        "lastObservedAt": iso_time(last_observed_at) if last_observed_at else None,
        "observedSpanMinutes": round((last_observed_at - first_observed_at).total_seconds() / 60.0, 3)
        if first_observed_at and last_observed_at
        else 0.0,
        "clientErrors": client_errors,
        "serverErrors": server_errors,
        "serverErrorRatePercent": round(server_error_rate, 3),
        "statusCounts": {str(code): statuses[code] for code in sorted(statuses)},
        "durationMs": {
            "p50": percentile(durations_ms, 50),
            "p75": percentile(durations_ms, 75),
            "p95": percentile(durations_ms, 95),
            "max": round(max(durations_ms), 3) if durations_ms else 0.0,
        },
    }

    atomic_write_json(args.output, report)
    print(json.dumps(report, ensure_ascii=False, separators=(",", ":")))
    return BREACH_EXIT_CODE if status == "breach" else 0


def read_lines(path: Path) -> Iterable[str]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8", errors="replace") as handle:
        yield from handle


def request_user_agent(request: object) -> str:
    if not isinstance(request, dict):
        return ""
    headers = request.get("headers")
    if not isinstance(headers, dict):
        return ""
    raw_values = headers.get("User-Agent", headers.get("user-agent", []))
    if isinstance(raw_values, str):
        return raw_values
    if isinstance(raw_values, list):
        return " ".join(str(value) for value in raw_values)
    return ""


def percentile(values: list[float], requested_percentile: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    rank = max(1, math.ceil(requested_percentile / 100 * len(ordered)))
    return round(ordered[rank - 1], 3)


def atomic_write_json(path: Path, report: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_path = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, 0o644)
        os.replace(temporary_path, path)
    except BaseException:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise argparse.ArgumentTypeError("--now must include a timezone.")
    return parsed.astimezone(timezone.utc)


def iso_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def positive_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed) or parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive finite number")
    return parsed


def non_negative_float(value: str) -> float:
    parsed = float(value)
    if not math.isfinite(parsed) or parsed < 0:
        raise argparse.ArgumentTypeError("value must be a non-negative finite number")
    return parsed


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be a positive integer")
    return parsed


if __name__ == "__main__":
    raise SystemExit(main())
