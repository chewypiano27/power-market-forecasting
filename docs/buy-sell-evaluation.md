# Buy/Sell reproduction and evaluation

The desktop model uses a fixed penalty of 0.25 and a $5/MWh decision threshold.
Its training period is 8 January–31 October 2026. Those settings and the November
results were committed together on 16 November: the 1–15 November sample was
already inspected during development and cannot establish prospective performance.

Build the training dataset with the exact application feature builder:

```sh
bun scripts/prepare-buy-sell-training.ts /path/to/PRICE_AND_DEMAND_2026{01,02,03,04,05,06,07,08,09,10}_VIC1.csv > training.json
python -m pip install -r requirements-model.txt
python scripts/reproduce-buy-sell.py training.json
```

The NumPy script standardises features, fits the transformed one-hour change with
ridge, and compares the fitted means, scales, weights and intercept. Absolute
tolerances are 1e-7 for means/scales and 1e-8 for coefficients/intercept, allowing
for the source CSV's numeric precision. It does not overwrite the desktop artifact.
The replay uses 7,128 training hours. No November outcomes enter fitting.

Replay the comparison:

```sh
bun scripts/evaluate-buy-sell-baseline.ts october.csv november.csv
```

Both methods are scored on the model's exact BUY/SELL hours. The heuristic uses
the target-hour price from a week earlier as its price estimate. Flat outcomes
are incorrect, and a flat heuristic estimate earns no directional success.

For 1–15 November: model 96/143 (67.1%), heuristic 85/143 (59.4%). The paired
whole-day bootstrap 95% interval for the difference is approximately -3.0 to
+17.5 percentage points (10,000 samples; fixed seed 20261117). It includes zero.
The observed 7.7-point lead is therefore insufficient to establish a reliable
advantage over the heuristic. Gross signed price movement averages $9.68/MWh for
the model and $6.39/MWh for the heuristic; these omit fees and operating constraints.
The daily app chart shows model hit rate minus heuristic hit rate, on paired hours.

## Next evaluation period

Keep the committed coefficients, penalty and threshold unchanged from 18 November
through 18 December 2026. Report every complete hour in that period, with the
same-history inputs and same called-hour baseline. Record missing-input hours,
coverage, hit rate and paired daily uncertainty. Do not select settings using
that period's outcomes. This prospective protocol does not change the status of
previously inspected November results.
