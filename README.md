# Launch Radar — a token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty. Launch Radar reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), ranks **every protocol that records no token yet — all 342 of them, the snapshot's 40-protocol watchlist included and flagged** — by an implied value from a comparables model fitted on the snapshot itself, and gives each one a costed farm plan with a verdict. Protocols that already record a token are never ranked: they are the model's training data, and the dashboard now accounts for **all 416 of them** in a searchable traded set, so every one of the 758 protocols is on the page exactly once.

This is the fourth version of the entry. The first asserted two of its value terms — a momentum bonus for a hot week and a maturity bonus for age — with hand-set weights. The second fitted every term it kept, blind-tested every term it was offered, and dropped the ones the test did not keep. The third kept the second's pricing model exactly — a 37-specification sweep found nothing that beat it under the keep rule — and added the audit around the model: a third validation, a calibration table, per-category blind errors, the full candidate ledger, a backtest of the board's own farm verdicts, and a start-here shortlist on the board. This version ran a second, wider lab at the pricing model — four lever families the first sweep never isolated: per-category sub-models shrunk toward the global fit, a multi-feature nearest-neighbour comps model (alone and blended), reshaped age and growth terms, and growth×category interactions. None passed the keep rule either, so **every row's implied value and rank are identical to the third version's**; the full ledger is in the terms-tested table below. What this version changes is the *decisions* the board draws from those prices, calibrated the same way — on blind data, cross-checked across both fold partitions: each row's range is now drawn from **its own category's blind residuals** instead of one global band, and the **FARM/THIN verdict lines were recalibrated by the verdict backtest itself** (FARM at 4× plan cost, THIN at 0.75×). Both calibrations are stated with their cross-partition evidence where they are used.

## The value model

No protocol name is an input anywhere. The model (in `lib/model.ts`, version `comps-fit-4`) is:

