// Launch Radar's entry point (Node 22, standard library only).
//
// Reads the sealed snapshot (at grading /input/snapshot.json; --input <file|dir> overrides), fits
// the comparables model in lib/model.ts on the snapshot's tokenized protocols — every value term
// fitted, each candidate term blind-tested before it is kept — prices and ranks every protocol
// that records no token, and writes the hand-in to the output directory:
//
//   board.json    the ranked board the gate reads
//   data.js       the dashboard's whole dataset, written beside the page it renders
//   dashboard/    this repository's dashboard, copied
//   screenshots/  this repository's screenshots, copied
//   dossier.json  buildDossier's summary of the dashboard and screenshots, written last because
//                 the scorer rebuilds it from the same output and compares bytes
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The caps the dossier is written under: the scorer's own, from the kit's gate reference. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const DOSSIER_MAX_BYTES = 1_572_864;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value of `--name <value>` or `--name=<value>` in the arguments, else the fallback. */
function argValue(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < args.length) return args[at + 1]!;
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`launch radar: ${message}\n`);
  process.exit(1);
}

const inputArg = argValue('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outDir = argValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into the output, skipping dot names; returns what was copied. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(outDir, 'dashboard'));
if (!dashFiles.includes('index.html')) fail('dashboard/ holds no index.html to copy');

const shots = copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ holds ${shots.length} images: hand in 3 or 4 (the board, a detail view, a filtered view)`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

const dossier = buildDossier(outDir, {
  text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
  screenshots: SCREENSHOT_CAPS,
  dashboard: DASHBOARD_CAPS,
});
if (dossier.length > DOSSIER_MAX_BYTES) fail(`dossier.json would be ${dossier.length} bytes, over the 1.5 MiB the gate allows`);
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Verify what was actually written, not what was meant to be: the board is re-read from the output
// directory and held to the same gate check, so a truncated or mangled write fails this run rather
// than the grader's.
const written = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8')) as { rows?: unknown };
if (!Array.isArray(written.rows)) fail('the board written to the output directory has no rows array');
const writtenIssue = boardIssue(written.rows as typeof board, snapshot);
if (writtenIssue !== null) fail(`the board on disk fails the gate check: ${writtenIssue}`);

const verdicts = { FARM: 0, THIN: 0, SKIP: 0 };
for (const row of board) verdicts[row.verdict]++;
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols in the snapshot, ${board.length} pre-token ranked, ` +
    `${snapshot.watchlist.length} watchlist covered, fit on ${radar.counts.fit_n} tokenized protocols\n` +
    `launch radar: blind validation, partition A: median error ${radar.validation.median_abs_err_pct}%, ` +
    `${radar.validation.within_2x_pct}% within 2x; partition B: median error ${radar.validation_b.median_abs_err_pct}%, ` +
    `${radar.validation_b.within_2x_pct}% within 2x; ranges covered ${radar.model.range_coverage_pct}% of blind caps\n` +
    `launch radar: verdicts FARM ${verdicts.FARM} / THIN ${verdicts.THIN} / SKIP ${verdicts.SKIP}\n` +
    `launch radar: wrote board.json, data.js, dashboard/ (${dashFiles.length} files), screenshots/ (${shots.length} images) and dossier.json (${dossier.length} bytes) to ${outDir}\n`,
);
