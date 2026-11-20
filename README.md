# Launch Radar — a token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty. Launch Radar reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), ranks **every protocol that records no token yet — all 342 of them, the snapshot's 40-protocol watchlist included and flagged** — by an implied value from a comparables model fitted on the snapshot itself, and gives each one a costed farm plan with a verdict. Protocols that already record a token are never ranked: they are the model's training data, and the dashboard now accounts for **all 416 of them** in a searchable traded set, so every one of the 758 protocols is on the page exactly once.

This is the second version of the entry. The first asserted two of its value terms — a momentum bonus for a hot week and a maturity bonus for age — with hand-set weights. This version fits every term it keeps, blind-tests every term it was offered, and drops the ones the test does not keep.

## The value model

No protocol name is an input anywhere. The model (in `lib/model.ts`, version `comps-fit-3`) is:

1. **Fit.** On the 128 tokenized protocols that record both a market cap and a TVL, regress `log(mcap_usd)` on `log(tvl_usd)` (slope ≈ 0.52) **plus a fitted 7-day growth term**: the week's TVL change on a compressed signed-log scale, `sign(g) · log1p(|g| / 10)`. Each category then gets an intercept shift equal to its mean residual, shrunk toward zero by `n / (n + 8)`, so a category with two members barely moves and one with fifteen moves most of the way.
2. **Base value.** A pre-token protocol's base is that fit read at its own TVL and category — what its TVL prices at among tokenized peers.
3. **Growth multiplier.** `exp(coefficient × growth term)`, clamped to **×0.4–×2.5** so one week can never dominate a price. The fitted coefficient is **−0.544 — negative**: among the tokenized comps, a protocol whose TVL just spiked prices *lower* per TVL dollar (caps have not followed such spikes), and one whose TVL slid prices *higher* per dollar (its cap held up better than its TVL). The first version asserted the opposite with a +0.5 momentum weight; the fit contradicts it, so the fit wins. The term is compressed and bounded because the evidence is thin — the snapshot caught a down week, and few strong growers sit in the fit set — and the dashboard says so.
4. **No maturity term.** An age term was tested in several forms (log age; the first version's capped-years shape fitted instead of asserted; age bands) and the blind test keeps none of them, so this board carries no age bonus. Age is still printed on every row; it does not raise any price.
5. **Range.** Every row carries a low–high interval calibrated on **blind** predictions: the 10th–90th percentiles of the out-of-fold residuals (×0.066 to ×10.93 on this snapshot). Those ranges covered **81.25%** of the blind predictions' recorded caps. TVL prices loosely; the board says so instead of hiding it.

**Validation, shown on the dashboard:** the production rule — fit, growth term and bound included — is tested out of sample on every build, twice. The 128 fit-set protocols are split into five folds by an FNV-1a hash of the slug (the first version's partition, kept so the two versions compare fold for fold) and again by a second partition of the same hash; each fold is predicted by a fit that never saw it.

| | Median absolute error | Within 2× of recorded cap |
|---|---|---|
| v1 recipe (TVL + category, asserted terms) | 86.58% | 30.47% |
| **v2, partition A (same folds)** | **84.86%** | **32.81%** |
| v2, partition B (second split) | 85.17% | 31.25% |
| v2 + log-age term (tested, not kept) | 87.03% | 30.47% |

Weak in absolute terms, and printed on the page rather than rounded away — which is exactly why every row carries its range. The dashboard's model panel carries this same terms-tested table, computed at build time by the model itself.

## Farm plans and verdicts

Each protocol's plan is generated from its own record — category, chains, TVL tier — never from a list of names: a setup step, the category's core action (supply, LP, stake, bridge volume, exchange account activity, …) with a deposit scaled to the protocol's tier, a second leg, a weekly routine for 8–16 weeks, a points/governance step and an exit review. Every step names its cost and its time, using a small per-chain gas table.

The verdict nets the plan against an expected take under one stated assumption: a launch sets aside 7.5% of the token's value for the community and 25,000 qualifying wallets share it, so one diligent wallet expects `implied × 0.075 / 25000`. **FARM** when that is at least twice the plan's total cost, **THIN** when it at least covers the cost, **SKIP** below. Each row also states the implied value at which its plan would **break even** and the value at which it would **turn FARM**, so a reader can see the distance to each line. On this snapshot: 69 FARM, 67 THIN, 206 SKIP.

## The dashboard

`dashboard/` is a static page (no framework, no network) rendered from `data.js`, which `main.ts` writes beside it from the same board that goes to `board.json`, so the page and the board cannot disagree. It has:

- a KPI strip and an **integrity strip** (watchlist coverage 40/40, the sealed snapshot date, the fit's size, both partitions' blind errors, the ranges' measured coverage, and the full 342 + 416 = 758 accounting);
- the model panel with its validation numbers and the **terms-tested table**;
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
