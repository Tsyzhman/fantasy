"""Rebuild the Sports.ru expected-points calibrations from the prematch replay."""
# @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

MODELS = {"fo": 1, "alt": 2}
FEATURES = ["base", "GK", "DEF", "MID", "FWD", "starter", "home", "form5",
            "form3Minus5", "minuteShare", "historyCoverage", "xg90", "xa90",
            "shots90", "recoveries90", "saves90"]
WEIGHTS = [i / 10 for i in range(1, 11)]
ALPHA = 150
DAY = 86_400_000


def millis(date):
    return int(datetime.fromisoformat(date).replace(tzinfo=timezone.utc).timestamp() * 1000)


def hundredths(values):
    return np.floor(values * 100 + 0.5) / 100


def read_rows(path, phases):
    groups = {phase: [] for phase in phases}
    rounds = {phase: set() for phase in phases}
    dates = {phase: set() for phase in phases}
    for line in path.open(encoding="utf-8"):
        phase, key, actual, fo, alt, _, p, _, team, _, deadline, finished = json.loads(line)
        if phase == "holdout" and deadline >= millis("2026-11-07"):
            phase = "later"
        if phase not in groups:
            continue
        end = {"train": "2026-10-09", "selection": "2026-10-23"}
        if phase in end and finished + 3 * DAY >= millis(end[phase]):
            raise ValueError(f"Result available too late for {phase}: {key}")
        matches, minutes = p[36] or 0, p[37] or 0
        form5 = p[30] or 0
        # Feature layout produced by fivePlusPlayerFeatures and fivePlusFixtureFeatures.
        x = [*p[:4], p[7] or 0, team[0], form5, (p[27] or 0) - form5,
             min(1, minutes / (90 * max(1, matches))), min(1, matches / 5),
             *[p[i] or 0 for i in (63, 65, 69, 87, 89)]]
        groups[phase].append([actual, fo, alt, *x])
        rounds[phase].add(key)
        dates[phase].add(datetime.fromtimestamp(deadline / 1000, timezone.utc).date().isoformat())
    return {k: np.asarray(v, dtype=float).reshape(-1, 3 + len(FEATURES) - 1) for k, v in groups.items()}, {
        k: {"rounds": len(rounds[k]), "firstDeadline": min(dates[k], default=None),
            "lastDeadline": max(dates[k], default=None)} for k in groups}


def inputs(rows, column):
    base = hundredths(rows[:, column])
    x = np.column_stack((base, rows[:, 3:]))
    valid = (base > 0) & (x[:, FEATURES.index("historyCoverage")] > 0)
    return base, x, valid


def fit_ridge(x, y):
    mean, scale = x.mean(axis=0), x.std(axis=0)
    scale[scale == 0] = 1
    standardized = (x - mean) / scale
    coefs = np.linalg.solve(standardized.T @ standardized + ALPHA * np.eye(x.shape[1]),
                            standardized.T @ (y - y.mean())) / scale
    return float(y.mean() - mean @ coefs), coefs


def predict(rows, column, model):
    base, x, valid = inputs(rows, column)
    ridge = model["intercept"] + x @ [model["coefficients"][key] for key in FEATURES]
    return hundredths(np.where(valid, base + model["weight"] * (ridge - base), base))


def metrics(actual, points):
    signal = hundredths(points) >= 5
    positive = actual >= 5
    hits, signals, positives = int((signal & positive).sum()), int(signal.sum()), int(positive.sum())
    err = hundredths(points) - actual
    return {"rows": len(actual), "actual5": positives, "hits": hits, "signals": signals,
            "precision": hits / signals if signals else None, "recall": hits / positives if positives else None,
            "mae": float(np.abs(err).mean()), "rmse": float(np.sqrt((err ** 2).mean()))}


def fit(path):
    data, intervals = read_rows(path, ("train", "selection"))
    selection = data["selection"][np.isfinite(data["selection"][:, 2])]
    models, reports = {}, {}
    for name, col in MODELS.items():
        train = data["train"][np.isfinite(data["train"][:, col])]
        base, x, valid = inputs(train, col)
        baseline = metrics(selection[:, 0], selection[:, col])
        candidates = []
        for method in ("direct", "residual"):
            # Both targets are in points. Residual fixes the base coefficient at one.
            if method == "direct":
                intercept, coefs = fit_ridge(x[valid], train[valid, 0])
            else:
                intercept, extra = fit_ridge(x[valid, 1:], train[valid, 0] - base[valid])
                coefs = np.r_[1.0, extra]
            for weight in WEIGHTS:
                model = {"method": method, "weight": weight, "intercept": round(intercept, 12),
                         "coefficients": dict(zip(FEATURES, np.round(coefs, 12).tolist(), strict=True))}
                performance = metrics(selection[:, 0], predict(selection, col, model))
                candidates.append((model, performance))
        eligible = [(m, v) for m, v in candidates if v["precision"] is not None
                    and v["precision"] > baseline["precision"] and v["recall"] >= .8 * baseline["recall"]
                    and v["mae"] < baseline["mae"] and v["rmse"] < baseline["rmse"]]
        winner, performance = min(eligible, key=lambda item: item[1]["rmse"])
        models[name] = winner
        reports[name] = {"availableTrain": len(train), "fittedTrain": int(valid.sum()),
                         "selectionBefore": baseline, "selectionAfter": performance,
                         "candidates": [{"method": m["method"], "weight": m["weight"], **v} for m, v in candidates]}
    return models, {"intervals": intervals, "ridgePenalty": ALPHA, "models": reports}


def evaluate(path, models):
    data, intervals = read_rows(path, ("holdout", "later"))
    out = {}
    for phase, rows in data.items():
        paired = rows[np.isfinite(rows[:, 2])]
        out[phase] = {"dates": intervals[phase], "fullRows": len(rows), "pairedRows": len(paired)}
        if not len(paired):
            continue
        scores = {}
        for name, col in MODELS.items():
            old = metrics(paired[:, 0], paired[:, col])
            scores[name] = predict(paired, col, models[name])
            new = metrics(paired[:, 0], scores[name])
            out[phase][name] = {"before": old, "after": new}
        digest = hashlib.sha256()
        for fo, alt in zip(scores["fo"], scores["alt"], strict=True):
            digest.update(f"{round(100 * fo)},{round(100 * alt)}\n".encode("ascii"))
        out[phase]["pairedPointsSha256"] = digest.hexdigest()
        out[phase]["fullFo"] = {"before": metrics(rows[:, 0], rows[:, 1]),
                                 "after": metrics(rows[:, 0], predict(rows, 1, models["fo"]))}
    return out


def write(path, value):
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("fit", "evaluate"))
    parser.add_argument("features", type=Path)
    parser.add_argument("model", type=Path)
    parser.add_argument("report", type=Path)
    args = parser.parse_args()
    if args.operation == "fit":
        models, report = fit(args.features)
        write(args.model, models)
    else:
        report = evaluate(args.features, json.loads(args.model.read_text(encoding="utf-8")))
    with args.features.open("rb") as handle:
        report["featuresSha256"] = hashlib.file_digest(handle, "sha256").hexdigest()
    write(args.report, report)
