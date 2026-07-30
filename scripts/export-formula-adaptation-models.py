from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


POSITIONS = ("GK", "DEF", "MID", "FWD")
BASES = ("fo_current", "alt_current")


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def combination_features(core, base: str, selected: dict[str, dict[str, Any]], names: list[str]):
    numeric = list(
        dict.fromkeys(
            core.calibration_features(base)
            + [
                feature
                for name in names
                for feature in selected[name]["numeric"]
                if not feature.startswith("fo_current")
                and not feature.startswith("alt_current")
            ]
        )
    )
    categorical = list(
        dict.fromkeys(
            ["league_id"]
            + [
                feature
                for name in names
                for feature in selected[name]["categorical"]
            ]
        )
    )
    return numeric, categorical


def temporal_weights(dates: pd.Series, half_life_days: float | None):
    if half_life_days is None:
        return np.ones(len(dates), dtype=float)
    latest = pd.Timestamp(dates.max())
    age_days = ((latest - pd.to_datetime(dates)).dt.total_seconds() / 86400).clip(lower=0)
    return np.maximum(0.08, np.power(0.5, age_days.to_numpy() / half_life_days))


def minute_model_features(base: str):
    prefix = "fo" if base == "fo_current" else "alt"
    return [
        f"{prefix}_expected_minutes",
        f"{prefix}_expected_minutes_squared",
        f"{prefix}_base_expected_minutes",
        f"{prefix}_event_exposure_minutes",
        f"{prefix}_event_exposure_ratio",
        f"{prefix}_appearance_probability",
        f"{prefix}_sixty_probability",
        f"{prefix}_full_match_probability",
        f"{base}_x_expected_minutes_ratio",
        f"{base}_x_event_exposure_ratio",
    ]


def add_replay_minute_features(frame: pd.DataFrame, core):
    result = frame
    suffixes = (
        "fo_appearance_probability",
        "fo_sixty_probability",
        "fo_full_match_probability",
        "fo_base_expected_minutes",
        "fo_event_exposure_minutes",
        "alt_appearance_probability",
        "alt_sixty_probability",
        "alt_full_match_probability",
        "alt_base_expected_minutes",
        "alt_event_exposure_minutes",
    )
    for prefix, path in (
        ("archive", core.OLD / "current_formula_replay_2024_25.json.gz"),
        (
            "current",
            core.OLD / "current_formula_replay_two_seasons_2025_26.json.gz",
        ),
    ):
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            replay = pd.DataFrame(json.load(handle))
        replay = replay[
            ["match_id", "player_id", *suffixes]
        ].drop_duplicates(["match_id", "player_id"])
        replay = replay.rename(
            columns={
                suffix: f"{prefix}_{suffix}"
                for suffix in suffixes
            }
        )
        result = result.merge(
            replay,
            on=["match_id", "player_id"],
            how="left",
            validate="one_to_one",
        )
    for suffix in suffixes:
        result[suffix] = result[f"current_{suffix}"].fillna(
            result[f"archive_{suffix}"]
        )
        result = result.drop(
            columns=[f"current_{suffix}", f"archive_{suffix}"]
        )
    for prefix, base in (
        ("fo", "fo_current"),
        ("alt", "alt_current"),
    ):
        expected = result[f"{prefix}_expected_minutes"].astype(float).clip(0, 90)
        event = result[f"{prefix}_event_exposure_minutes"].astype(float).clip(
            0, 90
        )
        result[f"{prefix}_expected_minutes_squared"] = expected**2
        result[f"{prefix}_event_exposure_ratio"] = np.where(
            expected > 0, event / expected, 0
        )
        result[f"{base}_x_expected_minutes_ratio"] = (
            result[base] * expected / 90
        )
        result[f"{base}_x_event_exposure_ratio"] = (
            result[base] * event / 90
        )
    return result


def finite(value: Any):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Non-finite model value: {value}")
    return number


