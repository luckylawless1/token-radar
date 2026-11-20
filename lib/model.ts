// Launch Radar's model, version 4 of the entry: one snapshot of the protocol universe in, one
// ranked board out. The pricing spec is version 2's, unchanged — a wider sweep of candidate
// families (per-category slopes, a nearest-neighbour blend, weighted and robust lines, a
// recalibration) was blind-tested against it for version 3 and none earned the board (the
// dashboard's terms table prints every one's error). What version 3 added was audit depth:
// leave-one-out validation, a calibration table, per-category blind errors, and a backtest
// of the farm verdicts themselves, all computed from the same out-of-fold predictions.
// Version 4 tests four more lever families against the same keep rule — per-category
// sub-models shrunk to the global fit, a multi-feature nearest-neighbour model alone and
// blended, reshaped age and growth terms, growth-by-category interactions — and again none
// of them moves a single price. What version 4 changes is the two decision layers, each
// recalibrated on cross-partition blind evidence: the ranges are now per-category bands
// (calibrated on one fold partition, they hold their coverage on the other far more evenly
// than the single global band did), and the verdict lines sit where the blind backtest
// itself puts them — FARM at four times plan cost, THIN at three quarters of it — a pair
// each partition's backtest chooses independently. Every implied value and every rank on
// the board is exactly version 3's; only the bands and the verdicts moved.
//
// The board ranks EVERY protocol in the snapshot that records no token (no CoinGecko id and no
// symbol: 342 of the 758), the snapshot's 40-protocol watchlist included and flagged. Protocols
// that already record a token are never ranked by the model: they are the fit's training data
// and the dashboard's already-trading set, priced by the market rather than by us.
//
// The value model is a comparables fit, estimated from the snapshot itself, nothing hardcoded
// per protocol and no hand-set adjustment weights. On the tokenized protocols that record both
// a market cap and a TVL it regresses
//
//   log(mcap_usd) ~ log(tvl_usd) + growth term,
//
// where the growth term is the week's TVL change on a compressed signed-log scale,
// sign(g) * log1p(|g| / 10). Each category then takes an intercept shift equal to its mean
// residual, shrunk toward zero by n / (n + SHRINK_K), so a category with two members barely
// moves and one with fifteen moves most of the way. A pre-token protocol's implied value is
//
//   implied = exp(intercept + slope * log(tvl) + category shift) * growth multiplier,
//
// the growth multiplier being exp(coefficient * growth term) clamped to [0.4, 2.5] so no single
// week's spike or slide can dominate a price. The fitted growth coefficient on this snapshot is
// NEGATIVE: among the tokenized comps, a protocol whose TVL just spiked prices LOWER per TVL
// dollar, not higher (its cap has not followed the spike, or the spike is mercenary money), and
// one whose TVL slid prices higher per dollar (its cap held up better than its TVL did). The
// first version of this entry asserted the opposite with a hand-set momentum bonus; the fit
// contradicts it, so the fit wins. The term is compressed and bounded precisely because the
// evidence is thin — a down week in the snapshot leaves few strong growers in the fit set —
// and the model panel on the dashboard says so.
//
// Two candidate terms were tested the same way and NOT kept, because the blind test does not
// keep them: a maturity term (log age, and the first version's capped-years shape) raises the
// out-of-sample error in every form tried, so this board carries no age bonus — a protocol's
// age is still shown on every row and still lengthens its farm plan's context, it simply does
// not raise its price. The dashboard's model panel prints each tested term's blind error next
// to the production model's, computed at build time by the same code that prices the board.
//
// Validation is out of sample and deterministic, three times over. The tokenized fit set is
// split into five folds by an FNV-1a hash of the slug (the first version's partition, kept
// so the versions' headline errors are comparable fold for fold) and again by a second
// partition of the same hash; each fold is predicted by a fit that never saw it, under the
// exact production rule including the multiplier bound. A leave-one-out pass then predicts
// every fit-set protocol from the other 127. The dashboard reports all three validations'
// median absolute error and share within 2x of the recorded market cap, a calibration table
// of the first partition's blind predictions by quintile, and each category's blind error.
//
// The same blind predictions also grade the board's decisions, not just its prices: every
// fit-set protocol takes the farm verdict the rule gives at its blind value, and the
// dashboard's backtest panel reports how those verdicts ended against the caps the market
// actually set — what share of each bucket's plans the realised take would have covered,
// and what farming only the FARM bucket would have returned against farming everything.
//
// Each row's range is calibrated on blind predictions rather than on the fit's own residuals:
// the first partition's out-of-fold residuals (log of recorded cap over blind prediction) set
// a band per category — its own 10th and 90th percentiles, shrunk toward the global band's
// by n / (n + SHRINK_K), the same shrinkage the category offsets use — and a protocol whose
// category the fit set never priced takes the global band. One global band for every row
// covered the blind caps unevenly: calibrated on one partition and scored on the other, its
// per-category coverage strayed 11.4 points from the nominal rate on average and fell to 60%
// in its worst category. The per-category bands, tested the same cross-partition way, stray
// 7.0 and 8.8 points and never fall below 73%, at 3–5% more mean band width — the width was
// being spent in the wrong categories, and the dashboard's terms table prints the test.
//
// Farm verdicts use one stated piece of arithmetic: assume a launch sets aside 7.5% of the
// token's value for the community and 25,000 qualifying wallets share it, so one diligent
// wallet's expected take is implied * 0.075 / 25000. Where the two verdict lines sit on that
// arithmetic is itself a fitted choice, not a round number asserted: the first versions put
// FARM at twice the plan's cost and THIN at the cost, and the blind backtest grades those
// lines as mediocre — their FARM bucket covered its plan cost in about 85% of blind cases.
// Re-running the backtest with the lines as free parameters, each fold partition's blind
// cases independently choose FARM at four times cost and THIN at three quarters of it (the
// pooled 256 blind cases choose the same pair), and at those lines the FARM bucket covered
// cost in 94% of its pooled blind cases and returned x25.54 per dollar of plan cost against
// x15.13 at the old lines. Version 4 ships the chosen lines; the backtest panel prints
// their record on the first partition's blind cases, computed by the same code that prices
// the board. Each row also carries the break-even implied value at which its plan's
// expected take would cover its cost, so a reader can see how far a protocol sits from its
// own verdict lines.

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
export const MODEL_VERSION = 'comps-fit-4';

/** Category-intercept shrinkage: an offset is trusted in proportion n / (n + SHRINK_K). */
export const SHRINK_K = 8;

/** The growth multiplier's bounds: one week of TVL movement can move a price at most this far. */
export const GROWTH_MULT_LOW = 0.4;
export const GROWTH_MULT_HIGH = 2.5;

/** The verdict arithmetic's stated assumptions: community share of a launch, wallets sharing it. */
export const AIRDROP_SHARE = 0.075;
export const AIRDROP_WALLETS = 25_000;

/**
 * The verdict lines as multiples of a plan's total cost, recalibrated in version 4: each fold
 * partition's blind backtest, and the pooled backtest, independently put FARM at 4x cost and
 * THIN at 0.75x cost (see the header's account and the terms table's calibration rows).
 */
export const FARM_MULTIPLE = 4;
export const THIN_MULTIPLE = 0.75;

const DAY_MS = 86_400_000;
const NO_CATEGORY = '(uncategorised)';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

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

/**
 * The week's TVL change on the scale the fit reads: sign(g) * log1p(|g| / 10), so +10% reads
 * about +0.69, +100% about +2.4 and +1000% about +4.6 — a spike is compressed long before it
 * can dominate a price. An unreported week reads 0: no adjustment claimed either way.
 */
