// Launch Radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks EVERY protocol in the snapshot that records no token (no CoinGecko id and no
// symbol: 342 of the 758), the snapshot's 40-protocol watchlist included and flagged. Protocols that
// already record a token are never ranked by the model: they are the fit's training data and the
// dashboard's "already trading" set, priced by the market rather than by us.
//
// The value model is a comparables fit, estimated from the snapshot itself, nothing hardcoded per
// protocol:
//
//   fit        on the tokenized protocols that record both a market cap and a TVL, regress
//              log(mcap_usd) on log(tvl_usd); each category then gets an intercept shift equal to
//              its mean residual, shrunk toward zero by n / (n + SHRINK_K), so a category with two
//              members barely moves and one with fifteen moves most of the way.
//   base       = exp(intercept + slope * log(tvl_usd) + category shift)
//   growth     = 1 + clamp(change_7d, -50, +100) / 100 * 0.5     (a week of TVL momentum)
//   maturity   = 1 + 0.25 * min(age in years, 6) / 6              (longer at scale with no token
//              recorded reads as a stronger launch candidate; unknown listing date uses the
//              pre-token set's median age)
//   implied    = round(base * growth * maturity), at least $1
//
// The board also carries a range per row: the full fit's residual 10th and 90th percentiles, applied
// to the implied value. The spread is wide because the market's own pricing of TVL is wide; the
// range says so instead of hiding it.
//
// The fit is validated out of sample, deterministically: the tokenized protocols are split into five
// folds by an FNV-1a hash of the slug, each fold is predicted by a fit that never saw it, and the
// dashboard reports the median absolute error and the share of predictions within 2x of the recorded
// market cap across all five folds. The same procedure runs on every build, so the numbers on the
// page are the numbers this code produced on this snapshot.
//
// Farm verdicts use one stated piece of arithmetic: assume a launch sets aside 7.5% of the token's
// value for the community and 25,000 qualifying wallets share it, so one diligent wallet's expected
// take is implied * 0.075 / 25000. FARM when that is at least twice the plan's total cost, THIN when
// it at least covers the cost, SKIP below that.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The model's version label: the dashboard names it and the README quotes it. */
export const MODEL_VERSION = 'comps-fit-2';

/** Category-intercept shrinkage: an offset is trusted in proportion n / (n + SHRINK_K). */
export const SHRINK_K = 8;

/** The growth adjustment's shape: 7-day TVL change is clamped, then halved into a multiplier. */
export const GROWTH_FLOOR_PCT = -50;
export const GROWTH_CAP_PCT = 100;
export const GROWTH_WEIGHT = 0.5;

/** The maturity adjustment's shape: up to +25% at six years live with no token recorded. */
export const MATURITY_MAX_YEARS = 6;
export const MATURITY_BONUS = 0.25;

/** The verdict arithmetic's stated assumptions: community share of a launch, wallets sharing it. */
export const AIRDROP_SHARE = 0.075;
export const AIRDROP_WALLETS = 25_000;

/** How many already-trading protocols the dashboard's live set carries, by market cap. */
export const LIVE_ROWS = 24;

const DAY_MS = 86_400_000;
const NO_CATEGORY = '(uncategorised)';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all: no CoinGecko id and no symbol. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** FNV-1a over the slug: the deterministic fold key for out-of-sample validation. */
export function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The category key the fit groups by: the snapshot's category, or a bucket for none. */
function categoryOf(p: SnapshotProtocol): string {
  return p.category ?? NO_CATEGORY;
}

// ---------------------------------------------------------------- the fit

/** A fitted comparables model: the global line, the shrunk category shifts, and the residual spread. */
export interface CompsFit {
  intercept: number;
  slope: number;
  offsets: Map<string, number>;
  fit_n: number;
  categories_used: number;
  resid_q10: number;
  resid_q90: number;
}

