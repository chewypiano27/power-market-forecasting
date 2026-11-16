import importlib.util
import unittest
from datetime import date, timedelta
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "reproduce-demand-peak.py"
SPEC = importlib.util.spec_from_file_location("reproduce_peak", SCRIPT)
MODEL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODEL)


def synthetic_dataset():
    start, end = date(2024, 3, 14), date(2026, 10, 31)
    rows, current = [], start
    while current <= end:
        day = current.isoformat()
        start_issue = current - timedelta(days=1)
        issue_at = f"{start_issue.isoformat()}T08:00:00Z"
        outcome_at = f"{current.isoformat()}T14:00:00Z"
        rows.append({"targetDate": day, "issueAt": issue_at, "outcomeAvailableAt": outcome_at,
                     "values": [6000.0] * 12, "peak": 6000.0, "baselineMw": 6000.0, "complete": True})
        current += timedelta(days=1)
    return {"featureNames": [f"f{i}" for i in range(12)], "sourceManifestHash": "a" * 64, "rows": rows}


class DemandPeakReproductionTests(unittest.TestCase):
    def test_audited_chronology_splits_into_training_calibration_and_test(self):
        train, calibration, test = MODEL.partition(synthetic_dataset())
        self.assertEqual((len(train), len(calibration), len(test)), (382, 274, 304))
        self.assertEqual(train[0]["targetDate"], "2024-03-14")
        self.assertEqual(train[-1]["targetDate"], "2025-03-30")
        self.assertEqual(test[-1]["targetDate"], "2026-10-31")

    def test_missing_day_invalidates_the_audited_split(self):
        data = synthetic_dataset()
        del data["rows"][500]
        with self.assertRaisesRegex(ValueError, "audited chronological split"):
            MODEL.partition(data)

    def test_correction_rejects_residuals_not_available_at_issue_time(self):
        target = {"targetDate": "2026-02-01", "issueAt": "2026-01-31T08:00:00Z"}
        prior = {
            "2026-01-30": {"peak": 6100.0, "outcomeAvailableAt": "2026-01-30T14:00:00Z"},
            "2026-01-29": {"peak": 6200.0, "outcomeAvailableAt": "2026-01-29T14:00:00Z"},
        }
        self.assertAlmostEqual(MODEL.corrected_prediction(target, {"2026-02-01": 6000.0, "2026-01-30": 6000.0, "2026-01-29": 6000.0}, prior, 2), 6150.0)
        prior["2026-01-30"]["outcomeAvailableAt"] = "2026-01-31T09:00:00Z"
        with self.assertRaisesRegex(ValueError, "not-yet-available"):
            MODEL.corrected_prediction(target, {"2026-02-01": 6000.0, "2026-01-30": 6000.0, "2026-01-29": 6000.0}, prior, 2)


if __name__ == "__main__":
    unittest.main()