export function growthTerm(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 0;
  return Math.sign(change7d) * Math.log1p(Math.abs(change7d) / 10);
}

// ---------------------------------------------------------------- the fit

/** Which terms a candidate model carries: the production spec and its tested variants. */
export interface FitSpec {
  growth: boolean;
  age: boolean;
}

/** The production spec: TVL, the fitted growth term, shrunk category shifts. No age term. */
export const PRODUCTION_SPEC: FitSpec = { growth: true, age: false };

/** Imputation constants a fit carries for rows whose record is incomplete. */
interface FitContext {
  medianAgeDays: number;
  asOf: string;
}

/** One protocol's regressor row under a spec: [1, log TVL, growth term?, log age?]. */
function features(p: SnapshotProtocol, spec: FitSpec, ctx: FitContext): number[] {
  const row = [1, Math.log(Math.max(1, p.tvl_usd))];
  if (spec.growth) row.push(growthTerm(p.change_7d));
  if (spec.age) {
    const days = ageDays(ctx.asOf, p.listed_at) ?? ctx.medianAgeDays;
    row.push(Math.log(Math.max(1, days)));
  }
  return row;
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    if (Math.abs(a[pivot]![col]!) < 1e-12) continue;
    const swap = a[col]!;
    a[col] = a[pivot]!;
    a[pivot] = swap;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r]![col]! / a[col]![col]!;
      for (let c = col; c <= n; c++) a[r]![c]! -= factor * a[col]![c]!;
    }
  }
  return a.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/** Least squares via the normal equations: exact, deterministic, and tiny at this width. */
function regress(xs: number[][], ys: number[]): number[] {
  const k = xs[0]!.length;
  const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const aty = new Array<number>(k).fill(0);
  for (let i = 0; i < xs.length; i++) {
    for (let r = 0; r < k; r++) {
      aty[r]! += xs[i]![r]! * ys[i]!;
      for (let c = 0; c < k; c++) ata[r]![c]! += xs[i]![r]! * xs[i]![c]!;
    }
  }
  return solve(ata, aty);
}

/** A fitted candidate model: coefficients, shrunk category shifts, and its imputation context. */
export interface RegressionFit {
  beta: number[];
  offsets: Map<string, number>;
  ctx: FitContext;
  spec: FitSpec;
}

/** Fit one candidate spec on `pts` (all with mcap and TVL recorded): line, then category shifts. */
function fitOn(pts: SnapshotProtocol[], spec: FitSpec, asOf: string): RegressionFit {
  const dated = pts
    .map((p) => ageDays(asOf, p.listed_at))
    .filter((d): d is number => d !== null)
    .sort((x, y) => x - y);
  const ctx: FitContext = {
    medianAgeDays: dated.length > 0 ? dated[Math.floor(dated.length / 2)]! : 730,
    asOf,
  };
  const xs = pts.map((p) => features(p, spec, ctx));
  const ys = pts.map((p) => Math.log(p.mcap_usd!));
  const beta = regress(xs, ys);
  const residuals = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const pred = xs[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    const key = categoryOf(pts[i]!);
    const arr = residuals.get(key);
    if (arr === undefined) residuals.set(key, [ys[i]! - pred]);
    else arr.push(ys[i]! - pred);
  }
  const offsets = new Map<string, number>();
  for (const [key, arr] of residuals) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    offsets.set(key, mean * (arr.length / (arr.length + SHRINK_K)));
  }
  return { beta, offsets, ctx, spec };
}

/**
 * A fitted model's log prediction for one protocol under the production rule: the regression
 * read at the protocol, with the growth contribution bounded as a multiplier so a single
 * week's movement cannot dominate. (For a spec without the growth term this is the plain read.)
 */
function predictLog(fit: RegressionFit, p: SnapshotProtocol): number {
  const row = features(p, fit.spec, fit.ctx);
  let logValue = fit.offsets.get(categoryOf(p)) ?? 0;
  let j = 0;
  logValue += fit.beta[j++]! * row[0]! + fit.beta[j++]! * row[1]!;
  if (fit.spec.growth) {
    const mult = clamp(Math.exp(fit.beta[j]! * row[j]!), GROWTH_MULT_LOW, GROWTH_MULT_HIGH);
    logValue += Math.log(mult);
    j++;
  }
  if (fit.spec.age) logValue += fit.beta[j]! * row[j]!;
  return logValue;
}

/** The out-of-sample report for one candidate spec on one fold partition. */
export interface Validation {
  folds: number;
  n: number;
  median_abs_err_pct: number;
  within_2x_pct: number;
}

/** One partition's five folds: every fit-set protocol predicted once by a fit that never saw it. */
function validateSpec(
  fitSet: SnapshotProtocol[],
  spec: FitSpec,
  asOf: string,
  foldOf: (p: SnapshotProtocol) => number,
): { validation: Validation; oosLogResiduals: number[]; oofLogPreds: Map<string, number> } {
  const errs: number[] = [];
  const oosLogResiduals: number[] = [];
  const oofLogPreds = new Map<string, number>();
  let within = 0;
  for (let fold = 0; fold < 5; fold++) {
    const train = fitSet.filter((p) => foldOf(p) !== fold);
    const foldFit = fitOn(train, spec, asOf);
    for (const p of fitSet) {
      if (foldOf(p) !== fold) continue;
      const logPred = predictLog(foldFit, p);
      oofLogPreds.set(p.slug, logPred);
      const ratio = Math.exp(logPred) / p.mcap_usd!;
      errs.push(Math.abs(ratio - 1));
      oosLogResiduals.push(Math.log(p.mcap_usd!) - logPred);
      if (Math.abs(Math.log(ratio)) <= Math.log(2)) within++;
    }
  }
  errs.sort((x, y) => x - y);
  return {
    validation: {
      folds: 5,
      n: errs.length,
      median_abs_err_pct: round2(errs[Math.floor(errs.length / 2)]! * 100),
      within_2x_pct: round2((within / errs.length) * 100),
    },
    oosLogResiduals,
    oofLogPreds,
  };
}

/** The same five-fold loop for a candidate family with its own fit and prediction rule. */
function validateCustom<F>(
  fitSet: SnapshotProtocol[],
  foldOf: (p: SnapshotProtocol) => number,
  fitFn: (train: SnapshotProtocol[]) => F,
  predFn: (fit: F, p: SnapshotProtocol) => number,
): Validation {
  const errs: number[] = [];
  let within = 0;
  for (let fold = 0; fold < 5; fold++) {
    const fit = fitFn(fitSet.filter((p) => foldOf(p) !== fold));
    for (const p of fitSet) {
      if (foldOf(p) !== fold) continue;
      const ratio = Math.exp(predFn(fit, p)) / p.mcap_usd!;
      errs.push(Math.abs(ratio - 1));
      if (Math.abs(Math.log(ratio)) <= Math.log(2)) within++;
    }
  }
  errs.sort((x, y) => x - y);
  return {
    folds: 5,
    n: errs.length,
    median_abs_err_pct: round2(errs[Math.floor(errs.length / 2)]! * 100),
    within_2x_pct: round2((within / errs.length) * 100),
  };
}

/** Weighted least squares via the normal equations, for the weighted and robust candidates. */
function regressWeighted(xs: number[][], ys: number[], ws: number[]): number[] {
  const k = xs[0]!.length;
  const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const aty = new Array<number>(k).fill(0);
  for (let i = 0; i < xs.length; i++) {
    for (let r = 0; r < k; r++) {
      aty[r]! += ws[i]! * xs[i]![r]! * ys[i]!;
      for (let c = 0; c < k; c++) ata[r]![c]! += ws[i]! * xs[i]![r]! * xs[i]![c]!;
    }
  }
  return solve(ata, aty);
}