/** Ordinary least squares of ys on xs. */
function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/** The line plus shrunk category shifts, fitted on `pts` (all with mcap and TVL recorded). */
function fitOn(pts: SnapshotProtocol[]): { a: number; b: number; offsets: Map<string, number> } {
  const { a, b } = ols(
    pts.map((p) => Math.log(Math.max(1, p.tvl_usd))),
    pts.map((p) => Math.log(p.mcap_usd!)),
  );
  const residuals = new Map<string, number[]>();
  for (const p of pts) {
    const r = Math.log(p.mcap_usd!) - (a + b * Math.log(Math.max(1, p.tvl_usd)));
    const key = categoryOf(p);
    const arr = residuals.get(key);
    if (arr === undefined) residuals.set(key, [r]);
    else arr.push(r);
  }
  const offsets = new Map<string, number>();
  for (const [key, arr] of residuals) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    offsets.set(key, mean * (arr.length / (arr.length + SHRINK_K)));
  }
  return { a, b, offsets };
}

/** A fitted model's base value for one protocol: what its TVL prices at among tokenized peers. */
function baseOf(fit: { intercept: number; slope: number; offsets: Map<string, number> }, p: SnapshotProtocol): number {
  const shift = fit.offsets.get(categoryOf(p)) ?? 0;
  return Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, p.tvl_usd)) + shift);
}

/** A raw line-plus-offsets fit in the shape baseOf reads. */
function asFit(f: { a: number; b: number; offsets: Map<string, number> }): { intercept: number; slope: number; offsets: Map<string, number> } {
  return { intercept: f.a, slope: f.b, offsets: f.offsets };
}

/** The out-of-sample report: five deterministic folds, every fit-set protocol predicted blind once. */
export interface Validation {
  folds: number;
  n: number;
  median_abs_err_pct: number;
  within_2x_pct: number;
}

/** Fit the production model on every usable tokenized protocol, and validate the recipe by folds. */
export function fitModel(protocols: SnapshotProtocol[]): { fit: CompsFit; validation: Validation } {
  const fitSet = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const full = fitOn(fitSet);
  const residuals = fitSet
    .map((p) => Math.log(p.mcap_usd!) - Math.log(baseOf(asFit(full), p)))
    .sort((x, y) => x - y);
  const quantile = (f: number): number => residuals[Math.min(residuals.length - 1, Math.max(0, Math.floor(f * residuals.length)))]!;
  const fit: CompsFit = {
    intercept: full.a,
    slope: full.b,
    offsets: full.offsets,
    fit_n: fitSet.length,
    categories_used: full.offsets.size,
    resid_q10: quantile(0.1),
    resid_q90: quantile(0.9),
  };

  const errs: number[] = [];
  let within = 0;
  for (let fold = 0; fold < 5; fold++) {
    const train = fitSet.filter((p) => slugHash(p.slug) % 5 !== fold);
    const foldFit = asFit(fitOn(train));
    for (const p of fitSet) {
      if (slugHash(p.slug) % 5 !== fold) continue;
      const ratio = baseOf(foldFit, p) / p.mcap_usd!;
      errs.push(Math.abs(ratio - 1));
      if (Math.abs(Math.log(ratio)) <= Math.log(2)) within++;
    }
  }
  errs.sort((x, y) => x - y);
  const validation: Validation = {
    folds: 5,
    n: errs.length,
    median_abs_err_pct: round2(errs[Math.floor(errs.length / 2)]! * 100),
    within_2x_pct: round2((within / errs.length) * 100),
  };
  return { fit, validation };
}

// ---------------------------------------------------------------- scoring one protocol

/** One protocol priced: the base, each adjustment, the implied value and its range. */
export interface Priced {
  age_days: number | null;
  base_usd: number;
  base_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
}

/** Price one pre-token protocol under the fitted model. */
export function price(
  p: SnapshotProtocol,
  asOf: string,
  fit: CompsFit,
  unknownAgeYears: number,
): Priced {
  const age = ageDays(asOf, p.listed_at);
  const ageYears = age === null ? unknownAgeYears : age / 365.25;
  const base = baseOf(fit, p);
  const growthPct = p.change_7d === null ? 0 : Math.min(GROWTH_CAP_PCT, Math.max(GROWTH_FLOOR_PCT, p.change_7d));
  const growthMult = 1 + (growthPct / 100) * GROWTH_WEIGHT;
  const maturityMult = 1 + MATURITY_BONUS * (Math.min(Math.max(ageYears, 0), MATURITY_MAX_YEARS) / MATURITY_MAX_YEARS);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  const low = Math.max(1, Math.min(implied, Math.round(implied * Math.exp(fit.resid_q10))));
  const high = Math.max(implied, Math.round(implied * Math.exp(fit.resid_q90)));
  return {
    age_days: age,
    base_usd: Math.round(base),
    base_multiple: round4(base / Math.max(1, p.tvl_usd)),
    growth_multiplier: round4(growthMult),
    maturity_multiplier: round4(maturityMult),
    implied_value_usd: implied,
    low_usd: low,
    high_usd: high,
  };
}

