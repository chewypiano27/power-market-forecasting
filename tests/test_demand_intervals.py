import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('intervals', Path(__file__).parents[1] / 'scripts/evaluate-demand-intervals.py')
intervals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(intervals)


class DemandIntervalTests(unittest.TestCase):
    def test_finite_sample_rank_uses_ceiling_and_caps_at_sample_size(self):
        self.assertEqual(intervals.conformal_radius([1, 2, 3, 4], .8), 4)
        self.assertEqual(intervals.conformal_radius([5], .8), 5)
        self.assertEqual(intervals.conformal_radius(list(range(90)), .8), 72)

    def test_invalid_residuals_and_coverage_are_rejected(self):
        for values in [[], [float('nan')], [float('inf')], [-1]]:
            with self.assertRaises(ValueError):
                intervals.conformal_radius(values)
        for coverage in [0, 1, -1]:
            with self.assertRaises(ValueError):
                intervals.conformal_radius([1], coverage)

    def test_future_outcomes_are_excluded_before_selecting_recent_window(self):
        rows = [
            {'targetDate': '2026-01-01', 'outcomeAvailableAt': '2026-01-02T00:00:00Z', 'peak': 10},
            {'targetDate': '2026-01-02', 'outcomeAvailableAt': '2026-01-03T00:00:00Z', 'peak': 20},
            {'targetDate': '2026-01-03', 'outcomeAvailableAt': '2026-01-04T00:00:00Z', 'peak': 9999},
        ]
        predictions = {'2026-01-01': 12, '2026-01-02': 25, '2026-01-03': 0}
        errors, newest = intervals.eligible_residuals(rows, predictions, '2026-01-03T08:00:00Z', 2)
        self.assertEqual(errors, [2, 5])
        self.assertEqual(newest, '2026-01-02')
        errors, newest = intervals.eligible_residuals(rows, predictions, '2026-01-03T08:00:00Z', 1)
        self.assertEqual(errors, [5])
        with self.assertRaises(ValueError):
            intervals.eligible_residuals(rows, predictions, '2026-01-03T08:00:00Z', 3)

    def test_bias_correction_rejects_future_history(self):
        model = {'intercept': 10, 'weights': [1], 'means': [0], 'scales': [1], 'biasCorrection': {'days': 1}}
        rows = [
            {'targetDate': '2026-01-01', 'values': [0], 'peak': 20, 'complete': True,
             'issueAt': '2025-12-31T08:00:00Z', 'outcomeAvailableAt': '2026-01-04T00:00:00Z'},
            {'targetDate': '2026-01-03', 'values': [0], 'peak': 20, 'complete': True,
             'issueAt': '2026-01-02T08:00:00Z', 'outcomeAvailableAt': '2026-01-04T00:00:00Z'},
        ]
        with self.assertRaisesRegex(ValueError, 'future'):
            intervals.corrected_predictions(rows, model)


if __name__ == '__main__':
    unittest.main()
