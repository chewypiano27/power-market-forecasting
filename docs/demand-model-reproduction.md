# Reproduce the VIC daily-peak model fit

The script replays the chronological fit and correction selection from an audited feature dataset, then checks that the coefficients and held-out metrics match the deployed artifact. It does not change the app artifact. The artifact declares its selected `ridgePenalty`; replay compares the chronological selection against that metadata, not a fixed expected penalty. This is an exact replay of the frozen training split, not a command for refitting on new dates.

Create an environment and install the pinned training dependency:

```sh
python3 -m venv .venv-model
.venv-model/bin/pip install -r requirements-model.txt
```

Rebuild the exact 962-day audited dataset from the public source archives, then replay the fit:

```sh
bun run scripts/rebuild-demand-training-data.ts \
  --output /tmp/audited-demand-dataset.json

.venv-model/bin/python scripts/reproduce-demand-peak.py \
  --dataset /tmp/audited-demand-dataset.json \
  --output /tmp/demand-model-reproduction.json
```

The rebuild downloads 32 AEMO monthly demand CSVs and the matching GFS 48-hour archived weather series, derives the features with the same app code, and requires an exact match to the audited dataset hash before writing it. A changed or incomplete upstream archive stops with an error. The replay report includes the dataset hash, fixed split sizes, selected ridge penalty, pre-test correction-window comparison, test metrics, and coefficient/metric parity. A nonmatching fit exits with an error.

The raw source snapshots are not bundled or retained by the rebuild command. The output dataset contains only the audited daily model inputs, outcomes, and fixed issue/outcome cutoffs needed for leakage checks. To rebuild from a previously saved source archive instead, use:

```text
<source-root>/
  raw/aemo/PRICE_AND_DEMAND_*.csv
  probability/dataset.json
  probability/dataset-manifest.json
  probability/forecasts/YYYY-MM-DD.json
```

Then run the local audit and fit replay:

```sh
bun run scripts/audit-demand-training-data.ts \
  --source-root /path/to/vic1-data \
  --output /tmp/audited-demand-dataset.json

.venv-model/bin/python scripts/reproduce-demand-peak.py \
  --dataset /tmp/audited-demand-dataset.json
```

The offline audit verifies the source manifest, all AEMO and weather snapshot hashes, feature and demand-label parity, forecast availability at each issue cutoff, and the same-weekday baseline.

Weather values come from the [Open-Meteo Previous Runs API](https://open-meteo.com/en/docs/previous-runs-api) under [CC BY 4.0](https://open-meteo.com/en/license). AEMO monthly demand data comes from AEMO's public [price and demand archive](https://www.aemo.com.au/energy-systems/electricity/national-electricity-market-nem/data-nem/market-data-nem/price-and-demand-data). The scripts run locally and do not retain API capture or model calculation timestamps; the dataset retains only the fixed issue and outcome cutoffs used to check leakage.

## Penalty sensitivity check

A training-only check on the existing chronological folds on 17 November compared
penalties 0, 0.001, 0.01, 0.1, 1, 10 and 100. Their mean absolute errors were
446.781, 446.782, 446.790, 446.873, 447.612, 457.126 and 566.960 MW respectively.
The zero-penalty case used least squares. The deployed 0.1 penalty is therefore
weak regularisation; these results do not show a meaningful accuracy advantage
over least squares. The deployed coefficients remain frozen. Changing the search
grid after inspecting the evaluation period would require a new evaluation design.

The historical interval diagnostic found 73.0% coverage for an 80% target; the app
already withholds that band. A 90-day rolling alternative widened the band by
about 22% and reached approximately 80% aggregate historical coverage, with
uneven seasonal results. It has not replaced the frozen interval method.

AEMO predispatch comparison results were already collected for 3–12 November:
model MAE 124.79 MW, AEMO 207.05 MW, weekly baseline 363.13 MW against five-minute
peak demand. AEMO uses a half-hour time grid, so these ten days are a limited
resolution-sensitive comparison, not a general superiority claim. The original
snapshots and hashes are retained in the project evidence, outside the app source.
