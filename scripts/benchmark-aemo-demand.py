"""Compare saved daily peak estimates with issue-safe AEMO predispatch snapshots.

Usage: python3 scripts/benchmark-aemo-demand.py --manifest runs.json
  --actuals PRICE_AND_DEMAND_202611_VIC1.csv --predictions daily-results.csv
  --output benchmark.json

Manifest entries need targetDate and localFile (ZIP, beside the manifest).
Predictions CSV needs date,current,weekly. No forecast is reconstructed here.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import statistics
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

AEST = timezone(timedelta(hours=10))


def clock(value):
    return datetime.strptime(value, '%Y/%m/%d %H:%M:%S').replace(tzinfo=AEST)


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise ValueError('Demand must be finite and positive')
    return number


def add_interval(values, stamp, value):
    if stamp in values and values[stamp] != value:
        raise ValueError('Conflicting interval observations')
    values[stamp] = value


def complete(values, target, minutes):
    start = datetime.combine(date.fromisoformat(target), datetime.min.time(), AEST)
    expected = {start + timedelta(minutes=i) for i in range(minutes, 1441, minutes)}
    if set(values) != expected:
        raise ValueError(f'{target}: expected {len(expected)} complete intervals, got {len(values)}')
    return max(values.values())


def predispatch_peak(path, target):
    issue = datetime.combine(date.fromisoformat(target) - timedelta(days=1), datetime.min.time(), AEST) + timedelta(hours=18)
    with zipfile.ZipFile(path) as archive:
        files = [info for info in archive.infolist() if info.filename.upper().endswith('.CSV')]
        if len(files) != 1 or files[0].file_size > 100_000_000:
            raise ValueError('Expected one bounded predispatch CSV')
        rows = list(csv.reader(io.StringIO(archive.read(files[0]).decode('utf-8-sig'))))
    header = rows[0]
    if header[:5] != ['C', 'NEMP.WORLD', 'PREDISPATCHIS', 'AEMO', 'PUBLIC']:
        raise ValueError('Not a public AEMO predispatch snapshot')
    published = clock(header[5] + ' ' + header[6])
    if published > issue:
        raise ValueError('Predispatch publication is after the model issue cutoff')
    definitions, values, sequences = {}, {}, {}
    for row in rows[1:]:
        if len(row) < 4 or row[1] != 'PREDISPATCH':
            continue
        key = tuple(row[1:4])
        if row[0] == 'I':
            definitions[key] = row[4:]
        elif row[0] == 'D' and key in definitions:
            item = dict(zip(definitions[key], row[4:]))
            if item.get('RUNNO') != '1' or item.get('INTERVENTION') != '0':
                continue
            if row[2] == 'CASE_SOLUTION' and int(item['SOLUTIONSTATUS']) >= 0 and clock(item['LASTCHANGED']) <= issue:
                sequences[item['PREDISPATCHSEQNO']] = int(item['SOLUTIONSTATUS'])
            if row[2] != 'REGION_SOLUTION' or item.get('REGIONID') != 'VIC1':
                continue
            stamp = clock(item['DATETIME'])
            if (stamp - timedelta(microseconds=1)).date().isoformat() != target:
                continue
            if item.get('PREDISPATCHSEQNO') not in sequences:
                raise ValueError('Regional forecast has no published nonfailed normal case solution')
            if clock(item['LASTCHANGED']) > issue:
                raise ValueError('Regional forecast changed after the issue cutoff')
            add_interval(values, stamp, positive(item['TOTALDEMAND']))
    return {'peakMw': complete(values, target, 30), 'intervals': len(values), 'publishedAest': published.isoformat(), 'solutionStatuses': sorted(set(sequences.values()))}


def actual_peaks(path, target):
    values = {}
    with Path(path).open(newline='', encoding='utf-8-sig') as source:
        for row in csv.DictReader(source):
            if row['REGION'] != 'VIC1' or row['PERIODTYPE'] not in ['TRADE', 'ACTUAL']:
                continue
            stamp = clock(row['SETTLEMENTDATE'])
            if (stamp - timedelta(microseconds=1)).date().isoformat() == target:
                add_interval(values, stamp, positive(row['TOTALDEMAND']))
    peak = complete(values, target, 5)
    boundary = {time: value for time, value in values.items() if time.minute % 30 == 0}
    return peak, complete(boundary, target, 30)


def run(manifest, actuals, predictions):
    manifest = Path(manifest)
    runs = json.loads(manifest.read_text())
    with Path(predictions).open(newline='') as source:
        forecasts = {row['date']: row for row in csv.DictReader(source)}
    results, seen = [], set()
    for item in sorted(runs, key=lambda row: row['targetDate']):
        target = item['targetDate']
        if target in seen or Path(item['localFile']).name != item['localFile']:
            raise ValueError('Duplicate day or unsafe snapshot path')
        seen.add(target)
        path = manifest.parent / item['localFile']
        if item.get('sha256') and hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Snapshot hash does not match the manifest')
        aemo = predispatch_peak(path, target)
        actual, half_hour_actual = actual_peaks(actuals, target)
        results.append({'date': target, 'actualFiveMinutePeakMw': actual, 'actualHalfHourBoundaryPeakMw': half_hour_actual,
                        'modelMw': positive(forecasts[target]['current']), 'weeklyMw': positive(forecasts[target]['weekly']),
                        'aemoMw': aemo['peakMw'], 'aemoPublishedAest': aemo['publishedAest'], 'aemoSolutionStatuses': aemo['solutionStatuses']})
    if not results:
        raise ValueError('No benchmark days')
    metrics = {}
    for name in ['model', 'aemo', 'weekly']:
        errors = [row[name + 'Mw'] - row['actualFiveMinutePeakMw'] for row in results]
        metrics[name] = {'maeMw': statistics.mean(map(abs, errors)), 'biasMw': statistics.mean(errors),
                         'rmseMw': math.sqrt(statistics.mean(error ** 2 for error in errors))}
    return {'days': len(results), 'metricsAgainstFiveMinutePeak': metrics, 'rows': results,
            'limitations': ['AEMO forecast is sampled every 30 minutes; the model target is the maximum original five-minute demand.',
                            'Half-hour-boundary actual peaks are reported as a resolution diagnostic, not a different model target.',
                            'File publication and LASTCHANGED must precede 18:00 AEST on D-1. Historical actuals may contain revisions.',
                            'Small recent sample and reused model outcomes; no claim of general superiority.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ['manifest', 'actuals', 'predictions', 'output']:
        parser.add_argument('--' + argument, required=True)
    args = parser.parse_args()
    report = run(args.manifest, args.actuals, args.predictions)
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'rows'}, indent=2))