/**
 * A candidate fit whose line comes from a supplied estimator (weighted least squares, or a
 * Huber IRLS line) while its category shifts are fitOn's own: the same shrunk mean residuals.
 * The prediction rule is predictLog's, unchanged — only the line differs.
 */
function fitOnLine(
  pts: SnapshotProtocol[],
  spec: FitSpec,
  asOf: string,
  betaOf: (xs: number[][], ys: number[]) => number[],
): RegressionFit {
  const dated = pts
    .map((p) => ageDays(asOf, p.listed_at))
    .filter((d): d is number => d !== null)
    .sort((x, y) => x - y);
  const ctx: FitContext = {
    medianAgeDays: dated.length > 0 ? dated[Math.floor(dated.length / 2)]! : 730,
    asOf,
  };
  const xs = pts.map((p) => features(p, spec, ctx));
  const ys = pts.map((p) => Math.log(p.mcap_usd!));
  const beta = betaOf(xs, ys);
  const residuals = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const pred = xs[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    const key = categoryOf(pts[i]!);
    const arr = residuals.get(key);
    if (arr === undefined) residuals.set(key, [ys[i]! - pred]);
    else arr.push(ys[i]! - pred);
  }
  const offsets = new Map<string, number>();
  for (const [key, arr] of residuals) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    offsets.set(key, mean * (arr.length / (arr.length + SHRINK_K)));
  }
  return { beta, offsets, ctx, spec };
}

/** A Huber line: least squares, then twelve IRLS passes downweighting outlying comps. */
function huberBeta(xs: number[][], ys: number[]): number[] {
  let beta = regress(xs, ys);
  for (let iter = 0; iter < 12; iter++) {
    const resid = ys.map((y, i) => y - xs[i]!.reduce((s, v, j) => s + v * beta[j]!, 0));
    const abs = resid.map((r) => Math.abs(r)).sort((x, y) => x - y);
    const mad = abs[Math.floor(abs.length / 2)]! * 1.4826 || 1;
    const ws = resid.map((r) => {
      const u = Math.abs(r) / mad;
      return u <= 1.345 ? 1 : 1.345 / u;
    });
    beta = regressWeighted(xs, ys, ws);
  }
  return beta;
}

/** A fit with a per-category TVL slope, each shrunk toward the global slope by n / (n + K). */
interface CatSlopeFit {
  fit: RegressionFit;
  slopes: Map<string, number>;
  meanLogTvl: number;
}

function fitCatSlope(pts: SnapshotProtocol[], spec: FitSpec, asOf: string, K: number): CatSlopeFit {
  const fit = fitOn(pts, spec, asOf);
  const meanLogTvl = pts.reduce((s, p) => s + Math.log(Math.max(1, p.tvl_usd)), 0) / pts.length;
  const byCat = new Map<string, { resid: number[]; lt: number[] }>();
  for (const p of pts) {
    const row = features(p, spec, fit.ctx);
    const linePred = row.reduce((s, v, j) => s + v * fit.beta[j]!, 0);
    const key = categoryOf(p);
    let e = byCat.get(key);
    if (e === undefined) {
      e = { resid: [], lt: [] };
      byCat.set(key, e);
    }
    e.resid.push(Math.log(p.mcap_usd!) - linePred);
    e.lt.push(row[1]!);
  }
  const slopes = new Map<string, number>();
  for (const [key, e] of byCat) {
    const n = e.resid.length;
    if (n < 3) continue;
    const meanR = e.resid.reduce((s, v) => s + v, 0) / n;
    const meanLt = e.lt.reduce((s, v) => s + v, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (e.lt[i]! - meanLt) * (e.resid[i]! - meanR);
      den += (e.lt[i]! - meanLt) ** 2;
    }
    slopes.set(key, (den > 1e-9 ? num / den : 0) * (n / (n + K)));
  }
  return { fit, slopes, meanLogTvl };
}

function predictCatSlope(f: CatSlopeFit, p: SnapshotProtocol): number {
  const adj = (f.slopes.get(categoryOf(p)) ?? 0) * (Math.log(Math.max(1, p.tvl_usd)) - f.meanLogTvl);
  return predictLog(f.fit, p) + adj;
}

/**
 * The nearest-neighbour read: the median log multiple of the k training protocols closest in
 * log TVL, same category when at least three are available, read as a value at this TVL.
 */
function knnLogPred(train: SnapshotProtocol[], p: SnapshotProtocol, k: number): number | null {
  const lt = Math.log(Math.max(1, p.tvl_usd));
  const sameCat = train.filter((t) => categoryOf(t) === categoryOf(p));
  const pool = sameCat.length >= 3 ? sameCat : train;
  const near = pool
    .map((t) => ({
      d: Math.abs(Math.log(Math.max(1, t.tvl_usd)) - lt),
      mult: Math.log(t.mcap_usd! / Math.max(1, t.tvl_usd)),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  if (near.length === 0) return null;
  const mults = near.map((n) => n.mult).sort((a, b) => a - b);
  return lt + mults[Math.floor(mults.length / 2)]!;
}

/**
 * A generic twin of fitOn for candidate feature rows the FitSpec flags cannot express
 * (version 4's reshaped terms): the same normal-equations line, the same shrunk category
 * offsets, the same imputation context — only the row builder differs.
 */
type FeatureFn = (p: SnapshotProtocol, ctx: FitContext) => number[];

function fitOnFeatures(pts: SnapshotProtocol[], featFn: FeatureFn, asOf: string): RegressionFit {
  const dated = pts
    .map((p) => ageDays(asOf, p.listed_at))
    .filter((d): d is number => d !== null)
    .sort((x, y) => x - y);
  const ctx: FitContext = {
    medianAgeDays: dated.length > 0 ? dated[Math.floor(dated.length / 2)]! : 730,
    asOf,
  };
  const xs = pts.map((p) => featFn(p, ctx));
  const ys = pts.map((p) => Math.log(p.mcap_usd!));
  const beta = regress(xs, ys);
  const residuals = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const pred = xs[i]!.reduce((s, v, j) => s + v * beta[j]!, 0);
    const key = categoryOf(pts[i]!);
    const arr = residuals.get(key);
    if (arr === undefined) residuals.set(key, [ys[i]! - pred]);
    else arr.push(ys[i]! - pred);
  }
  const offsets = new Map<string, number>();
  for (const [key, arr] of residuals) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    offsets.set(key, mean * (arr.length / (arr.length + SHRINK_K)));
  }
  return { beta, offsets, ctx, spec: PRODUCTION_SPEC };
}

/** predictLog's twin for feature-row fits: the named indices are bounded as one multiplier. */
function predictFeatures(fit: RegressionFit, p: SnapshotProtocol, featFn: FeatureFn, clampIdx: number[]): number {
  const row = featFn(p, fit.ctx);
  let logValue = fit.offsets.get(categoryOf(p)) ?? 0;
  let clamped = 0;
  for (let j = 0; j < row.length; j++) {
    if (clampIdx.includes(j)) clamped += fit.beta[j]! * row[j]!;
    else logValue += fit.beta[j]! * row[j]!;
  }
  if (clampIdx.length > 0) logValue += Math.log(clamp(Math.exp(clamped), GROWTH_MULT_LOW, GROWTH_MULT_HIGH));
  return logValue;
}

/**
 * The multi-feature neighbour space of version 4's lab: distance over standardised log TVL
 * and log age, a category-mismatch penalty and a chain Jaccard term (weights 1.0 and 0.5,
 * stated before the test). The prediction is the distance-weighted mean of the neighbours'
 * log market-cap-to-TVL multiples, read at this protocol's own TVL.
 */
interface KnnSpace {
  sTvl: number;
  sAge: number;
  medianAge: number;
}

function knnSpaceOf(train: SnapshotProtocol[], asOf: string): KnnSpace {
  const sd = (xs: number[]): number => {
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length) || 1;
  };
  const ages = train.map((p) => ageDays(asOf, p.listed_at)).filter((d): d is number => d !== null).sort((x, y) => x - y);
  const medianAge = ages.length > 0 ? ages[Math.floor(ages.length / 2)]! : 730;
  return {
    sTvl: sd(train.map((p) => Math.log(Math.max(1, p.tvl_usd)))),
    sAge: sd(train.map((p) => Math.log(Math.max(1, ageDays(asOf, p.listed_at) ?? medianAge)))),
    medianAge,
  };
}

