import csv
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location('benchmark', Path(__file__).parents[1] / 'scripts/benchmark-aemo-demand.py')
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class AemoBenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = '2026-11-03'
        start = datetime(2026, 11, 3)
        self.region = [['D', 'PREDISPATCH', 'REGION_SOLUTION', '9', 'run', '1', 'VIC1', '0',
                        (start + timedelta(minutes=30*i)).strftime('%Y/%m/%d %H:%M:%S'), '6000', '2026/11/02 17:31:00'] for i in range(1, 49)]

    def snapshot(self, publication='17:32:00', status='8', rows=None):
        records = [['C', 'NEMP.WORLD', 'PREDISPATCHIS', 'AEMO', 'PUBLIC', '2026/11/02', publication],
                   ['I', 'PREDISPATCH', 'CASE_SOLUTION', '1', 'PREDISPATCHSEQNO', 'RUNNO', 'INTERVENTION', 'SOLUTIONSTATUS', 'LASTCHANGED'],
                   ['D', 'PREDISPATCH', 'CASE_SOLUTION', '1', 'run', '1', '0', status, '2026/11/02 17:31:00'],
                   ['I', 'PREDISPATCH', 'REGION_SOLUTION', '9', 'PREDISPATCHSEQNO', 'RUNNO', 'REGIONID', 'INTERVENTION', 'DATETIME', 'TOTALDEMAND', 'LASTCHANGED'],
                   *(self.region if rows is None else rows)]
        buffer = io.StringIO(); csv.writer(buffer).writerows(records)
        path = self.root / 'snapshot.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('snapshot.csv', buffer.getvalue())
        return path

    def test_complete_normal_run_preserves_condition_status(self):
        result = benchmark.predispatch_peak(self.snapshot(), self.target)
        self.assertEqual(result['peakMw'], 6000)
        self.assertEqual(result['intervals'], 48)
        self.assertEqual(result['solutionStatuses'], [8])

    def test_publication_after_issue_is_ineligible(self):
        with self.assertRaisesRegex(ValueError, 'publication'):
            benchmark.predispatch_peak(self.snapshot(publication='18:00:01'), self.target)

    def test_model_failure_and_intervention_are_ineligible(self):
        with self.assertRaisesRegex(ValueError, 'nonfailed'):
            benchmark.predispatch_peak(self.snapshot(status='-1'), self.target)
        rows = [row[:7] + ['1'] + row[8:] for row in self.region]
        with self.assertRaisesRegex(ValueError, 'complete intervals'):
            benchmark.predispatch_peak(self.snapshot(rows=rows), self.target)

    def test_incomplete_forecasts_and_conflicting_duplicates_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'complete intervals'):
            benchmark.predispatch_peak(self.snapshot(rows=self.region[:-1]), self.target)
        conflict = self.region[0].copy(); conflict[-2] = '9000'
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            benchmark.predispatch_peak(self.snapshot(rows=self.region + [conflict]), self.target)

    def test_late_changed_forecast_is_rejected(self):
        rows = [row[:-1] + ['2026/11/02 18:01:00'] for row in self.region]
        with self.assertRaisesRegex(ValueError, 'changed after'):
            benchmark.predispatch_peak(self.snapshot(rows=rows), self.target)

    def test_actual_day_includes_interval_ending_at_following_midnight(self):
        path = self.root / 'actual.csv'
        with path.open('w', newline='') as target:
            writer = csv.writer(target); writer.writerow(['REGION', 'SETTLEMENTDATE', 'TOTALDEMAND', 'PERIODTYPE'])
            for index in range(1, 289):
                stamp = datetime(2026, 11, 3) + timedelta(minutes=index*5)
                writer.writerow(['VIC1', stamp.strftime('%Y/%m/%d %H:%M:%S'), 7000 if index == 288 else 6000, 'TRADE'])
        self.assertEqual(benchmark.actual_peaks(path, self.target), (7000, 7000))
        path.write_text('\n'.join(path.read_text().splitlines()[:-1]))
        with self.assertRaisesRegex(ValueError, '288 complete intervals'):
            benchmark.actual_peaks(path, self.target)


if __name__ == '__main__':
    unittest.main()