// ---------------------------------------------------------------- farm plans

/**
 * A rough per-transaction gas cost in dollars for the chains the snapshot names, at ordinary 2026
 * fee levels. Cost data for planning, never a value input: Ethereum is the expensive rail, the L2s
 * and alt-L1s are cheap, and anything unlisted falls back by family.
 */
const CHAIN_GAS_USD: Record<string, number> = {
  Ethereum: 9,
  Bitcoin: 3,
  Binance: 0.4,
  Tron: 1.2,
  Avalanche: 0.5,
  Solana: 0.1,
  Polygon: 0.1,
  Arbitrum: 0.25,
  Base: 0.15,
  Optimism: 0.2,
  Linea: 0.3,
  Scroll: 0.3,
  'zkSync Era': 0.25,
  Starknet: 0.2,
  Mantle: 0.1,
  Sui: 0.1,
  Aptos: 0.1,
  Near: 0.1,
  Cosmos: 0.1,
  Berachain: 0.2,
  Sonic: 0.1,
  Monad: 0.1,
  Unichain: 0.15,
  Ink: 0.15,
  Sei: 0.1,
  Ton: 0.1,
  TON: 0.1,
  Cardano: 0.2,
  Stellar: 0.05,
  Ripple: 0.05,
  Hedera: 0.05,
  Algorand: 0.05,
};

/** One chain's per-transaction gas estimate in dollars. */
export function gasUsd(chain: string): number {
  const known = CHAIN_GAS_USD[chain];
  if (known !== undefined) return known;
  if (chain.includes('Ethereum')) return 9;
  if (chain.includes('Bitcoin') || chain.includes('Litecoin') || chain.includes('Doge')) return 2;
  return 0.8;
}

/** The deposit a plan works with, scaled to the protocol's TVL tier. */
export function depositFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 1000;
  if (tvlUsd >= 1_000_000_000) return 500;
  if (tvlUsd >= 250_000_000) return 250;
  if (tvlUsd >= 50_000_000) return 150;
  return 100;
}