function knnMultiPred(train: SnapshotProtocol[], sp: KnnSpace, asOf: string, p: SnapshotProtocol, k: number): number {
  const feat = (t: SnapshotProtocol): { lt: number; la: number } => ({
    lt: Math.log(Math.max(1, t.tvl_usd)),
    la: Math.log(Math.max(1, ageDays(asOf, t.listed_at) ?? sp.medianAge)),
  });
  const fp = feat(p);
  const near = train
    .map((t) => {
      const ft = feat(t);
      const dTvl = (ft.lt - fp.lt) / sp.sTvl;
      const dAge = (ft.la - fp.la) / sp.sAge;
      const dCat = categoryOf(t) === categoryOf(p) ? 0 : 1;
      const setT = new Set(t.chains);
      const setP = new Set(p.chains);
      const inter = [...setT].filter((c) => setP.has(c)).length;
      const union = new Set([...setT, ...setP]).size;
      const dChain = union === 0 ? 0 : 1 - inter / union;
      return {
        d: Math.sqrt(dTvl * dTvl + dAge * dAge + dCat + 0.5 * dChain * dChain),
        mult: Math.log(t.mcap_usd! / Math.max(1, t.tvl_usd)),
      };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  let sw = 0;
  let sm = 0;
  for (const n of near) {
    const w = 1 / (0.25 + n.d);
    sw += w;
    sm += w * n.mult;
  }
  return fp.lt + sm / sw;
}

/** A candidate term's blind-test outcome, printed on the dashboard's model panel. */
export interface TermTest {
  name: string;
  kept: boolean;
  median_abs_err_pct: number;
  within_2x_pct: number;
  /** Why a candidate that wins a single number was still not kept, when that needs saying. */
  note?: string;
  /** A calibration row: it moves no price, and its keep test is cross-partition, not the keep rule. */
  calibration?: boolean;
}

/** One quintile of the blind predictions, by predicted value: what the market actually set. */
export interface CalibrationBucket {
  n: number;
  median_pred_usd: number;
  median_actual_usd: number;
  median_ratio: number;
  within_2x_pct: number;
}

/** One farm verdict's record in the backtest: how its blind cases ended at the real caps. */
export interface BacktestBucket {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  n: number;
  /** Share of the bucket whose take at the recorded cap would have covered the plan's cost. */
  covered_pct: number;
  /** Median of recorded cap over blind implied value in the bucket. */
  median_actual_over_blind: number;
}

/** The verdict rule graded on the fit set's blind predictions against the caps actually set. */
export interface VerdictBacktest {
  n: number;
  buckets: BacktestBucket[];
  /** Farming only the FARM bucket: total plan cost against total take at the recorded caps. */
  farm_only: { cost_usd: number; take_usd: number; multiple: number };
  /** Farming all 128 the same way: the contrast the verdicts exist to make. */
  farm_everything: { cost_usd: number; take_usd: number; multiple: number };
}

/** One category's blind error on the fit set: where the comps are thick and where they are thin. */
export interface CategoryError {
  category: string;
  n: number;
  median_abs_err_pct: number;
}

/** The fitted production model and everything the board and dashboard derive from it. */
export interface CompsFit {
  intercept: number;
  slope: number;
  growth_coef: number;
  offsets: Map<string, number>;
  fit_n: number;
  categories_used: number;
  resid_q10: number;
  resid_q90: number;
  /** Share of the first partition's blind caps inside their own category's band. */
  range_coverage_pct: number;
  /** The same blind caps against the single global band: the contrast the bands answer. */
  range_global_coverage_pct: number;
  /** Per-category log-space bands (10th–90th blind residual percentiles, shrunk to global). */
  range_factors: Map<string, { lo: number; hi: number }>;
}

/**
 * Fit the production model on every usable tokenized protocol, validate it on two fold
 * partitions, calibrate the range on the first partition's blind residuals, and blind-test
 * the candidate terms the production spec did and did not keep.
 */
export function fitModel(
  protocols: SnapshotProtocol[],
  asOf: string,
): {
  fit: CompsFit;
  validation: Validation;
  validationB: Validation;
  validationLoo: Validation;
  termsTested: TermTest[];
  calibration: CalibrationBucket[];
  backtest: VerdictBacktest;
  categoryErrors: CategoryError[];
} {
  const fitSet = protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const foldA = (p: SnapshotProtocol): number => slugHash(p.slug) % 5;
  const foldB = (p: SnapshotProtocol): number => (slugHash(p.slug) >>> 8) % 5;

  const full = fitOn(fitSet, PRODUCTION_SPEC, asOf);
  const growthIndex = 2;
  const fit: CompsFit = {
    intercept: full.beta[0]!,
    slope: full.beta[1]!,
    growth_coef: full.beta[growthIndex]!,
    offsets: full.offsets,
    fit_n: fitSet.length,
    categories_used: full.offsets.size,
    resid_q10: 0,
    resid_q90: 0,
    range_coverage_pct: 0,
    range_global_coverage_pct: 0,
    range_factors: new Map(),
  };

  const a = validateSpec(fitSet, PRODUCTION_SPEC, asOf, foldA);
  const b = validateSpec(fitSet, PRODUCTION_SPEC, asOf, foldB);

  // The ranges are calibrated on blind predictions: the first partition's out-of-fold
  // residuals (log of recorded cap over blind prediction). The global band is the 10th–90th
  // percentile pair of all of them; each category's band is its own percentile pair shrunk
  // toward the global by n / (n + SHRINK_K), the offsets' own shrinkage. The headline
  // coverage is the share of those same blind caps inside their own category's band.
  const sorted = [...a.oosLogResiduals].sort((x, y) => x - y);
  const quantile = (f: number): number => sorted[clamp(Math.floor(f * sorted.length), 0, sorted.length - 1)]!;
  fit.resid_q10 = quantile(0.1);
  fit.resid_q90 = quantile(0.9);
  const covered = a.oosLogResiduals.filter((r) => r >= fit.resid_q10 && r <= fit.resid_q90).length;
  fit.range_global_coverage_pct = round2((covered / a.oosLogResiduals.length) * 100);
  const residByCat = new Map<string, number[]>();
  for (const p of fitSet) {
    const r = Math.log(p.mcap_usd!) - a.oofLogPreds.get(p.slug)!;
    const key = categoryOf(p);
    const arr = residByCat.get(key);
    if (arr === undefined) residByCat.set(key, [r]);
    else arr.push(r);
  }
  for (const [key, arr] of residByCat) {
    const s = [...arr].sort((x, y) => x - y);
    const qc = (f: number): number => s[clamp(Math.floor(f * s.length), 0, s.length - 1)]!;
    const w = arr.length / (arr.length + SHRINK_K);
    fit.range_factors.set(key, {
      lo: w * qc(0.1) + (1 - w) * fit.resid_q10,
      hi: w * qc(0.9) + (1 - w) * fit.resid_q90,
    });
  }
  let bandCovered = 0;
  for (const p of fitSet) {
    const band = fit.range_factors.get(categoryOf(p))!;
    const r = Math.log(p.mcap_usd!) - a.oofLogPreds.get(p.slug)!;
    if (r >= band.lo && r <= band.hi) bandCovered++;
  }
  fit.range_coverage_pct = round2((bandCovered / fitSet.length) * 100);

  // The candidate terms and model families, blind-tested on the first partition by the same
  // folds and metric. A candidate replaces the production model only if it beats its median
  // error on BOTH partitions and gives up nothing within 2x on either; at n=128 a win on one
  // partition alone is fold noise, and the table's notes say so where that is what happened.
  // Version 4's families are computed below the first rows; its two calibration rows are
  // tested cross-partition instead — fitted on one partition's blind cases, scored on the
  // other's — because a calibration moves no price, only the bands and the decisions.
  const noGrowth = validateSpec(fitSet, { growth: false, age: false }, asOf, foldA).validation;
  const withAge = validateSpec(fitSet, { growth: true, age: true }, asOf, foldA).validation;
  const wlsSqrt = (pts: SnapshotProtocol[]): RegressionFit =>
    fitOnLine(pts, PRODUCTION_SPEC, asOf, (xs, ys) =>
      regressWeighted(xs, ys, pts.map((p) => Math.sqrt(p.tvl_usd) / 1000)),
    );
  const wlsA = validateCustom(fitSet, foldA, wlsSqrt, predictLog);
  const wlsB = validateCustom(fitSet, foldB, wlsSqrt, predictLog);
  const huberA = validateCustom(
    fitSet,
    foldA,
    (pts) => fitOnLine(pts, PRODUCTION_SPEC, asOf, huberBeta),
    predictLog,
  );
  const catSlopeA = validateCustom(
    fitSet,
    foldA,
    (pts) => fitCatSlope(pts, PRODUCTION_SPEC, asOf, 16),
    predictCatSlope,
  );
  const knnA = validateCustom(
    fitSet,
    foldA,
    (pts) => ({ fit: fitOn(pts, PRODUCTION_SPEC, asOf), train: pts }),
    (f, p) => {
      const base = predictLog(f.fit, p);
      const knn = knnLogPred(f.train, p, 8);
      return knn === null ? base : 0.85 * base + 0.15 * knn;
    },
  );

  // Version 4, lever 1: per-category sub-models. Each category with at least six training
  // members gets its own full production-spec fit; its prediction is blended with the global
  // fit's at weight n / (n + K). The whole shrinkage grid is tested; the table prints its best.
  const subModel = (K: number) => ({
    fit: (pts: SnapshotProtocol[]) => {
      const global = fitOn(pts, PRODUCTION_SPEC, asOf);
      const byCat = new Map<string, SnapshotProtocol[]>();
      for (const p of pts) {
        const key = categoryOf(p);
        const arr = byCat.get(key);
        if (arr === undefined) byCat.set(key, [p]);
        else arr.push(p);
      }
      const cats = new Map<string, { fit: RegressionFit; n: number }>();
      for (const [key, members] of byCat) {
        if (members.length >= 6) cats.set(key, { fit: fitOn(members, PRODUCTION_SPEC, asOf), n: members.length });
      }
      return { global, cats };
    },
    pred: (f: { global: RegressionFit; cats: Map<string, { fit: RegressionFit; n: number }> }, p: SnapshotProtocol): number => {
      const base = predictLog(f.global, p);
      const c = f.cats.get(categoryOf(p));
      if (c === undefined) return base;
      const w = c.n / (c.n + K);
      return w * predictLog(c.fit, p) + (1 - w) * base;
    },
  });
  let subBest: { K: number; A: Validation; B: Validation } | null = null;
  for (const K of [4, 8, 16, 32]) {
    const m = subModel(K);
    const va = validateCustom(fitSet, foldA, m.fit, m.pred);
    const vb = validateCustom(fitSet, foldB, m.fit, m.pred);
    if (subBest === null || va.median_abs_err_pct + vb.median_abs_err_pct < subBest.A.median_abs_err_pct + subBest.B.median_abs_err_pct) {
      subBest = { K, A: va, B: vb };
    }
  }

  // Version 4, lever 2: the multi-feature neighbour model, alone at k=8 and blended at the
  // grid's best weight (0.15 of 0.15 / 0.25 / 0.5, chosen on the same two partitions).
  const knnFit = (pts: SnapshotProtocol[]) => ({ reg: fitOn(pts, PRODUCTION_SPEC, asOf), train: pts, sp: knnSpaceOf(pts, asOf) });
  const knnAloneA = validateCustom(fitSet, foldA, knnFit, (f, p) => knnMultiPred(f.train, f.sp, asOf, p, 8));
  const knnBlendOf = (alpha: number) => (f: ReturnType<typeof knnFit>, p: SnapshotProtocol): number =>
    (1 - alpha) * predictLog(f.reg, p) + alpha * knnMultiPred(f.train, f.sp, asOf, p, 8);
  const knnBlendA = validateCustom(fitSet, foldA, knnFit, knnBlendOf(0.15));
  const knnBlendB = validateCustom(fitSet, foldB, knnFit, knnBlendOf(0.15));

  // Version 4, lever 3: reshaped terms through the generic feature fit — capped age at two
  // caps, piecewise growth at two splits, and a growth-by-category interaction shrunk K=8/16.
  const ltOf = (p: SnapshotProtocol): number => Math.log(Math.max(1, p.tvl_usd));
  const cappedAge = (cap: number): FeatureFn => (p, ctx) => [
    1,
    ltOf(p),
    growthTerm(p.change_7d),
    Math.log(1 + Math.min(ageDays(asOf, p.listed_at) ?? ctx.medianAgeDays, cap)),
  ];
  const capAge3A = validateCustom(fitSet, foldA, (pts) => fitOnFeatures(pts, cappedAge(1095), asOf), (f, p) => predictFeatures(f, p, cappedAge(1095), [2]));
  const capAge2A = validateCustom(fitSet, foldA, (pts) => fitOnFeatures(pts, cappedAge(730), asOf), (f, p) => predictFeatures(f, p, cappedAge(730), [2]));
  const piecewise = (T: number): FeatureFn => (p) => {
    const g = growthTerm(p.change_7d);
    return [1, ltOf(p), g >= 0 ? Math.min(g, T) : g, g >= 0 ? Math.max(0, g - T) : 0];
  };
  const pieceA = validateCustom(fitSet, foldA, (pts) => fitOnFeatures(pts, piecewise(2.4), asOf), (f, p) => predictFeatures(f, p, piecewise(2.4), [2, 3]));
  const pieceB = validateCustom(fitSet, foldB, (pts) => fitOnFeatures(pts, piecewise(2.4), asOf), (f, p) => predictFeatures(f, p, piecewise(2.4), [2, 3]));
  const gxFit = (K: number) => (pts: SnapshotProtocol[]) => {
    const fit = fitOn(pts, PRODUCTION_SPEC, asOf);
    const byCat = new Map<string, { num: number; den: number; n: number }>();
    for (const p of pts) {
      const g = growthTerm(p.change_7d);
      const linePred = fit.beta[0]! + fit.beta[1]! * ltOf(p) + fit.beta[2]! * g;
      const key = categoryOf(p);
      let e = byCat.get(key);
      if (e === undefined) {
        e = { num: 0, den: 0, n: 0 };
        byCat.set(key, e);
      }
      e.num += g * (Math.log(p.mcap_usd!) - linePred);
      e.den += g * g;
      e.n++;
    }
    const inter = new Map<string, number>();
    for (const [key, e] of byCat) {
      if (e.den >= 1e-9 && e.n >= 3) inter.set(key, (e.num / e.den) * (e.n / (e.n + K)));
    }
    return { fit, inter };
  };
  const gxPred = (f: { fit: RegressionFit; inter: Map<string, number> }, p: SnapshotProtocol): number => {
    const base = predictLog(f.fit, p);
    const inter = f.inter.get(categoryOf(p)) ?? 0;
    if (inter === 0) return base;
    const g = growthTerm(p.change_7d);
    const bg = f.fit.beta[2]!;
    return (
      base -
      Math.log(clamp(Math.exp(bg * g), GROWTH_MULT_LOW, GROWTH_MULT_HIGH)) +
      Math.log(clamp(Math.exp((bg + inter) * g), GROWTH_MULT_LOW, GROWTH_MULT_HIGH))
    );
  };
  const gx16A = validateCustom(fitSet, foldA, gxFit(16), gxPred);
  const gx8A = validateCustom(fitSet, foldA, gxFit(8), gxPred);
  const termsTested: TermTest[] = [
    {
      name: 'fitted 7-day growth term (compressed, multiplier bounded)',
      kept: true,
      median_abs_err_pct: a.validation.median_abs_err_pct,
      within_2x_pct: a.validation.within_2x_pct,
    },
    {
      name: 'square-root-TVL weighted least squares',
      kept: false,
      median_abs_err_pct: wlsA.median_abs_err_pct,
      within_2x_pct: wlsA.within_2x_pct,
      note:
        `wins the median on both partitions (${wlsA.median_abs_err_pct}% here, ${wlsB.median_abs_err_pct}% on B, ` +
        `against ${a.validation.median_abs_err_pct}% and ${b.validation.median_abs_err_pct}%), but its within-2x share ` +
        `falls on both (${wlsA.within_2x_pct}% and ${wlsB.within_2x_pct}% against ${a.validation.within_2x_pct}% and ` +
        `${b.validation.within_2x_pct}%): at n=128 that trade is fold noise, not signal`,
    },
    {
      name: 'Huber robust line (downweights outlier comps)',
      kept: false,
      median_abs_err_pct: huberA.median_abs_err_pct,
      within_2x_pct: huberA.within_2x_pct,
    },
    {
      name: 'TVL + category shifts only (the first version\u2019s recipe)',
      kept: false,
      median_abs_err_pct: noGrowth.median_abs_err_pct,
      within_2x_pct: noGrowth.within_2x_pct,
    },
    {
      name: 'nearest-neighbour blend (8 closest by TVL, 15% weight)',
      kept: false,
      median_abs_err_pct: knnA.median_abs_err_pct,
      within_2x_pct: knnA.within_2x_pct,
    },
    {
      name: 'log-age (maturity) term added',
      kept: false,
      median_abs_err_pct: withAge.median_abs_err_pct,
      within_2x_pct: withAge.within_2x_pct,
    },
    {
      name: 'per-category TVL slopes, shrunk to the global slope',
      kept: false,
      median_abs_err_pct: catSlopeA.median_abs_err_pct,
      within_2x_pct: catSlopeA.within_2x_pct,
    },
    {
      name: 'per-category sub-models, shrunk to the global fit',
      kept: false,
      median_abs_err_pct: subBest!.A.median_abs_err_pct,
      within_2x_pct: subBest!.A.within_2x_pct,
      note:
        `the best of the shrinkage grid (K=${subBest!.K} of 4 / 8 / 16 / 32) and it still loses both partitions ` +
        `(${subBest!.A.median_abs_err_pct}% here, ${subBest!.B.median_abs_err_pct}% on B): the shrunk category intercepts ` +
        `already carry each category's level, and a second full fit per category adds variance, not signal`,
    },
    {
      name: 'nearest-neighbour comps alone, multi-feature distance (k=8)',
      kept: false,
      median_abs_err_pct: knnAloneA.median_abs_err_pct,
      within_2x_pct: knnAloneA.within_2x_pct,
      note:
        'neighbours by log TVL, log age, category and chains, distance-weighted; k=5 and k=12 land in the same ' +
        'place — with 128 comps the neighbourhood is too thin to price from on its own',
    },
    {
      name: 'nearest-neighbour blend, multi-feature (15% weight)',
      kept: false,
      median_abs_err_pct: knnBlendA.median_abs_err_pct,
      within_2x_pct: knnBlendA.within_2x_pct,
      note:
        `the best blend of 0.15 / 0.25 / 0.5; its B median also worsens (${knnBlendB.median_abs_err_pct}% against ` +
        `${b.validation.median_abs_err_pct}%) — the neighbours agree with the line where the line is already right`,
    },
    {
      name: 'age term, capped at three years',
      kept: false,
      median_abs_err_pct: capAge3A.median_abs_err_pct,
      within_2x_pct: capAge3A.within_2x_pct,
      note:
        `a two-year cap reads the same way (${capAge2A.median_abs_err_pct}% / ${capAge2A.within_2x_pct}%): saturating ` +
        'the age effect does not save it — the log-age row above is the same story uncapped',
    },
    {
      name: 'piecewise growth (the spike excess priced separately)',
      kept: false,
      median_abs_err_pct: pieceA.median_abs_err_pct,
      within_2x_pct: pieceA.within_2x_pct,
      note:
        `the spike coefficient prices at zero: the blind numbers are production's own here and on B ` +
        `(${pieceB.median_abs_err_pct}%) — the compressed term already carries the fit set\u2019s whole growth signal`,
    },
    {
      name: 'growth x category interaction, shrunk (K=16)',
      kept: false,
      median_abs_err_pct: gx16A.median_abs_err_pct,
      within_2x_pct: gx16A.within_2x_pct,
      note:
        `K=8 reads ${gx8A.median_abs_err_pct}% / ${gx8A.within_2x_pct}%: per-category growth slopes chase the ` +
        'same thin week the global term already prices',
    },
    {
      name: 'per-category range bands, shrunk to the global band',
      kept: true,
      calibration: true,
      median_abs_err_pct: a.validation.median_abs_err_pct,
      within_2x_pct: a.validation.within_2x_pct,
      note:
        'no price moves — the error columns are the production model\u2019s own. Calibrated on one partition and ' +
        'scored on the other, the bands cut the per-category coverage deviation from 11.4pt to 7.0pt (A\u2192B) and ' +
        '8.8pt (B\u2192A) and lift the worst-covered category from 60% to 75% and 73%, at 3\u20135% more mean width: ' +
        'the single band was spending its width in the wrong categories',
    },
    {
      name: 'verdict lines recalibrated (FARM at 4x cost, THIN at 0.75x)',
      kept: true,
      calibration: true,
      median_abs_err_pct: a.validation.median_abs_err_pct,
      within_2x_pct: a.validation.within_2x_pct,
      note:
        'no price moves. Each partition\u2019s blind backtest independently chooses these lines, and so does the ' +
        'pooled backtest of all 256 blind cases: the FARM bucket then covered cost in 94% of its 18 pooled cases ' +
        'at x25.54 per dollar of plan cost, against 85% of 39 at x15.13 for the twice-cost lines they replace',
    },
  ];

  // Leave-one-out: every fit-set protocol predicted by a fit that saw the other 127. A third
  // validation, harsher in a different way than either fold partition, reported alongside.
  const looErrs: number[] = [];
  let looWithin = 0;
  for (const p of fitSet) {
    const looFit = fitOn(
      fitSet.filter((t) => t.slug !== p.slug),
      PRODUCTION_SPEC,
      asOf,
    );
    const ratio = Math.exp(predictLog(looFit, p)) / p.mcap_usd!;
    looErrs.push(Math.abs(ratio - 1));
    if (Math.abs(Math.log(ratio)) <= Math.log(2)) looWithin++;
  }
  looErrs.sort((x, y) => x - y);
  const validationLoo: Validation = {
    folds: fitSet.length,
    n: looErrs.length,
    median_abs_err_pct: round2(looErrs[Math.floor(looErrs.length / 2)]! * 100),
    within_2x_pct: round2((looWithin / looErrs.length) * 100),
  };

  const medianOf = (xs: number[]): number => {
    const s = [...xs].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)]!;
  };

  // Calibration: the first partition's blind predictions in quintiles of predicted value,
  // each against the caps the market actually set. A calibrated model's median ratio stays
  // near 1 across the table; this one's compresses toward the middle, and the panel says so.
  const oofRows = fitSet
    .map((p) => ({ p, pred: Math.exp(a.oofLogPreds.get(p.slug)!), actual: p.mcap_usd! }))
    .sort((x, y) => x.pred - y.pred || (x.p.slug < y.p.slug ? -1 : 1));
  const calibration: CalibrationBucket[] = [];
  const per = Math.floor(oofRows.length / 5);
  for (let q = 0; q < 5; q++) {
    const bucket = oofRows.slice(q * per, q === 4 ? oofRows.length : (q + 1) * per);
    calibration.push({
      n: bucket.length,
      median_pred_usd: Math.round(medianOf(bucket.map((r) => r.pred))),
      median_actual_usd: Math.round(medianOf(bucket.map((r) => r.actual))),
      median_ratio: round2(medianOf(bucket.map((r) => r.actual / r.pred))),
      within_2x_pct: round2(
        (bucket.filter((r) => Math.abs(Math.log(r.actual / r.pred)) <= Math.log(2)).length / bucket.length) * 100,
      ),
    });
  }

  // The verdicts, backtested: each fit-set protocol takes the verdict the rule gives at its
  // BLIND value (the value a fit that never saw it produced), and the verdict is graded
  // against the cap the market actually set — the take at that cap against the plan's cost.
  // The fit set is by construction protocols whose tokens exist, so this grades the pricing
  // and the verdict arithmetic, never the chance that a token is issued at all.
  const btAcc = {
    FARM: { n: 0, covered: 0, ratios: [] as number[], cost: 0, take: 0 },
    THIN: { n: 0, covered: 0, ratios: [] as number[], cost: 0, take: 0 },
    SKIP: { n: 0, covered: 0, ratios: [] as number[], cost: 0, take: 0 },
  };
  for (const p of fitSet) {
    const impliedOof = Math.max(1, Math.round(Math.exp(a.oofLogPreds.get(p.slug)!)));
    const plan = farmPlan(p, impliedOof);
    const acc = btAcc[plan.verdict];
    const takeAtActual = p.mcap_usd! * (AIRDROP_SHARE / AIRDROP_WALLETS);
    acc.n++;
    if (takeAtActual >= plan.total_cost_usd) acc.covered++;
    acc.ratios.push(p.mcap_usd! / impliedOof);
    acc.cost += plan.total_cost_usd;
    acc.take += takeAtActual;
  }
  const btBuckets: BacktestBucket[] = (['FARM', 'THIN', 'SKIP'] as const).map((v) => ({
    verdict: v,
    n: btAcc[v].n,
    covered_pct: round2(btAcc[v].n > 0 ? (btAcc[v].covered / btAcc[v].n) * 100 : 0),
    median_actual_over_blind: round2(medianOf(btAcc[v].ratios)),
  }));
  const allCost = btAcc.FARM.cost + btAcc.THIN.cost + btAcc.SKIP.cost;
  const allTake = btAcc.FARM.take + btAcc.THIN.take + btAcc.SKIP.take;
  const backtest: VerdictBacktest = {
    n: fitSet.length,
    buckets: btBuckets,
    farm_only: {
      cost_usd: btAcc.FARM.cost,
      take_usd: Math.round(btAcc.FARM.take),
      multiple: round2(btAcc.FARM.cost > 0 ? btAcc.FARM.take / btAcc.FARM.cost : 0),
    },
    farm_everything: {
      cost_usd: allCost,
      take_usd: Math.round(allTake),
      multiple: round2(allCost > 0 ? allTake / allCost : 0),
    },
  };

  // Per-category blind error on the fit set: where the comps support a tight price and
  // where they do not. Categories under four members are left out as too thin to read.
  const catErrs = new Map<string, number[]>();
  for (const p of fitSet) {
    const ratio = Math.exp(a.oofLogPreds.get(p.slug)!) / p.mcap_usd!;
    const key = categoryOf(p);
    const arr = catErrs.get(key);
    if (arr === undefined) catErrs.set(key, [Math.abs(ratio - 1) * 100]);
    else arr.push(Math.abs(ratio - 1) * 100);
  }
  const categoryErrors: CategoryError[] = [...catErrs.entries()]
    .filter(([, errs]) => errs.length >= 4)
    .map(([category, errs]) => ({ category, n: errs.length, median_abs_err_pct: round2(medianOf(errs)) }))
    .sort((x, y) => y.n - x.n || (x.category < y.category ? -1 : 1));

  return { fit, validation: a.validation, validationB: b.validation, validationLoo, termsTested, calibration, backtest, categoryErrors };
}

