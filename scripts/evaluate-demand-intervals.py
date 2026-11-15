"""Offline coverage diagnostics for the existing corrected daily-demand model.

Inputs are the audited rows and frozen model, not application configuration.
All rolling radii use outcomes available before each day-ahead issue cutoff.
The 2026 period has already been inspected; this is not fresh validation.

Run with --dataset audited-dataset.json --model demand-peak-artifact.json
and --output interval-evaluation.json. The input rows must include the
point-in-time feature vector, outcome availability, and target-day peak.
"""
import argparse
import json
import math
import statistics
from datetime import date, timedelta
from pathlib import Path


def conformal_radius(errors, coverage=0.8):
    if not errors or not 0 < coverage < 1 or any(not math.isfinite(e) or e < 0 for e in errors):
        raise ValueError('Expected nonnegative finite errors and coverage between zero and one')
    values = sorted(errors)
    rank = min(len(values), math.ceil((len(values) + 1) * coverage))
    return values[rank - 1]


def eligible_residuals(rows, predictions, issue, count=90):
    if count < 1:
        raise ValueError('Residual window must be positive')
    earlier = sorted((row for row in rows if row['targetDate'] in predictions
                      and row['outcomeAvailableAt'] <= issue), key=lambda row: row['targetDate'])[-count:]
    if len(earlier) != count:
        raise ValueError('Not enough completed residuals before the issue cutoff')
    errors = [abs(predictions[row['targetDate']] - row['peak']) for row in earlier]
    return errors, earlier[-1]['targetDate']


def corrected_predictions(rows, model):
    by_date = {row['targetDate']: row for row in rows}
    if len(by_date) != len(rows):
        raise ValueError('Dataset contains duplicate dates')
    def base(row):
        values = zip(row['values'], model['means'], model['scales'], model['weights'])
        return model['intercept'] + sum((v - mean) / scale * weight for v, mean, scale, weight in values)
    predictions = {}
    for day, row in sorted(by_date.items()):
        dates = [(date.fromisoformat(day) - timedelta(days=i + 2)).isoformat()
                 for i in range(model['biasCorrection']['days'])]
        past = [by_date.get(day) for day in dates]
        if not all(past):
            continue
        if any(not p['complete'] or p['outcomeAvailableAt'] > row['issueAt'] for p in past):
            raise ValueError('Bias correction uses incomplete or future outcomes')
        predictions[day] = base(row) + statistics.mean(p['peak'] - base(p) for p in past)
    return predictions


def summarize(rows):
    return {'days': len(rows), 'coverage': statistics.mean(row['covered'] for row in rows),
            'meanWidthMw': statistics.mean(row['widthMw'] for row in rows),
            'meanIntervalScore': statistics.mean(row['intervalScore'] for row in rows)}


def evaluate(dataset, model):
    rows = dataset['rows']
    predictions = corrected_predictions(rows, model)
    calibration = [row for row in rows if '2025-04-01' <= row['targetDate'] <= '2025-12-30']
    testing = [row for row in rows if '2026-01-01' <= row['targetDate'] <= '2026-10-31']
    if not calibration or not testing:
        raise ValueError('Dataset does not cover the fixed calibration and comparison periods')
    if max(row['outcomeAvailableAt'] for row in calibration) > min(row['issueAt'] for row in testing):
        raise ValueError('Fixed calibration outcomes were unavailable before comparison began')
    radius = conformal_radius([abs(predictions[row['targetDate']] - row['peak']) for row in calibration])
    results, daily = {}, []
    for method in ['fixed-pre2026', 'rolling90', 'rolling90-with-historical-floor']:
        diagnostics = []
        for row in testing:
            errors, newest = eligible_residuals(rows, predictions, row['issueAt'])
            rolling = conformal_radius(errors)
            current = radius if method == 'fixed-pre2026' else rolling
            if method == 'rolling90-with-historical-floor':
                current = max(radius, rolling)
            point = predictions[row['targetDate']]
            lower, upper = max(0, point - current), point + current
            miss = max(lower - row['peak'], 0) + max(row['peak'] - upper, 0)
            diagnostics.append({'date': row['targetDate'], 'covered': lower <= row['peak'] <= upper,
                                'widthMw': upper - lower, 'radiusMw': current,
                                'intervalScore': upper - lower + 10 * miss,
                                'newestCalibrationDay': newest})
        quarters = {}
        for quarter in range(1, 5):
            group = [row for row in diagnostics if (int(row['date'][5:7]) - 1) // 3 + 1 == quarter]
            if group:
                quarters[str(quarter)] = summarize(group)
        results[method] = summarize(diagnostics) | {'quarters': quarters}
        daily.append({'method': method, 'rows': diagnostics})
    return {'nominalCoverage': 0.8, 'fixedCalibrationRadiusMw': radius, 'calibrationDays': len(calibration),
            'results': results, 'daily': daily,
            'limitations': ['2026 outcomes were already inspected during development; this is a reused diagnostic.',
                            'Temporal dependence and drift prevent a guaranteed 80% future coverage claim.',
                            'The wider candidate bands do not improve point forecasts. Production is unchanged.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ['dataset', 'model', 'output']:
        parser.add_argument('--' + argument, required=True)
    args = parser.parse_args()
    report = evaluate(json.loads(Path(args.dataset).read_text()), json.loads(Path(args.model).read_text()))
    Path(args.output).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'daily'}, indent=2))
