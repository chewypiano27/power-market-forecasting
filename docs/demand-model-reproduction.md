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

The raw market and weather snapshots are not bundled in the repository. The current audited feature dataset is kept separately at `output/evidence/2026-11-11-demand-peak/audited-dataset.json` in the project workspace. Recreating that feature dataset from raw sources remains a separate step; the script deliberately requires its path and never stores calculation timestamps or uploads data.