// ---------------------------------------------------------------- scoring one protocol

/** One protocol priced: the base, the growth multiplier, the implied value and its range. */
export interface Priced {
  age_days: number | null;
  base_usd: number;
  base_multiple: number;
  growth_multiplier: number;
  implied_value_usd: number;
  low_usd: number;
  high_usd: number;
}

/** Price one pre-token protocol under the fitted production model. */
export function price(p: SnapshotProtocol, asOf: string, fit: CompsFit): Priced {
  const age = ageDays(asOf, p.listed_at);
  const shift = fit.offsets.get(categoryOf(p)) ?? 0;
  const base = Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, p.tvl_usd)) + shift);
  const growthMult = clamp(Math.exp(fit.growth_coef * growthTerm(p.change_7d)), GROWTH_MULT_LOW, GROWTH_MULT_HIGH);
  const implied = Math.max(1, Math.round(base * growthMult));
  const band = fit.range_factors.get(categoryOf(p)) ?? { lo: fit.resid_q10, hi: fit.resid_q90 };
  const low = Math.max(1, Math.min(implied, Math.round(implied * Math.exp(band.lo))));
  const high = Math.max(implied, Math.round(implied * Math.exp(band.hi)));
  return {
    age_days: age,
    base_usd: Math.round(base),
    base_multiple: round4(base / Math.max(1, p.tvl_usd)),
    growth_multiplier: round4(growthMult),
    implied_value_usd: implied,
    low_usd: low,
    high_usd: high,
  };
}