1. **Fit.** On the 128 tokenized protocols that record both a market cap and a TVL, regress `log(mcap_usd)` on `log(tvl_usd)` (slope ≈ 0.52) **plus a fitted 7-day growth term**: the week's TVL change on a compressed signed-log scale, `sign(g) · log1p(|g| / 10)`. Each category then gets an intercept shift equal to its mean residual, shrunk toward zero by `n / (n + 8)`, so a category with two members barely moves and one with fifteen moves most of the way.
2. **Base value.** A pre-token protocol's base is that fit read at its own TVL and category — what its TVL prices at among tokenized peers.
3. **Growth multiplier.** `exp(coefficient × growth term)`, clamped to **×0.4–×2.5** so one week can never dominate a price. The fitted coefficient is **−0.544 — negative**: among the tokenized comps, a protocol whose TVL just spiked prices *lower* per TVL dollar (caps have not followed such spikes), and one whose TVL slid prices *higher* per dollar (its cap held up better than its TVL). The first version asserted the opposite with a +0.5 momentum weight; the fit contradicts it, so the fit wins. The term is compressed and bounded because the evidence is thin — the snapshot caught a down week, and few strong growers sit in the fit set — and the dashboard says so.
4. **No maturity term.** An age term was tested in several forms (log age; the first version's capped-years shape fitted instead of asserted; age bands) and the blind test keeps none of them, so this board carries no age bonus. Age is still printed on every row; it does not raise any price.
5. **Range.** Every row carries a low–high interval calibrated on **blind** predictions — since this version, from **its own category's** out-of-fold residuals: the category's 10th–90th residual percentiles, shrunk toward the single global band (×0.066 to ×10.93 on this snapshot) by the same `n / (n + 8)` shrinkage the category offsets use, with the global band as the fallback for categories too thin to read. The one global band covered 81.25% of the blind caps but covered them unevenly — cross-partition, 60% in its worst category. The per-category bands covered **82.81%** of the same blind caps on partition A, and the calibration itself was tested cross-partition before it shipped: bands fitted on partition A's blind cases covered 84.38% of partition B's (against the global band's 81.25% there), with the worst category at 75% instead of 60%; fitted on B and scored on A, 81.25% against 79.69%, worst category 72.73% instead of 60% — at only ~3–5% wider bands on average. TVL prices loosely; the board says so instead of hiding it.

**Validation, shown on the dashboard:** the production rule — fit, growth term and bound included — is tested out of sample on every build, three times. The 128 fit-set protocols are split into five folds by an FNV-1a hash of the slug (the first version's partition, kept so the versions compare fold for fold) and again by a second partition of the same hash; each fold is predicted by a fit that never saw it. A leave-one-out pass then predicts every fit-set protocol from the other 127.

| | Median absolute error | Within 2× of recorded cap |
|---|---|---|
| v1 recipe (TVL + category, asserted terms) | 86.58% | 30.47% |
| **this model, partition A (same folds)** | **84.86%** | **32.81%** |
| this model, partition B (second split) | 85.17% | 31.25% |
| this model, leave-one-out | 85.72% | 32.03% |
| sqrt-TVL weighted least squares (tested, not kept) | 84.62% | 31.25% |
| Huber robust line (tested, not kept) | 85.77% | 30.47% |
| this model + log-age term (tested, not kept) | 87.03% | 30.47% |

Weak in absolute terms, and printed on the page rather than rounded away — which is exactly why every row carries its range. The dashboard's model panel carries this same terms-tested table, computed at build time by the model itself.

For the third version the sweep behind that table widened to 37 specifications: shrinkage strengths, growth compression divisors, asymmetric and TVL-interacted growth, weighted least squares (log- and sqrt-TVL weights), ridge penalties, per-category shrunk slopes, nearest-neighbour blends, quintile recalibration, Huber and L1 fits, capped-percentage growth, and log-age. The keep rule: a candidate replaces production only if it beats production's median on **both** partitions and gives up nothing within 2× on either. None passed. The closest, sqrt-TVL weighted least squares, won the median on both partitions (84.62% / 84.55%) but lost within-2× on both (31.25% / 27.34% against 32.81% / 31.25%) — at 128 fit members that trade is fold noise, and the dashboard's table says so next to its row.

This version's lab attacked the model from four directions that sweep had not isolated, and the dashboard's table now carries their best specifications too, computed at build time by the model itself. Per-category sub-models shrunk toward the global fit (shrinkage grid K = 4–32) were worse on both partitions at every strength — the best, K = 32, read 87.40% / 31.25% on partition A. A multi-feature k-nearest-neighbour comps model (log TVL, log age, category, chain overlap) read 92.71% alone; blended into the regression at the fit-tuned weight it read 85.87% / 29.69% — still short on both tests. Reshaped terms fared no better: capped age at two caps and log-age (87.46% at the better cap), a piecewise growth split (identical to production — the spike coefficient prices at zero), and growth×category interactions (86.87%). Every one is in the ledger with its numbers; the pricing model is unchanged for the third version running because, under an honest keep rule, nothing has beaten it yet.

The dashboard's audit panel adds two more reads on the same blind predictions. A **calibration table** buckets them by quintile of predicted value: the fit compresses the market's own spread toward the middle — conservative at the bottom (median recorded cap ×1.44 of the blind value in the lowest quintile), generous at the top (×0.83 in the highest). A **per-category error table** shows where the fit is strong and where it is thin: RWA prices tightest (33.2% median blind error on 9 fit members); Yield Aggregator is the thinnest read (155.56% on 4).

## Farm plans and verdicts

Each protocol's plan is generated from its own record — category, chains, TVL tier — never from a list of names: a setup step, the category's core action (supply, LP, stake, bridge volume, exchange account activity, …) with a deposit scaled to the protocol's tier, a second leg, a weekly routine for 8–16 weeks, a points/governance step and an exit review. Every step names its cost and its time, using a small per-chain gas table.

The verdict nets the plan against an expected take under one stated assumption: a launch sets aside 7.5% of the token's value for the community and 25,000 qualifying wallets share it, so one diligent wallet expects `implied × 0.075 / 25000`. **FARM** when that is at least **four times** the plan's total cost, **THIN** when it reaches **three quarters** of the cost, **SKIP** below. The first three versions asserted rounder lines (2× and 1×); this version's lines are the ones the verdict backtest itself selects — tuned independently on each fold partition's blind cases, both partitions pick the same pair (4×, 0.75×), and the pooled 256 blind cases agree (next section). Each row also states the implied value at which its plan would **break even** and the value at which it would **turn FARM**, so a reader can see the distance to each line. On this snapshot: 29 FARM, 135 THIN, 178 SKIP.

## The verdicts, backtested

Validating prices is not the same as validating decisions, so the audit panel also grades the verdicts themselves. For each of the 128 fit-set protocols, its token is hidden and the rule assigns the verdict it would have given at the value a blind fit produced; the verdict is then graded against the market cap the protocol actually reached — would one wallet's expected take at that cap, under the same 7.5% / 25,000-wallet assumption, have covered the plan's cost?

- **FARM** (9 blind cases): covered plan cost in **88.89%**; median recorded cap ×0.47 of the blind value — the blind fit ran hot on exactly the rows it liked most, and the 4× line is what absorbs that.
- **THIN** (39 cases): covered in 61.54%; median ratio ×1.13.
- **SKIP** (80 cases): covered in only 21.25% — the skip was usually right.
- Farming only the FARM bucket: **$446 of plan costs against $9,476 of takes** at the recorded caps, ×21.25 per dollar of cost. Farming all 128 the same way: $17,812 against $46,639, ×2.62 — more dollars back, 12% of the return per dollar spent.

Under the previous lines (2× / 1×) the same blind cases read 84.62% FARM coverage over 39 cases at ×15.13 per dollar pooled across both partitions. The recalibrated pair is not a one-fold artefact: the lines fitted on partition A's blind cases, applied to partition B's, put FARM coverage at 100% of 9 cases (×31.76 per dollar); fitted on B and applied to A, 88.89% of 9 (×21.25).

The fit set is by construction protocols whose tokens exist, so the backtest grades the pricing and the verdict arithmetic — never the chance that any given protocol issues a token at all. The dashboard states that caveat beside the table, and each protocol's detail view carries its own verdict's backtest record next to its farm economics.

## The dashboard

`dashboard/` is a static page (no framework, no network) rendered from `data.js`, which `main.ts` writes beside it from the same board that goes to `board.json`, so the page and the board cannot disagree. It has:

- a KPI strip and an **integrity strip** (watchlist coverage 40/40, the sealed snapshot date, the fit's size, both partitions' blind errors, the ranges' measured coverage, the verdict backtest's headline, and the full 342 + 416 = 758 accounting);
- the model panel with its validation numbers (two fold partitions and leave-one-out) and the **terms-tested table**;
- an **audit panel**: the calibration table, the per-category blind-error table, and the **verdict backtest** with its method and its survivorship caveat;
- a **“Start here” shortlist** at the head of the board — the five FARM plans with the most expected take over cost, with their combined cost and expected take (it hides itself while any filter is active);
- search and filters (category, chain, verdict, watchlist-only), seven sort orders, and a per-row **range bar** on a shared log scale;
- a per-protocol detail view: the record, the model's arithmetic, the **peers' record** (how much of its category already records a token, and at what median multiple — the cohort's history, shown as context and never an input to the price), the plan's economics with its break-even and FARM lines;
- **“What would change this rank”** — a scenario panel in every detail view: drag a TVL slider and the page re-prices the protocol from the same fitted coefficients the build published, showing the implied value, rank and verdict at that TVL, plus a threshold table (the TVL needed to reach rank #1, rank #10, the FARM line and break-even, and the weekly growth that would compound there in 12 weeks);
- the full **already-trading table** (all 416 tokenized protocols, searchable), and a CSV export of the filtered board.

Deep links work too: `?detail=<slug>`, `?watchlist=1`, `?cat=<category>`.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (via the vendored `vendor/makefun-board.ts`) to the output directory, then re-reads the written board and holds it to the gate's checks before reporting success. It is deterministic: two runs on the same snapshot write byte-identical output.
