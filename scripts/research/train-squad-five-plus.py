# @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
"""Fit and export the five Sports.ru classifiers from the chronological replay."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss
from threadpoolctl import threadpool_limits

# Order matches squadResearchForecasts. Each model uses its own expected-points forecast.
MODELS = [
    ("ridge", "FIT", "player", 7, 0.08),
    ("blendForm", "MIX", "archive", 11, 0.08),
    ("shrunkXA", "GAS", "player", 7, 0.16),
    ("rules", "REF", "archive", 5, 0.16),
    ("minuteHistory", "TIK", "archive", 7, 0.08),
]
CONTEXT_WEIGHTS = (0.08, 0.12, 0.16, 0.22)
CALIBRATION_CUTOFF = int(datetime(2026, 10, 16, tzinfo=timezone.utc).timestamp() * 1000)
THREE_DAYS = 3 * 86_400_000


def load_rows(path):
    with path.open(encoding="utf-8") as source:
        first = json.loads(next(source))
        sizes = tuple(len(group) for group in first[6:10])
        rows = 1 + sum(1 for _ in source)
    features = np.empty((rows, 1 + sum(sizes)), dtype=np.float32)
    prior = np.empty((rows, 5), dtype=np.float32)
    baselines = np.empty((rows, 2), dtype=np.float32)
    phase = np.empty(rows, dtype=np.int8)
    deadlines = np.empty(rows, dtype=np.int64)
    finished = np.empty(rows, dtype=np.int64)
    labels = np.empty(rows, dtype=bool)
    rounds = []
    phases = {"train": 0, "selection": 1, "holdout": 2}
    with path.open(encoding="utf-8") as source:
        for i, line in enumerate(source):
            part, round_id, points, fo, alt, old, player, history, team, opponent, deadline, end = json.loads(line)
            if tuple(map(len, (player, history, team, opponent))) != sizes:
                raise ValueError(f"Inconsistent feature count on row {i + 1}")
            features[i, 1:] = [*player, *history, *team, *opponent]
            prior[i] = old
            baselines[i] = [fo, alt]
            labels[i] = points >= 5
            phase[i] = phases[part]
            deadlines[i] = deadline
            finished[i] = end
            rounds.append(round_id)
    features[:, 0] = np.nan
    return features, prior, baselines, phase, deadlines, finished, labels, np.array(rounds), sizes


def classification(actual, marked):
    tp = int(actual[marked].sum())
    flagged = int(marked.sum())
    positives = int(actual.sum())
    return {
        "rows": len(actual), "actual": positives, "flagged": flagged, "tp": tp,
        "fp": flagged - tp, "fn": positives - tp, "tn": len(actual) - positives - flagged + tp,
        "precision": tp / flagged if flagged else None, "recall": tp / positives if positives else None,
        "f1": 2 * tp / (flagged + positives) if flagged + positives else None,
    }


def report(actual, raw, threshold=None):
    if threshold is None:
        raw = np.floor(raw.astype(np.float64) * 100 + 0.5) / 100
        marked = raw >= 5
    else:
        marked = round_percent(raw) >= threshold
    summary = classification(actual, marked)
    summary["averagePrecision"] = float(average_precision_score(actual, raw))
    if threshold is not None:
        summary["brier"] = float(brier_score_loss(actual, raw))
        summary["meanProbability"] = float(raw.mean())
    return summary


def round_percent(probability):
    return np.floor(probability * 1000 + 0.5) / 10


def new_tree(data, labels, leaves):
    return HistGradientBoostingClassifier(
        max_iter={5: 65, 7: 90, 11: 110}[leaves], max_leaf_nodes=leaves,
        min_samples_leaf=100, learning_rate=0.055, l2_regularization=8,
        early_stopping=False, max_bins=63
    ).fit(data, labels)


def event_signal(x):
    pos = np.argmax(x[:, 1:5], axis=1)
    appearance, goals, assists, clean = x[:, 10], x[:, 13], x[:, 14], x[:, 15]
    group = np.where(pos == 0, x[:, 17], x[:, 18])
    three_events = 1 - np.exp(-group) * (1 + group + group * group / 2)
    attack = 1 - np.exp(-goals - assists)
    defence = np.where(pos <= 1, clean, three_events * np.where(pos == 2, clean, 0))
    return np.minimum(appearance, attack + defence - attack * defence)


def select_threshold(actual, selection, combined, probability):
    candidates = []
    pct = round_percent(probability)
    for threshold in range(34, 54):
        selected = classification(actual[selection], pct[selection] >= threshold)
        pooled = classification(actual[combined], pct[combined] >= threshold)
        if (selected["flagged"] >= 80 and (selected["precision"] or 0) >= 0.51
                and (pooled["precision"] or 0) >= 0.495):
            candidates.append((threshold, selected, pooled))
    if not candidates:
        return None
    return max(candidates, key=lambda row: (row[1]["recall"], row[2]["recall"]))


def export_trees(classifier, weight):
    # scikit-learn 1.8.0 uses the fitted predictor's structured node array.
    for (tree,) in classifier._predictors:
        yield [
            float(node["value"]) * weight if node["is_leaf"] else [
                int(node["feature_idx"]), float(node["num_threshold"]),
                int(node["left"]), int(node["right"]), bool(node["missing_go_to_left"])
            ]
            for node in tree.nodes
        ]


def main(path, output, scratch=None):
    if sklearn.__version__ != "1.8.0":
        raise RuntimeError("Use scikit-learn 1.8.0 to reproduce the exported tree format and fit.")
    data, prior, baselines, phase, deadline, finished, actual, rounds, sizes = load_rows(path)
    expected_fields = data.shape[1]
    train = phase == 0
    development = phase == 1
    calibration = development & (finished + THREE_DAYS < CALIBRATION_CUTOFF)
    selection = development & (deadline >= CALIBRATION_CUTOFF)
    combined = calibration | selection
    holdout = phase == 2
    paired = holdout & np.isfinite(baselines[:, 1])
    if np.any(calibration & selection):
        raise ValueError("The calibration and threshold blocks overlap")
    event = event_signal(data)
    sample_masks = {"train": train, "calibration": calibration, "selection": selection,
                    "holdout": holdout, "paired": paired}
    report_data = {
        "featureCount": expected_fields - 1,
        "versions": {"numpy": np.__version__, "scikitLearn": sklearn.__version__},
        "samples": {key: {"rows": int(mask.sum()), "rounds": int(np.unique(rounds[mask]).size),
                          "actualFivePlus": int(actual[mask].sum())} for key, mask in sample_masks.items()},
        "baselines": {
            "FO": {"holdout": report(actual[holdout], baselines[holdout, 0]),
                   "paired": report(actual[paired], baselines[paired, 0])},
            "ALT": {"paired": report(actual[paired], baselines[paired, 1])},
        },
        "models": {}
    }
    model_data = []
    chosen_probabilities = []
    for index, (key, name, family, leaves, anchor) in enumerate(MODELS):
        data[:, 0] = prior[:, index]
        width = 1 + (sizes[0] if family == "archive" else sizes[0] + sizes[1])
        base = new_tree(data[train, :width], actual[train], leaves)
        context = new_tree(data[train], actual[train], 5)
        base_signal = base.decision_function(data[:, :width])
        context_signal = context.decision_function(data)
        candidates = []
        for weight in CONTEXT_WEIGHTS:
            raw = (1 - weight) * base_signal + weight * context_signal
            signal = (1 - anchor) * raw + anchor * (prior[:, index] - 4.25) * 1.6 + 0.6 * (event - 0.3) * 3
            fit = LogisticRegression(C=10).fit(signal[calibration, None], actual[calibration])
            probability = fit.predict_proba(signal[:, None])[:, 1]
            threshold = select_threshold(actual, selection, combined, probability)
            if threshold:
                cutoff, selected, pooled = threshold
                candidates.append((cutoff, selected, pooled, weight, fit, probability))
        if not candidates:
            raise ValueError(f"No qualifying threshold for {name}")
        cutoff, selected, pooled, weight, fit, probability = max(
            candidates, key=lambda row: (row[2]["f1"], row[1]["f1"], row[3])
        )
        intercept = (1 - weight) * float(base._baseline_prediction[0, 0]) + weight * float(context._baseline_prediction[0, 0])
        model_data.append(dict(
            intercept=intercept, anchor=anchor, event=0.6, slope=float(fit.coef_[0, 0]), offset=float(fit.intercept_[0]),
            trees=[*export_trees(base, 1 - weight), *export_trees(context, weight)]
        ))
        chosen_probabilities.append(probability)
        report_data["models"][name] = {
            "model": key, "threshold": cutoff, "baseFamily": family, "contextWeight": weight,
            "selection": selected, "combinedCalibrationAndSelection": pooled,
            "holdout": {
                "before": report(actual[holdout], prior[holdout, index]),
                "after": report(actual[holdout], probability[holdout], cutoff)
            },
            "paired": {
                "before": report(actual[paired], prior[paired, index]),
                "after": report(actual[paired], probability[paired], cutoff)
            },
            "validationCandidates": [
                {"threshold": candidate[0], "selection": candidate[1], "combined": candidate[2], "contextWeight": candidate[3]}
                for candidate in candidates
            ]
        }
        print(name, cutoff, weight, report_data["models"][name]["paired"]["after"], flush=True)
    output.mkdir(parents=True, exist_ok=True)
    marker = "// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts\n"
    marker += "// Generated by scripts/research/train-squad-five-plus.py from the dated replay.\n"
    thresholds = {key: report_data["models"][name]["threshold"] for key, name, *_ in MODELS}
    (output / "squad-research-five-plus-thresholds.ts").write_text(
        marker + "export const squadFivePlusThresholds = " + json.dumps(thresholds, indent=2) + " as const;\n", encoding="utf-8"
    )
    types = (
        "export type FivePlusTreeNode = number | [number, number, number, number, boolean];\n"
        "export type FivePlusModel = {\n"
        "  intercept: number; anchor: number; event: number; slope: number; offset: number;\n"
        "  trees: FivePlusTreeNode[][];\n"
        "};\n"
    )
    models = []
    for m in model_data:
        trees = m.pop("trees")
        values = [f"    {key}: {value}," for key, value in m.items()]
        values += ["    trees: ["] + ["      " + json.dumps(tree, separators=(",", ":")) + "," for tree in trees] + ["    ]"]
        models.append("  {\n" + "\n".join(values) + "\n  },")
    (output / "squad-research-five-plus-model.ts").write_text(
        marker + types + f"export const squadFivePlusFeatureCount = {expected_fields};\n"
        + "export const squadFivePlusModels: readonly FivePlusModel[] = [\n"
        + "\n".join(models) + "\n];\n", encoding="utf-8"
    )
    with path.open("rb") as source:
        report_data["sha256TrainingRows"] = hashlib.file_digest(source, "sha256").hexdigest()
    (output / "squad-five-plus.results.json").write_text(json.dumps(report_data, indent=2) + "\n", encoding="utf-8")
    if scratch:
        with scratch.open("w", encoding="utf-8") as target:
            for i in np.flatnonzero(holdout)[::13]:
                features = [None if np.isnan(value) else float(value) for value in data[i]]
                anchors = prior[i].astype(float).tolist()
                predictions = [float(round_percent(model[i])) for model in chosen_probabilities]
                print(json.dumps([features, anchors, float(event[i]), predictions]), file=target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("features", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--parity-sample", type=Path)
    args = parser.parse_args()
    with threadpool_limits(limits=3):
        main(args.features, args.output, args.parity_sample)