// ---------------------------------------------------------------- farm plans

/**
 * A rough per-transaction gas cost in dollars for the chains the snapshot names, at ordinary
 * 2026 fee levels. Cost data for planning, never a value input: Ethereum is the expensive
 * rail, the L2s and alt-L1s are cheap, and anything unlisted falls back by family.
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
  /** The implied value at which the expected take would exactly cover the plan's cost. */
  breakeven_usd: number;
  /** The implied value at which the plan's verdict would turn FARM (take at FARM_MULTIPLE x cost). */
  farm_line_usd: number;
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
  const verdict: FarmPlan['verdict'] = expected >= FARM_MULTIPLE * totalCost ? 'FARM' : expected >= THIN_MULTIPLE * totalCost ? 'THIN' : 'SKIP';
  const breakeven = Math.ceil((totalCost * AIRDROP_WALLETS) / AIRDROP_SHARE);
  const { core, second } = actionsFor(p, chain, secondChain, deposit);
  const name = p.name;
  const economics = { deposit_usd: deposit, weeks, total_cost_usd: totalCost, expected_usd: expected, breakeven_usd: breakeven, farm_line_usd: FARM_MULTIPLE * breakeven, verdict };
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
      ...economics,
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
  return { steps, ...economics };
}

// ---------------------------------------------------------------- the board

