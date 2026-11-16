"""Re-fit and verify the deployed VIC daily-peak model from an audited dataset."""
import argparse
import hashlib
import json
import math
from datetime import date, timedelta
from pathlib import Path

import numpy as np


TRAIN_END = "2025-03-30"
CALIBRATION_START, CALIBRATION_END = "2025-04-01", "2025-12-30"
TEST_START, TEST_END = "2026-01-01", "2026-10-31"
PENALTIES = (0.1, 1.0, 10.0, 100.0)
CORRECTION_WINDOWS = (7, 14, 28, 56)


def fit(rows, penalty):
    x = np.asarray([row["values"] for row in rows], dtype=float)
    y = np.asarray([row["peak"] for row in rows], dtype=float)
    means, scales = x.mean(axis=0), x.std(axis=0)
    scales = np.where(scales < 1e-10, 1, scales)
    z, intercept = (x - means) / scales, float(y.mean())
    weights = np.linalg.solve(z.T @ z + penalty * np.eye(z.shape[1]), z.T @ (y - intercept))
    return {"means": means, "scales": scales, "weights": weights, "intercept": intercept}


def predict(model, row):
    values = np.asarray(row["values"], dtype=float)
    return float(model["intercept"] + ((values - model["means"]) / model["scales"]) @ model["weights"])


def select_penalty(rows):
    scores = []
    for penalty in PENALTIES:
        fold_errors = []
        for fraction in (0.55, 0.70, 0.85):
            start = int(len(rows) * fraction)
            end = min(len(rows), start + int(len(rows) * 0.15))
            validation = rows[start:end]
            eligible = [row for row in rows[:start] if row["outcomeAvailableAt"] <= validation[0]["issueAt"]]
            if not eligible or not validation:
                raise ValueError("Chronological penalty fold is empty")
            model = fit(eligible, penalty)
            fold_errors.extend(abs(predict(model, row) - row["peak"]) for row in validation)
        scores.append({"penalty": penalty, "maeMw": float(np.mean(fold_errors))})
    return min(scores, key=lambda item: item["maeMw"]), scores


def metrics(actual, predicted):
    error = np.asarray(predicted) - np.asarray(actual)
    return {"maeMw": float(np.mean(np.abs(error))), "rmseMw": float(np.sqrt(np.mean(error**2))),
            "biasMw": float(np.mean(error))}


def partition(data):
    rows, names = data.get("rows"), data.get("featureNames")
    if not isinstance(rows, list) or not isinstance(names, list) or not rows:
        raise ValueError("Expected rows and featureNames in audited dataset")
    dates = [row.get("targetDate") for row in rows]
    if dates != sorted(set(dates)):
        raise ValueError("Dataset dates must be unique and chronologically ordered")
    if not all(len(row.get("values", [])) == len(names) and row.get("complete")
               and isinstance(row.get("peak"), (int, float)) and row["peak"] > 0
               and all(isinstance(value, (int, float)) and math.isfinite(value) for value in row["values"])
               for row in rows):
        raise ValueError("Every dataset row must have complete features and outcomes")
    train = [row for row in rows if row["targetDate"] <= TRAIN_END]
    calibration = [row for row in rows if CALIBRATION_START <= row["targetDate"] <= CALIBRATION_END]
    test = [row for row in rows if TEST_START <= row["targetDate"] <= TEST_END]
    if (len(train), len(calibration), len(test)) != (382, 274, 304):
        raise ValueError("Dataset does not match the audited chronological split")
    if max(row["outcomeAvailableAt"] for row in train) > calibration[0]["issueAt"]:
        raise ValueError("Training outcomes extend past the calibration issue cutoff")
    if max(row["outcomeAvailableAt"] for row in calibration) > test[0]["issueAt"]:
        raise ValueError("Calibration outcomes extend past the test issue cutoff")
    return train, calibration, test


