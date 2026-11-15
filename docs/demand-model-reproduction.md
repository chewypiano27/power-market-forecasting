# Reproduce the VIC daily-peak model fit

The script replays the chronological fit and correction selection from an audited feature dataset, then checks that the coefficients and held-out metrics match the deployed artifact. It does not change the app artifact.

Create an environment and install the pinned training dependency:

```sh
python3 -m venv .venv-model
.venv-model/bin/pip install -r requirements-model.txt
```

Run from the repository root with an audited dataset JSON:

```sh
.venv-model/bin/python scripts/reproduce-demand-peak.py \
  --dataset /path/to/audited-dataset.json \
  --output /tmp/demand-model-reproduction.json
```

The report includes the dataset hash, fixed split sizes, selected ridge penalty, pre-test correction-window comparison, test metrics, and coefficient/metric parity. A nonmatching result exits with an error.

The raw market and weather snapshots are not bundled in the repository. To rebuild the audited feature dataset, supply a source archive with this layout:

```text
<source-root>/
  raw/aemo/PRICE_AND_DEMAND_*.csv
  probability/dataset.json
  probability/dataset-manifest.json
  probability/forecasts/YYYY-MM-DD.json
```

Then run the audit and fit replay:

```sh
bun run scripts/audit-demand-training-data.ts \
  --source-root /path/to/vic1-data \
  --output /tmp/audited-demand-dataset.json

.venv-model/bin/python scripts/reproduce-demand-peak.py \
  --dataset /tmp/audited-demand-dataset.json
```

The audit verifies the source manifest, all AEMO and weather snapshot hashes, feature and demand-label parity, forecast availability at each issue cutoff, and the same-weekday baseline. The output hash should match the audited dataset used for the deployed artifact. These commands run locally: source data is not included or uploaded, and no forecast-calculation timestamp is created or retained.