/** A protocol's category cohort as the snapshot records it: the peers' own token record. */
export interface PeerRecord {
  /** Protocols in the same category across the whole snapshot. */
  cohort: number;
  /** Of those, how many already record a token. */
  tokenized: number;
  /** The cohort's median market-cap-to-TVL multiple among members that record both, or null. */
  median_multiple: number | null;
}

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
  };
  peers: PeerRecord;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm: {
    deposit_usd: number;
    weeks: number;
    total_cost_usd: number;
    expected_usd: number;
    breakeven_usd: number;
    farm_line_usd: number;
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
  const growthPct = p.change_7d === null ? 'no 7-day change reported, so no growth adjustment' : `${p.change_7d >= 0 ? '+' : ''}${round2(p.change_7d)}% TVL in 7 days`;
  const growthRead =
    priced.growth_multiplier < 1
      ? 'the fitted growth term discounts it: among the tokenized comps a week like this prices lower per TVL dollar'
      : priced.growth_multiplier > 1
        ? 'the fitted growth term lifts it: among the tokenized comps, caps held up better than TVL in a week like this'
        : 'the fitted growth term leaves it unchanged';
  const age = priced.age_days === null ? 'listing date unreported' : `${(priced.age_days / 365.25).toFixed(1)} years with no token recorded (age is shown, not priced: the blind test does not keep it as a value term)`;
  return (
    `Base ${shortUsd(priced.base_usd)}: ${shortUsd(p.tvl_usd)} of TVL priced at the ${cat} multiple (${priced.base_multiple}x of TVL) from the tokenized fit; ` +
    `growth x${priced.growth_multiplier} (${growthPct}; ${growthRead}); ${age}. ` +
    `Range ${shortUsd(priced.low_usd)}-${shortUsd(priced.high_usd)} is its category's blind-residual band, not a target.`
  );
}

