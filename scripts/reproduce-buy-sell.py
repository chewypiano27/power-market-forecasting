"""Refit the frozen price model from the shared feature builder's training rows.

bun scripts/prepare-buy-sell-training.ts monthly-files... > training.json
python scripts/reproduce-buy-sell.py training.json
The script reports parity and never overwrites the deployed model.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np


def fit(rows, alpha):
    x = np.asarray([row['features'] for row in rows], dtype=float)
    y = np.asarray([row['target'] for row in rows], dtype=float)
    if not np.isfinite(x).all() or not np.isfinite(y).all():
        raise ValueError('Training inputs must be finite')
    means, scales = x.mean(axis=0), x.std(axis=0)
    scales = np.where(scales == 0, 1, scales)
    z = (x - means) / scales
    intercept = float(y.mean())
    weights = np.linalg.solve(z.T @ z + alpha * np.eye(x.shape[1]), z.T @ (y - intercept))
    return dict(means=means, scales=scales, weights=weights, intercept=intercept)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path)
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    data = json.loads(raw)
    rows = data['rows']
    if not rows or any(not '2026-01-08' <= row['time'][:10] <= '2026-10-31' for row in rows):
        raise ValueError('Only the frozen Jan 8–Oct 31 training period is eligible')
    if data['alpha'] != .25 or data['decisionHurdle'] != 5:
        raise ValueError('The frozen penalty and decision threshold must remain unchanged')
    model = fit(rows, data['alpha'])
    errors = {key: float(np.max(np.abs(np.asarray(value) - data['expected'][key])))
              for key, value in model.items()}
    print(json.dumps(dict(rows=len(rows), datasetSha256=hashlib.sha256(raw).hexdigest(),
        first=rows[0]['time'], last=rows[-1]['time'], maximumAbsoluteDifferences=errors,
        tolerances={"means": 1e-7, "scales": 1e-7, "weights": 1e-8, "intercept": 1e-8},
        reproduced=all(value < (1e-7 if key in ("means", "scales") else 1e-8) for key, value in errors.items())), indent=2))


if __name__ == '__main__':
    main()