def export_pipeline(model, numeric_features: list[str], categorical_features: list[str]):
    preprocess = model.named_steps["preprocess"]
    ridge = model.named_steps["ridge"]
    coefficients = np.asarray(ridge.coef_, dtype=float)
    intercept = finite(ridge.intercept_)
    cursor = 0
    numeric_output: dict[str, dict[str, float | None]] = {}

    if numeric_features:
        numeric_pipeline = preprocess.named_transformers_["numeric"]
        imputer = numeric_pipeline.named_steps["impute"]
        scaler = numeric_pipeline.named_steps["scale"]
        imputed_names = list(imputer.get_feature_names_out(numeric_features))
        numeric_count = len(imputed_names)
        numeric_coefficients = coefficients[cursor : cursor + numeric_count]
        means = np.asarray(scaler.mean_, dtype=float)
        scales = np.asarray(scaler.scale_, dtype=float)
        intercept -= float(np.sum(numeric_coefficients * means / scales))
        direct_coefficients = numeric_coefficients / scales
        indicator_features = list(getattr(imputer.indicator_, "features_", []))
        indicator_by_input = {
            int(input_index): len(numeric_features) + indicator_index
            for indicator_index, input_index in enumerate(indicator_features)
        }
        for index, feature in enumerate(numeric_features):
            missing_index = indicator_by_input.get(index)
            numeric_output[feature] = {
                "coefficient": finite(direct_coefficients[index]),
                "median": finite(imputer.statistics_[index]),
                "missingCoefficient": (
                    finite(direct_coefficients[missing_index])
                    if missing_index is not None
                    else None
                ),
            }
        cursor += numeric_count

    categorical_output: dict[str, dict[str, Any]] = {}
    if categorical_features:
        categorical_pipeline = preprocess.named_transformers_["categorical"]
        encoder = categorical_pipeline.named_steps["encode"]
        output_counts = list(encoder._n_features_outs)
        infrequent_sets = [
            set(values.tolist()) if values is not None else set()
            for values in encoder.infrequent_categories_
        ]
        for feature_index, feature in enumerate(categorical_features):
            categories = list(encoder.categories_[feature_index])
            infrequent = infrequent_sets[feature_index]
            count = int(output_counts[feature_index])
            block = coefficients[cursor : cursor + count]
            regular_categories = [value for value in categories if value not in infrequent]
            category_coefficients = {
                str(value): finite(block[index])
                for index, value in enumerate(regular_categories)
            }
            categorical_output[feature] = {
                "coefficients": category_coefficients,
                "infrequentCategories": sorted(str(value) for value in infrequent),
                "infrequentCoefficient": (
                    finite(block[-1]) if infrequent else None
                ),
            }
            cursor += count

    if cursor != len(coefficients):
        raise RuntimeError(
            f"Serialized {cursor} coefficients, model contains {len(coefficients)}"
        )
    return {
        "intercept": finite(intercept),
        "numeric": numeric_output,
        "categorical": categorical_output,
    }


def manual_predict(serialized: dict[str, Any], row: pd.Series):
    value = serialized["intercept"]
    for feature, definition in serialized["numeric"].items():
        raw = row.get(feature)
        missing = pd.isna(raw)
        number = definition["median"] if missing else float(raw)
        value += definition["coefficient"] * number
        if missing and definition["missingCoefficient"] is not None:
            value += definition["missingCoefficient"]
    for feature, definition in serialized["categorical"].items():
        raw = row.get(feature)
        category = "__missing__" if pd.isna(raw) else str(raw)
        if category in definition["coefficients"]:
            value += definition["coefficients"][category]
        elif category in definition["infrequentCategories"]:
            value += definition["infrequentCoefficient"]
    return value