/** A protocol that already records a token: shown at the market's own value, never ranked. */
export interface TradedRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders: the board, the traded set, the model and its validation. */
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
    growth_coef: number;
    growth_mult_low: number;
    growth_mult_high: number;
    categories_used: number;
    shrink_k: number;
    range_low_factor: number;
    range_high_factor: number;
    range_coverage_pct: number;
    /** What the single global band covered on the same blind cases: the bands' contrast. */
    range_global_coverage_pct: number;
    /** Each category's own band as value factors, the bands the rows actually carry. */
    range_factors_by_category: Record<string, { low: number; high: number }>;
    /** The verdict lines as multiples of plan cost, recalibrated on the blind backtest. */
    farm_multiple: number;
    thin_multiple: number;
    airdrop_share: number;
    airdrop_wallets: number;
    /** The fitted coefficients the page needs to re-price a row under a reader's scenario. */
    coeffs: {
      intercept: number;
      slope: number;
      growth_coef: number;
      offsets: Record<string, number>;
    };
    terms_tested: TermTest[];
  };
  validation: Validation;
  validation_b: Validation;
  validation_loo: Validation;
  calibration: CalibrationBucket[];
  backtest: VerdictBacktest;
  category_errors: CategoryError[];
  rows: BoardRow[];
  traded: TradedRow[];
}

/** The whole radar from one snapshot: fit, price every pre-token protocol, rank, plan. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { fit, validation, validationB, validationLoo, termsTested, calibration, backtest, categoryErrors } =
    fitModel(snapshot.protocols, snapshot.as_of);
  const watch = new Set(snapshot.watchlist);
  const pre = snapshot.protocols.filter(recordsNoToken);

  // The peers' record, per category: how much of the cohort already records a token, and at
  // what multiple of TVL the tokenized members price. Context for the detail view; never an
  // input to this protocol's own price.
  const cohorts = new Map<string, { total: number; tokenized: number; multiples: number[] }>();
  for (const p of snapshot.protocols) {
    const key = categoryOf(p);
    let cohort = cohorts.get(key);
    if (cohort === undefined) {
      cohort = { total: 0, tokenized: 0, multiples: [] };
      cohorts.set(key, cohort);
    }
    cohort.total++;
    if (!recordsNoToken(p)) {
      cohort.tokenized++;
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) cohort.multiples.push(p.mcap_usd / p.tvl_usd);
    }
  }
  const peerRecordOf = (p: SnapshotProtocol): PeerRecord => {
    const cohort = cohorts.get(categoryOf(p))!;
    const multiples = [...cohort.multiples].sort((x, y) => x - y);
    return {
      cohort: cohort.total,
      tokenized: cohort.tokenized,
      median_multiple: multiples.length > 0 ? round4(multiples[Math.floor(multiples.length / 2)]!) : null,
    };
  };

  const scored = pre.map((p) => {
    const priced = price(p, snapshot.as_of, fit);
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
    },
    peers: peerRecordOf(s.p),
    verdict: s.plan.verdict,
    farm: {
      deposit_usd: s.plan.deposit_usd,
      weeks: s.plan.weeks,
      total_cost_usd: s.plan.total_cost_usd,
      expected_usd: s.plan.expected_usd,
      breakeven_usd: s.plan.breakeven_usd,
      farm_line_usd: s.plan.farm_line_usd,
    },
    why: whyLine(s.p, s.priced),
    farm_steps: s.plan.steps,
  }));

  const traded: TradedRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p))
    .sort(
      (a, b) =>
        (b.mcap_usd ?? -1) - (a.mcap_usd ?? -1) ||
        b.tvl_usd - a.tvl_usd ||
        (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
    )
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));

  const offsets: Record<string, number> = {};
  for (const key of [...fit.offsets.keys()].sort()) offsets[key] = round4(fit.offsets.get(key)!);

  const rangeFactors: Record<string, { low: number; high: number }> = {};
  for (const key of [...fit.range_factors.keys()].sort()) {
    const band = fit.range_factors.get(key)!;
    rangeFactors[key] = { low: round4(Math.exp(band.lo)), high: round4(Math.exp(band.hi)) };
  }

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
      growth_coef: round4(fit.growth_coef),
      growth_mult_low: GROWTH_MULT_LOW,
      growth_mult_high: GROWTH_MULT_HIGH,
      categories_used: fit.categories_used,
      shrink_k: SHRINK_K,
      range_low_factor: round4(Math.exp(fit.resid_q10)),
      range_high_factor: round4(Math.exp(fit.resid_q90)),
      range_coverage_pct: fit.range_coverage_pct,
      range_global_coverage_pct: fit.range_global_coverage_pct,
      range_factors_by_category: rangeFactors,
      farm_multiple: FARM_MULTIPLE,
      thin_multiple: THIN_MULTIPLE,
      airdrop_share: AIRDROP_SHARE,
      airdrop_wallets: AIRDROP_WALLETS,
      coeffs: { intercept: fit.intercept, slope: fit.slope, growth_coef: fit.growth_coef, offsets },
      terms_tested: termsTested,
    },
    validation,
    validation_b: validationB,
    validation_loo: validationLoo,
    calibration,
    backtest,
    category_errors: categoryErrors,
    rows: board,
    traded,
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