/** How many weeks a plan runs: the largest protocols qualify a wallet fastest. */
export function weeksFor(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 8;
  if (tvlUsd >= 50_000_000) return 12;
  return 16;
}

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** The category's core action and second leg, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, chain: string, secondChain: string | null, deposit: number): { core: string; second: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const d = money(deposit);
  if (c.includes('cex')) {
    return {
      core: `Open and verify an account on ${name}, deposit ${d} and hold the balance on the exchange instead of sweeping it back out.`,
      second: `Trade ${d} of spot volume in small clips across the week on ${name} and join any launchpool or rewards campaign it runs.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      core: `Supply ${d} of USDC or ETH to ${name} on ${chain} and leave the position open so it accrues a lending history.`,
      second: `Borrow a small amount against the supply on ${name} (under 40% of its value), hold it a few days, then repay in full.`,
    };
  }
  if (c.includes('dex') || c.includes('leveraged farm') || c === 'farm') {
    return {
      core: `Provide ${d} of liquidity to ${name}'s deepest pool on ${chain}, split evenly between the pool's two assets.`,
      second: `Route a few swaps a week through ${name} on ${chain}, sized ${money(Math.max(25, Math.round(deposit / 10)))} or more, so the wallet shows real trading volume.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      core: `Bridge ${d} of USDC from Ethereum to ${secondChain ?? chain} through ${name} and keep the funds working on the far side.`,
      second: `Bridge a smaller amount back through ${name} a week later, so the wallet shows two-way traffic rather than a single hop.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      core: `Stake ${d} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`,
      second: `Put the receipt token to work in one of ${name}'s listed integrations, or hold it untouched if none is live yet.`,
    };
  }
  if (c.includes('derivative') || c.includes('perpetual')) {
    return {
      core: `Deposit ${d} of USDC as margin on ${name} and open one small hedged position so the account carries real trading history.`,
      second: `Close and reopen a modest position on ${name} each week, keeping total volume steady rather than spiking it in one day.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      core: `Complete ${name}'s onboarding or KYC if it asks for it, then mint ${d} of its yield asset on ${chain} and hold it.`,
      second: `Add a second, smaller mint on ${name} a month later so the holding history spans more than one statement period.`,
    };
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('basis') || c.includes('liquidity manager')) {
    return {
      core: `Deposit ${d} into a ${name} vault on ${chain} and keep the vault shares in the wallet for the whole plan.`,
      second: `Rotate a quarter of the position into a second ${name} vault after four weeks, so the wallet is not a one-deposit address.`,
    };
  }
  if (c.includes('chain')) {
    return {
      core: `Bridge ${d} to ${chain} and make ${name}'s own apps the wallet's home: one transaction a week, every week.`,
      second: `Use two different native apps on ${chain} (a swap and a lending market, say) so the wallet is not tied to one contract.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      core: `Fund ${d} on ${name} and take positions in three different markets, sized small enough to hold to settlement.`,
      second: `Settle every position on ${name} rather than selling out early, so the record shows completed markets.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      core: `Buy ${d} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to expiry.`,
      second: `Renew or extend the cover on ${name} once, so the wallet shows a second policy period.`,
    };
  }
  return {
    core: `Deposit ${d} of USDC into ${name} on ${chain} through its own app and keep the position open for the whole plan.`,
    second: `Make one further deposit or withdrawal on ${name} each month, so the wallet's history is a pattern and not a single touch.`,
  };
}