def fit_profile(
    core,
    frame: pd.DataFrame,
    base: str,
    numeric: list[str],
    categorical: list[str],
    half_life_days: float | None,
):
    result = {}
    for position in POSITIONS:
        training = frame[
            frame["fantasy_position"].eq(position)
            & frame["target_points"].notna()
            & frame[base].notna()
        ].copy()
        model, numeric_used, categorical_used = core.make_model(
            training, numeric, categorical, 35.0
        )
        x = core.prepare_x(training, numeric_used, categorical_used)
        weights = temporal_weights(training["match_date"], half_life_days)
        model.fit(x, training["target_points"], ridge__sample_weight=weights)
        serialized = export_pipeline(model, numeric_used, categorical_used)
        sample = training.iloc[-min(50, len(training)) :]
        expected = model.predict(
            core.prepare_x(sample, numeric_used, categorical_used)
        )
        actual = np.array(
            [manual_predict(serialized, row) for _, row in sample.iterrows()]
        )
        maximum_error = float(np.max(np.abs(expected - actual)))
        if maximum_error > 1e-8:
            raise RuntimeError(
                f"Serialization mismatch for {base}/{position}: {maximum_error}"
            )
        result[position] = {
            **serialized,
            "trainingSamples": int(len(training)),
        }
        print(
            f"fit {base} {position} rows={len(training)} "
            f"features={len(numeric_used)}+{len(categorical_used)}",
            flush=True,
        )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--research-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.research_dir.resolve()
    core = load_module(root / "run_formula_hypothesis_research.py", "formula_core")
    pass_features = load_module(
        root / "complete_pass_accuracy_features.py", "pass_features"
    )
    report = json.loads(
        (root / "formula_adaptation_rankings.json").read_text(encoding="utf-8")
    )

    selected_by_base = {
        "fo_current": report["selection"]["fo"],
        "alt_current": report["selection"]["alt"],
    }
    profiles: dict[str, tuple[str, list[str], list[str], float | None]] = {}
    required = {
        "season",
        "started",
        "minutes",
        "match_date",
        "fantasy_position",
        "target_points",
        "league_id",
    }
    for base, selection in selected_by_base.items():
        position_numeric = core.calibration_features(base)
        profiles[f"{base}:position"] = (
            base,
            position_numeric,
            ["league_id"],
            None,
        )
        for profile_name, hypotheses in (
            ("jointAccepted", selection["accepted"]),
            (
                "jointAll",
                [
                    name
                    for name in selection["selected"]
                    if name != "weather"
                ],
            ),
        ):
            numeric, categorical = combination_features(
                core, base, selection["selected"], hypotheses
            )
            numeric = list(
                dict.fromkeys(numeric + minute_model_features(base))
            )
            profiles[f"{base}:{profile_name}"] = (
                base,
                numeric,
                categorical,
                90.0,
            )
        required.add(base)
    for _, numeric, categorical, _ in profiles.values():
        required.update(numeric)
        required.update(categorical)

    print("loading feature frame", flush=True)
    frame = pd.read_pickle(root / "two_season_feature_frame.pkl")
    frame = core.add_formula_replays(frame)
    frame = add_replay_minute_features(frame, core)
    for base in BASES:
        frame[f"{base}_squared"] = frame[base] ** 2
        for position in POSITIONS:
            frame[f"{base}_{position.lower()}"] = np.where(
                frame["fantasy_position"].eq(position), frame[base], 0
            )
    frame, pass_audit = pass_features.inject_complete_pass_accuracy(frame)
    available = [column for column in required if column in frame]
    missing = sorted(required.difference(available))
    if missing:
        print(f"missing optional columns={missing}", flush=True)
    frame = frame.loc[
        frame["season"].isin(["2024/25", "2025/26"])
        & frame["started"].eq(True)
        & frame["minutes"].gt(60)
        & frame["target_points"].notna(),
        available,
    ].copy()
    print(f"training cohort rows={len(frame)}", flush=True)

    exported_models = {}
    for key, (base, numeric, categorical, half_life_days) in profiles.items():
        exported_models[key] = fit_profile(
            core,
            frame,
            base,
            numeric,
            categorical,
            half_life_days,
        )

    output = {
        "schemaVersion": 1,
        "sourceResearch": "full 2024/25 + 2025/26 FotMob/H2H retro sample",
        "trainingCohort": "actual starters with >60 minutes",
        "seasons": ["2024/25", "2025/26"],
        "predictionClamp": [-5, 25],
        "weatherIncluded": False,
        "minuteAdaptation": {
            "profiles": ["jointAccepted", "jointAll"],
            "features": {
                base: minute_model_features(base)
                for base in BASES
            },
            "retroValidation": (
                "sign preserved on 2024/25 monthly out-of-fold and "
                "2025/26 monthly walk-forward"
            ),
        },
        "passFeatureAudit": pass_audit,
        "hypotheses": {
            base: {
                "accepted": selection["accepted"],
                "all": [
                    name
                    for name in selection["selected"]
                    if name != "weather"
                ],
                "windows": {
                    name: specification["window"]
                    for name, specification in selection["selected"].items()
                    if name != "weather"
                },
            }
            for base, selection in selected_by_base.items()
        },
        "models": exported_models,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"wrote {args.output} bytes={args.output.stat().st_size}", flush=True)


if __name__ == "__main__":
    main()