def corrected_prediction(row, predictions, by_date, days):
    errors = []
    target = date.fromisoformat(row["targetDate"])
    for lag in range(2, days + 2):
        prior_date = (target - timedelta(days=lag)).isoformat()
        prior = by_date.get(prior_date)
        if prior is None or prior["outcomeAvailableAt"] > row["issueAt"]:
            raise ValueError("Correction uses a missing or not-yet-available outcome")
        errors.append(prior["peak"] - predictions[prior_date])
    return predictions[row["targetDate"]] + float(np.mean(errors))


def run(dataset_path, artifact_path, history_path):
    raw = Path(dataset_path).read_bytes()
    data = json.loads(raw)
    artifact = json.loads(Path(artifact_path).read_text())
    history = json.loads(Path(history_path).read_text())
    if data.get("sourceManifestHash") != artifact.get("sourceManifestHash"):
        raise ValueError("Dataset source manifest does not match deployed artifact")
    expected_penalty = artifact.get("ridgePenalty")
    if (isinstance(expected_penalty, bool) or not isinstance(expected_penalty, (int, float))
            or not math.isfinite(expected_penalty) or expected_penalty <= 0):
        raise ValueError("Deployed artifact must declare a finite positive ridgePenalty")
    train, calibration, test = partition(data)
    if data["featureNames"] != artifact["featureNames"]:
        raise ValueError("Dataset feature order does not match deployed artifact")

    selected, penalty_scores = select_penalty(train)
    model = fit(train, selected["penalty"])
    predictions = {row["targetDate"]: predict(model, row) for row in data["rows"]}
    by_date = {row["targetDate"]: row for row in data["rows"]}
    calibration_scores = []
    for days in CORRECTION_WINDOWS:
        values = [corrected_prediction(row, predictions, by_date, days) for row in calibration]
        calibration_scores.append({"days": days, "maeMw": metrics([r["peak"] for r in calibration], values)["maeMw"]})
    selected_correction = min(calibration_scores, key=lambda item: item["maeMw"])["days"]
    actual = [row["peak"] for row in test]
    point = [corrected_prediction(row, predictions, by_date, selected_correction) for row in test]
    baseline = [row["baselineMw"] for row in test]
    result = metrics(actual, point)
    result["baselineMaeMw"] = metrics(actual, baseline)["maeMw"]
    model_match = {
        "penalty": selected["penalty"] == expected_penalty,
        "correctionDays": selected_correction == artifact["biasCorrection"]["days"],
        "means": np.allclose(model["means"], artifact["means"], rtol=0, atol=1e-8),
        "scales": np.allclose(model["scales"], artifact["scales"], rtol=0, atol=1e-8),
        "weights": np.allclose(model["weights"], artifact["weights"], rtol=0, atol=1e-8),
        "intercept": math.isclose(model["intercept"], artifact["intercept"], rel_tol=0, abs_tol=1e-8),
        "historyMetrics": all(math.isclose(result[key], history[key], rel_tol=0, abs_tol=1e-5)
                               for key in ("maeMw", "rmseMw", "biasMw", "baselineMaeMw")),
    }
    return {"datasetSha256": hashlib.sha256(raw).hexdigest(), "sourceManifestHash": data["sourceManifestHash"],
            "rows": {"training": len(train), "calibration": len(calibration), "test": len(test)},
            "selectedPenalty": selected, "penaltyFolds": penalty_scores,
            "correctionSelection": calibration_scores, "selectedCorrectionDays": selected_correction,
            "testMetrics": result, "deployedArtifactMatch": model_match,
            "reproduced": all(model_match.values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, help="Audited feature dataset JSON")
    parser.add_argument("--artifact", default="src/plugins/builtin/vic-power/demand-peak-artifact.json")
    parser.add_argument("--history", default="src/plugins/builtin/vic-power/demand-peak-history-summary.json")
    parser.add_argument("--output", help="Optional report path; otherwise print to stdout")
    args = parser.parse_args()
    report = json.dumps(run(args.dataset, args.artifact, args.history), indent=2, allow_nan=False) + "\n"
    if args.output:
        Path(args.output).write_text(report)
    print(report, end="")
    if not json.loads(report)["reproduced"]:
        raise SystemExit("Re-fit does not match the deployed artifact and evaluation")


if __name__ == "__main__":
    main()