/** A protocol's farm plan: the steps as board strings, and the plan's own economics. */
export interface FarmPlan {
  steps: string[];
  deposit_usd: number;
  weeks: number;
  total_cost_usd: number;
  expected_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** Build the plan for one protocol from its own record: category, chains, TVL and implied value. */
export function farmPlan(p: SnapshotProtocol, impliedUsd: number): FarmPlan {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const gas = gasUsd(chain);
  const deposit = depositFor(p.tvl_usd);
  const weeks = weeksFor(p.tvl_usd);
  const isCex = (p.category ?? '').toLowerCase().includes('cex');
  const bridgeIn = chain === 'Ethereum' || isCex ? 0 : 7;
  const setupCost = isCex ? 5 : bridgeIn + 2 * gas;
  const weeklyCost = isCex ? 3 : 2 * gas;
  const exitCost = isCex ? 5 : 2 * gas;
  const capitalCost = deposit * 0.04 * (weeks / 52);
  const totalCost = Math.max(1, Math.round(setupCost + weeks * weeklyCost + exitCost + capitalCost));
  const expected = Math.round(impliedUsd * (AIRDROP_SHARE / AIRDROP_WALLETS));
  const verdict: FarmPlan['verdict'] = expected >= 2 * totalCost ? 'FARM' : expected >= totalCost ? 'THIN' : 'SKIP';
  const { core, second } = actionsFor(p, chain, secondChain, deposit);
  const name = p.name;
  if (isCex) {
    // An exchange is farmed through the account itself: verification, a held balance, steady
    // volume and its earn products. There is no wallet to bridge to, so the plan says so.
    return {
      steps: [
        `Create an account on ${name} with a dedicated email, complete its identity verification and switch on two-factor authentication before any money moves. Cost: nothing. Time: 30 to 45 minutes, once.`,
        `Deposit ${money(deposit + 50)} to ${name} by bank transfer or on-chain transfer and keep at least ${money(deposit)} of it on the exchange for the whole plan; balances held rather than swept out are what reward snapshots usually see. Cost: about $5 in transfer or network fees. Time: 20 minutes.`,
        `Trade ${money(deposit)} of spot volume on ${name} each week in small clips rather than one block, and use a second product once (its convert desk or a simple earn subscription) so the account is not a single-feature one. Cost: about $3 a week in trading fees. Time: 30 minutes a week.`,
        `Subscribe the idle balance to ${name}'s earn or launchpool product whenever one is open and stay subscribed for the full term. Cost: nothing beyond the balance already held. Time: 10 minutes to subscribe, then it runs itself for ${weeks} weeks.`,
        `Open ${name}'s rewards, VIP or campaign page once a month and join whatever it offers account holders; claim nothing from any link the exchange itself did not publish. Cost: nothing. Time: 15 minutes a month.`,
        `At week ${weeks}, re-read ${name}'s announcements: if a token, points conversion or snapshot date is named, keep the balance in place until it passes; if nothing is named, withdraw to your own wallet and bank the history. Cost: about $5 withdrawal fee. Time: 30 minutes.`,
      ],
      deposit_usd: deposit,
      weeks,
      total_cost_usd: totalCost,
      expected_usd: expected,
      verdict,
    };
  }
  const steps = [
    `Set up a fresh wallet for ${name} and fund it on ${chain}: bridge ${money(deposit + 50)} of USDC in${bridgeIn > 0 ? ` (about ${money(bridgeIn)} bridge fee)` : ' directly'}, keeping the seed phrase offline. Cost: about ${money(setupCost)} in fees and gas. Time: 30 minutes, once.`,
    `${core} Cost: the ${money(deposit)} deposit (capital, returned on exit) plus about ${money(2 * gas)} of gas. Time: 20 minutes to set up.`,
    `${second} Cost: about ${money(2 * gas)} of gas per round. Time: 15 minutes.`,
    `Repeat one qualifying action on ${name} every week for ${weeks} weeks (a deposit, a swap, a borrow or a vote), never letting two weeks pass empty. Cost: about ${money(weeklyCost)} of gas a week. Time: about 1.5 hours a week for ${weeks} weeks.`,
    `Open ${name}'s own points, rewards or governance page once a month and take part in whatever it offers (a vote, a quest, a testnet task); claim nothing from any link the protocol itself did not publish. Cost: nothing beyond gas already counted. Time: 20 minutes a month.`,
    `At week ${weeks}, re-read ${name}'s announcements: if a token or snapshot date is named, hold the position until it passes; if nothing is named, unwind and bank the history. Keep a log of every transaction either way. Cost: about ${money(exitCost)} of gas to exit. Time: 30 minutes.`,
  ];
  return { steps, deposit_usd: deposit, weeks, total_cost_usd: totalCost, expected_usd: expected, verdict };
}

// ---------------------------------------------------------------- the board

/** One row of the board: the ranked claim, its model breakdown, its range and its farm plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    base_usd: number;
    base_multiple: number;
    growth_multiplier: number;
    maturity_multiplier: number;
  };
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm: {
    deposit_usd: number;
    weeks: number;
    total_cost_usd: number;
    expected_usd: number;
  };
  why: string;
  farm_steps: string[];
}

/** A compact money figure for the why line: $1.23B, $45.6M, $789K or $321. */
function shortUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/** The one-line account of a row's rank, from its own figures. */
function whyLine(p: SnapshotProtocol, priced: Priced): string {
  const cat = p.category ?? 'uncategorised';
  const growthPct = p.change_7d === null ? 'no 7-day change reported' : `${p.change_7d >= 0 ? '+' : ''}${round2(p.change_7d)}% TVL in 7 days`;
  const age = priced.age_days === null ? 'listing date unreported, median age assumed' : `${(priced.age_days / 365.25).toFixed(1)} years with no token recorded`;
  return (
    `Base ${shortUsd(priced.base_usd)}: ${shortUsd(p.tvl_usd)} of TVL priced at the ${cat} multiple (${priced.base_multiple}x of TVL) from the tokenized fit; ` +
    `growth x${priced.growth_multiplier} (${growthPct}); maturity x${priced.maturity_multiplier} (${age}). ` +
    `Range ${shortUsd(priced.low_usd)}-${shortUsd(priced.high_usd)} is the fit's residual spread, not a target.`
  );
}

/** An already-trading protocol: shown at the market's own value, never ranked by the model. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the live set, the model and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  counts: {
    protocols: number;
    pre_token: number;
    tokenized: number;
    watchlist: number;
    fit_n: number;
  };
  totals: {
    implied_usd: number;
    pre_token_tvl_usd: number;
  };
  model: {
    intercept: number;
    slope: number;
    categories_used: number;
    shrink_k: number;
    range_low_factor: number;
    range_high_factor: number;
    growth_floor_pct: number;
    growth_cap_pct: number;
    growth_weight: number;
    maturity_max_years: number;
    maturity_bonus: number;
    unknown_age_years: number;
    airdrop_share: number;
    airdrop_wallets: number;
  };
  validation: Validation;
  rows: BoardRow[];
  live: LiveRow[];
}

/** The whole radar from one snapshot: fit, price every pre-token protocol, rank, plan. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { fit, validation } = fitModel(snapshot.protocols);
  const watch = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter(recordsNoToken);

  const datedAges = pre
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const medianAgeDays = datedAges.length > 0 ? datedAges[Math.floor(datedAges.length / 2)]! : 730;
  const unknownAgeYears = round2(medianAgeDays / 365.25);

  const scored = pre.map((p) => {
    const priced = price(p, snapshot.as_of, fit, unknownAgeYears);
    const plan = farmPlan(p, priced.implied_value_usd);
    return { p, priced, plan };
  });
  scored.sort(
    (a, b) =>
      b.priced.implied_value_usd - a.priced.implied_value_usd ||
      b.p.tvl_usd - a.p.tvl_usd ||
      (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );

  const board: BoardRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.priced.age_days,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.priced.implied_value_usd,
    implied_low_usd: s.priced.low_usd,
    implied_high_usd: s.priced.high_usd,
    model: {
      base_usd: s.priced.base_usd,
      base_multiple: s.priced.base_multiple,
      growth_multiplier: s.priced.growth_multiplier,
      maturity_multiplier: s.priced.maturity_multiplier,
    },
    verdict: s.plan.verdict,
    farm: {
      deposit_usd: s.plan.deposit_usd,
      weeks: s.plan.weeks,
      total_cost_usd: s.plan.total_cost_usd,
      expected_usd: s.plan.expected_usd,
    },
    why: whyLine(s.p, s.priced),
    farm_steps: s.plan.steps,
  }));

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      change_7d: p.change_7d,
    }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    counts: {
      protocols: snapshot.protocols.length,
      pre_token: pre.length,
      tokenized: snapshot.protocols.length - pre.length,
      watchlist: snapshot.watchlist.length,
      fit_n: fit.fit_n,
    },
    totals: {
      implied_usd: board.reduce((s, r) => s + r.implied_value_usd, 0),
      pre_token_tvl_usd: pre.reduce((s, p) => s + p.tvl_usd, 0),
    },
    model: {
      intercept: round4(fit.intercept),
      slope: round4(fit.slope),
      categories_used: fit.categories_used,
      shrink_k: SHRINK_K,
      range_low_factor: round4(Math.exp(fit.resid_q10)),
      range_high_factor: round4(Math.exp(fit.resid_q90)),
      growth_floor_pct: GROWTH_FLOOR_PCT,
      growth_cap_pct: GROWTH_CAP_PCT,
      growth_weight: GROWTH_WEIGHT,
      maturity_max_years: MATURITY_MAX_YEARS,
      maturity_bonus: MATURITY_BONUS,
      unknown_age_years: unknownAgeYears,
      airdrop_share: AIRDROP_SHARE,
      airdrop_wallets: AIRDROP_WALLETS,
    },
    validation,
    rows: board,
    live,
  };
  return { board, radar };
}

// ---------------------------------------------------------------- snapshot in, board checked

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values, steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} trimmed characters`;
    }
  }
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i++) {
    if (byRank[i]!.rank !== i + 1) return `rank ${i + 1} is held by ${byRank[i]!.slug} with rank ${byRank[i]!.rank}`;
    if (i > 0 && byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `rank ${i + 1} outvalues rank ${i}`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'every row shares one implied value: a board that ranks nothing by value is not a ranking';
  }
  return null;
}

/** The dashboard's data file: the whole radar as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
