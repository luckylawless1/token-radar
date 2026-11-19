# Launch Radar — a token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luckylawless1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty. Launch Radar reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14), ranks **every protocol that records no token yet — all 342 of them, the snapshot's 40-protocol watchlist included and flagged** — by an implied value from a comparables model fitted on the snapshot itself, and gives each one a costed farm plan with a verdict. Protocols that already record a token are never ranked: they are the model's training data and are shown separately at the market's own values.

## The value model

No protocol name is an input anywhere. The model (in `lib/model.ts`, version `comps-fit-2`) is:

1. **Fit.** On the 128 tokenized protocols that record both a market cap and a TVL, regress `log(mcap_usd)` on `log(tvl_usd)` (slope ≈ 0.52). Each category then gets an intercept shift equal to its mean residual, shrunk toward zero by `n / (n + 8)`, so a category with two members barely moves and one with fifteen moves most of the way.
2. **Base value.** A pre-token protocol's base is that fit read at its own TVL and category — what its TVL prices at among tokenized peers.
3. **Growth adjustment.** `1 + clamp(change_7d, −50%, +100%) / 100 × 0.5`: a week of TVL momentum, bounded.
4. **Maturity adjustment.** Up to +25% at six years live at scale with no token recorded (a protocol that has run that long without one is the stronger launch candidate); an unreported listing date uses the pre-token set's median age.
5. **Range.** Every row carries a low–high interval from the fit's residual 10th–90th percentiles (×0.087 to ×8.26 on this snapshot). TVL prices loosely; the board says so instead of hiding it.

**Validation, shown on the dashboard:** the fit recipe is tested out of sample on every build. The 128 fit-set protocols are split into five deterministic folds by an FNV-1a hash of the slug; each fold is predicted by a fit that never saw it. Across all five folds the median absolute error is 86.6% and 30.5% of predictions land within 2× of the recorded market cap — weak in absolute terms, and printed on the page rather than rounded away, which is exactly why every row carries its range.

## Farm plans and verdicts

Each protocol's plan is generated from its own record — category, chains, TVL tier — never from a list of names: a setup step, the category's core action (supply, LP, stake, bridge volume, exchange account activity, …) with a deposit scaled to the protocol's tier, a second leg, a weekly routine for 8–16 weeks, a points/governance step and an exit review. Every step names its cost and its time, using a small per-chain gas table.

The verdict nets the plan against an expected take under one stated assumption: a launch sets aside 7.5% of the token's value for the community and 25,000 qualifying wallets share it, so one diligent wallet expects `implied × 0.075 / 25000`. **FARM** when that is at least twice the plan's total cost, **THIN** when it at least covers the cost, **SKIP** below. On this snapshot: 74 FARM, 77 THIN, 191 SKIP.

## The dashboard

`dashboard/` is a static page (no framework, no network) rendered from `data.js`, which `main.ts` writes beside it from the same board that goes to `board.json`, so the page and the board cannot disagree. It has a KPI strip, the model panel with its validation numbers, search and filters (category, chain, verdict, watchlist-only), six sort orders, a per-protocol detail view (the record, the model's arithmetic, the plan's economics, the steps), an already-trading table, and a CSV export of the filtered board. Deep links work too: `?detail=<slug>`, `?watchlist=1`, `?cat=<category>`.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22, standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (via the vendored `vendor/makefun-board.ts`) to the output directory, then re-reads the written board and holds it to the gate's checks before reporting success. It is deterministic: two runs on the same snapshot write byte-identical output.
