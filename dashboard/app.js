// Launch Radar's dashboard. Reads window.RADAR (data.js, written beside this page by main.ts)
// and renders the ranked board, its filters, a per-protocol detail view with a live
// what-would-change-this-rank scenario panel, and the full already-trading set.
// No network and no framework: every byte on the page comes from that one data file.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var ROWS = DATA.rows;
  var TRADED = DATA.traded || [];
  var bySlug = {};
  ROWS.forEach(function (r) { bySlug[r.slug] = r; });

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + full.format(n);
  }
  function fmtFull(n) { return n === null || n === undefined ? 'n/a' : '$' + full.format(n); }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365.25).toFixed(1) + 'y';
    if (days >= 30) return Math.round(days / 30.4) + 'mo';
    return Math.round(days) + 'd';
  }
  function fmtMult(n) { return 'x' + Number(n).toFixed(2); }
  function badge(v) { return '<span class="badge ' + v + '">' + v + '</span>'; }
  function chainText(chains) {
    if (!chains || chains.length === 0) return '—';
    if (chains.length <= 2) return esc(chains.join(', '));
    return esc(chains.slice(0, 2).join(', ')) + ' +' + (chains.length - 2);
  }

  // ---------------------------------------------------------- header, KPIs, integrity strip
  $('k-asof').textContent = DATA.as_of;
  $('k-model').textContent = DATA.model_version;
  var M = DATA.model;
  var V = DATA.validation;
  var VB = DATA.validation_b;
  var kpis = [
    [String(DATA.counts.pre_token), 'pre-token tracked'],
    [String(DATA.counts.watchlist), 'on the watchlist'],
    [fmtUsd(DATA.totals.implied_usd), 'total implied value'],
    [V.median_abs_err_pct + '%', 'model error, tested blind'],
  ];
  $('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
  }).join('');

  var strip = [
    'Watchlist covered <b>' + DATA.counts.watchlist + ' / ' + DATA.counts.watchlist + '</b>',
    'Snapshot sealed <b>' + DATA.as_of + '</b>',
    'Fit on <b>' + DATA.counts.fit_n + '</b> tokenized protocols',
    'Blind error <b>' + V.median_abs_err_pct + '%</b> / <b>' + VB.median_abs_err_pct + '%</b> on two fold partitions',
    'Ranges covered <b>' + M.range_coverage_pct + '%</b> of blind caps',
    '<b>' + DATA.counts.pre_token + '</b> ranked + <b>' + DATA.counts.tokenized + '</b> trading = <b>' + DATA.counts.protocols + '</b> accounted for',
    '“Records no token” is the source’s record, not proof none exists',
  ];
  $('integrity').innerHTML = strip.join(' <span class="sep">·</span> ');

  // ---------------------------------------------------------- model panel
  $('model-text').innerHTML =
    '<p>The radar prices a protocol the way the market prices its already-trading peers. On the ' +
    '<b>' + DATA.counts.fit_n + ' tokenized protocols</b> that record both a market cap and a TVL, it regresses ' +
    '<b>log(market cap) on log(TVL)</b> (slope ' + M.slope + ') <b>plus a fitted 7-day growth term</b>, then shifts ' +
    'each category by its mean residual, shrunk toward zero by n/(n+' + M.shrink_k + ') so thin categories barely ' +
    'move. A pre-token protocol\u2019s <b>base value</b> is that fit read at its own TVL and category; its ' +
    '<b>implied value</b> is the base times the growth multiplier. No protocol name is an input anywhere.</p>' +
    '<p>The growth term is fitted, not asserted — and the fit reads the week <b>backwards from momentum folklore</b>: ' +
    'its coefficient is ' + M.growth_coef + ', so a protocol whose TVL just spiked is priced <b>lower</b> per TVL dollar ' +
    '(among the comps, caps have not followed such spikes), and one whose TVL slid is priced higher per dollar (its cap ' +
    'held up better than its TVL). The term is compressed onto a signed-log scale and its multiplier bounded to ' +
    'x' + M.growth_mult_low + '\u2013x' + M.growth_mult_high + ', because the evidence is thin: the snapshot caught a down ' +
    'week and few strong growers sit in the fit set. <b>Age is not priced.</b> A maturity bonus was tested in several ' +
    'forms and the blind test keeps none of them (table below), so a protocol\u2019s years with no token recorded are ' +
    'shown on its row but do not raise its price.</p>' +
    '<p>Each row also carries a <b>range</b> calibrated on blind predictions — the 10th\u201390th percentile of the ' +
    'out-of-fold residuals (x' + M.range_low_factor + ' to x' + M.range_high_factor + '), which covered ' +
    M.range_coverage_pct + '% of the blind predictions\u2019 recorded caps. TVL prices loosely; the board says so. ' +
    '<b>Verdicts</b> net a plan\u2019s cost against an expected take that assumes a launch sets aside ' +
    (M.airdrop_share * 100) + '% of value for the community, shared by ' + full.format(M.airdrop_wallets) +
    ' qualifying wallets: FARM when the take is at least twice the cost, THIN when it covers the cost, SKIP below. ' +
    'Every row states the implied value at which its own plan would break even and turn FARM.</p>';
  $('validation').innerHTML = [
    [String(V.n), 'protocols predicted blind'],
    [V.folds + ' + ' + VB.folds + ' folds', 'two slug-hash partitions'],
    [V.median_abs_err_pct + '%', 'median error, partition A'],
    [VB.median_abs_err_pct + '%', 'median error, partition B'],
    [V.within_2x_pct + '%', 'within 2x, partition A'],
    [M.range_coverage_pct + '%', 'of blind caps inside their range'],
  ].map(function (s) {
    return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
  }).join('');
  $('terms-body').innerHTML = M.terms_tested.map(function (t) {
    return '<tr><td>' + esc(t.name) + '</td>' +
      '<td class="' + (t.kept ? 'kept' : 'notkept') + '">' + (t.kept ? 'KEPT — the production model' : 'not kept') + '</td>' +
      '<td class="num">' + t.median_abs_err_pct + '%</td>' +
      '<td class="num">' + t.within_2x_pct + '%</td></tr>';
  }).join('');
  $('terms-note').textContent = 'Same folds, same metric as the headline validation, computed at build time by the model itself. A term is kept only when the blind test keeps it; the first version of this radar asserted a momentum bonus and a maturity bonus instead, and the fit contradicts the first and does not support the second.';

  // ---------------------------------------------------------- controls
  var state = { q: '', cat: 'all', chain: 'all', verdict: 'all', watch: false, sort: 'rank' };
  var catCounts = {};
  var chainCounts = {};
  ROWS.forEach(function (r) {
    var c = r.category || 'Uncategorised';
    catCounts[c] = (catCounts[c] || 0) + 1;
    r.chains.forEach(function (ch) { chainCounts[ch] = (chainCounts[ch] || 0) + 1; });
  });
  function fillSelect(sel, counts, allLabel) {
    var names = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || (a < b ? -1 : 1);
    });
    sel.innerHTML = '<option value="all">' + allLabel + '</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + ' (' + counts[n] + ')</option>';
    }).join('');
  }
  fillSelect($('f-cat'), catCounts, 'All categories');
  fillSelect($('f-chain'), chainCounts, 'All chains');

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = ROWS.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat !== 'all' && (r.category || 'Uncategorised') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      return true;
    });
    var key = {
      rank: function (a, b) { return a.rank - b.rank; },
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days === null ? -1 : b.age_days) - (a.age_days === null ? -1 : a.age_days); },
      net: function (a, b) { return (b.farm.expected_usd - b.farm.total_cost_usd) - (a.farm.expected_usd - a.farm.total_cost_usd); },
      name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
    }[state.sort];
    return out.sort(key);
  }

  // Range bars share one log scale across the whole board, so widths compare row to row.
  var LOG_MIN = Math.log(Math.min.apply(null, ROWS.map(function (r) { return r.implied_low_usd; })));
  var LOG_MAX = Math.log(Math.max.apply(null, ROWS.map(function (r) { return r.implied_high_usd; })));
  function rangeBar(r) {
    var span = LOG_MAX - LOG_MIN || 1;
    var left = ((Math.log(r.implied_low_usd) - LOG_MIN) / span) * 100;
    var width = Math.max(1.5, ((Math.log(r.implied_high_usd) - Math.log(r.implied_low_usd)) / span) * 100);
    var point = ((Math.log(r.implied_value_usd) - LOG_MIN) / span) * 100;
    return '<span class="rangebar" aria-hidden="true"><span class="fill" style="left:' + left.toFixed(1) +
      '%;width:' + width.toFixed(1) + '%"></span><span class="point" style="left:' + point.toFixed(1) + '%"></span></span>';
  }

  function renderBoard() {
    var rows = filtered();
    $('board-count').textContent = 'Showing ' + rows.length + ' of ' + ROWS.length + ' pre-token protocols';
    $('board-body').innerHTML = rows.map(function (r) {
      var chg = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr class="row" data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="pname">' + esc(r.name) + '</span>' +
        (r.watchlist ? ' <span class="watch" title="On the snapshot watchlist">\u2605 watchlist</span>' : '') +
        '<span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="chains">' + chainText(r.chains) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + chg + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + fmtUsd(r.implied_value_usd) +
        '<span class="range">' + fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) + '</span>' +
        rangeBar(r) + '</td>' +
        '<td>' + badge(r.verdict) + '</td></tr>';
    }).join('');
    $('board-note').textContent = rows.length === 0
      ? 'No protocol matches those filters.'
      : 'Click any row for the protocol\u2019s record, the model\u2019s arithmetic, its peers\u2019 record, a what-would-change-this-rank scenario panel and its full farm plan. Ranks are the model\u2019s claim; the filters only change what you are looking at.';
  }

  // ---------------------------------------------------------- detail view
  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }

  // The scenario maths: the page re-prices the open protocol from the fitted coefficients the
  // build published, holding the rest of the board and the protocol's own week still.
  var COEF = M.coeffs;
  function scenarioImplied(r, tvl) {
    var offset = COEF.offsets[r.category === null ? '(uncategorised)' : r.category] || 0;
    var base = Math.exp(COEF.intercept + COEF.slope * Math.log(Math.max(1, tvl)) + offset);
    return base * r.model.growth_multiplier;
  }
  function scenarioRank(r, implied) {
    var rank = 1;
    ROWS.forEach(function (o) { if (o.slug !== r.slug && o.implied_value_usd > implied) rank++; });
    return rank;
  }
  function verdictFor(r, implied) {
    var expected = implied * (M.airdrop_share / M.airdrop_wallets);
    if (expected >= 2 * r.farm.total_cost_usd) return 'FARM';
    if (expected >= r.farm.total_cost_usd) return 'THIN';
    return 'SKIP';
  }
  function tvlForValue(r, value) {
    var offset = COEF.offsets[r.category === null ? '(uncategorised)' : r.category] || 0;
    var logBase = Math.log(Math.max(1, value / r.model.growth_multiplier));
    return Math.exp((logBase - COEF.intercept - offset) / COEF.slope);
  }

  var detailRow = null;
  function renderScenario() {
    var r = detailRow;
    if (!r) return;
    var t = Number($('sens-slider').value) / 200; // 0..1 across x0.2 .. x10 of TVL
    var mult = Math.exp(Math.log(0.2) + (Math.log(10) - Math.log(0.2)) * t);
    var tvl = r.tvl_usd * mult;
    var implied = scenarioImplied(r, tvl);
    $('sens-now').textContent = 'TVL x' + mult.toFixed(2) + ' = ' + fmtUsd(tvl);
    $('sens-implied').textContent = fmtUsd(implied);
    $('sens-rank').textContent = '#' + scenarioRank(r, implied);
    $('sens-verdict').innerHTML = badge(verdictFor(r, implied));
  }
  function thresholdRows(r) {
    var targets = [
      ['Reach rank #1', ROWS[0].implied_value_usd],
      ['Reach rank #10', ROWS[Math.min(9, ROWS.length - 1)].implied_value_usd],
      ['Turn FARM (take \u2265 2x cost)', r.farm.farm_line_usd],
      ['Break even (take covers cost)', r.farm.breakeven_usd],
    ];
    return targets.map(function (t) {
      var need = tvlForValue(r, t[1]);
      if (need <= r.tvl_usd) {
        return '<tr><td>' + esc(t[0]) + '</td><td class="num">' + fmtUsd(t[1]) + '</td>' +
          '<td class="num" colspan="3">already there at today\u2019s TVL</td></tr>';
      }
      var ratio = need / r.tvl_usd;
      var weekly = (Math.pow(ratio, 1 / 12) - 1) * 100;
      return '<tr><td>' + esc(t[0]) + '</td><td class="num">' + fmtUsd(t[1]) + '</td>' +
        '<td class="num">' + fmtUsd(need) + '</td><td class="num">x' + ratio.toFixed(1) + '</td>' +
        '<td class="num">' + (weekly > 200 ? '>200%' : '+' + weekly.toFixed(1) + '%') + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    detailRow = r;
    $('view-board').hidden = true;
    $('view-detail').hidden = false;
    var f = r.farm;
    var peerShare = r.peers.cohort > 0 ? Math.round((r.peers.tokenized / r.peers.cohort) * 100) : 0;
    var distance =
      r.implied_value_usd >= f.farm_line_usd
        ? 'clears its FARM line by x' + (r.implied_value_usd / f.farm_line_usd).toFixed(1)
        : r.implied_value_usd >= f.breakeven_usd
          ? 'breaks even; x' + (f.farm_line_usd / r.implied_value_usd).toFixed(1) + ' more value would turn it FARM'
          : 'needs x' + (f.breakeven_usd / r.implied_value_usd).toFixed(1) + ' the value to break even, x' +
            (f.farm_line_usd / r.implied_value_usd).toFixed(1) + ' to turn FARM';
    $('detail').innerHTML =
      '<section class="panel">' +
      '<div class="detail-head"><div>' +
      '<h2>' + esc(r.name) + ' ' + (r.watchlist ? '<span class="watch">\u2605 on the watchlist</span>' : '') + '</h2>' +
      '<p class="muted">' + esc(r.slug) + ' \u00b7 rank #' + r.rank + ' of ' + ROWS.length + ' pre-token protocols</p>' +
      '</div>' + badge(r.verdict) + '</div>' +
      '<div class="why"><b>Why this rank:</b> ' + esc(r.why) + '</div>' +
      '<div class="detail-grid">' +
      '<div><h3>The record</h3>' +
      kv('Category', r.category || 'Uncategorised') +
      kv('Chains', r.chains.length ? r.chains.join(', ') : 'none recorded') +
      kv('TVL', fmtFull(r.tvl_usd)) +
      kv('TVL change, 7 days', fmtPct(r.change_7d)) +
      kv('Tracked since', r.listed_at || 'not reported') +
      kv('Age with no token recorded', r.age_days === null ? 'unknown' : fmtAge(r.age_days) + ' (' + r.age_days + ' days)') +
      kv('Token', 'none recorded in the snapshot') +
      '</div>' +
      '<div><h3>The model\u2019s arithmetic</h3>' +
      kv('Category multiple', r.model.base_multiple + 'x of TVL') +
      kv('Base value from the fit', fmtFull(r.model.base_usd)) +
      kv('Growth adjustment (fitted)', fmtMult(r.model.growth_multiplier)) +
      kv('Implied value', fmtFull(r.implied_value_usd)) +
      kv('Range (blind p10\u2013p90)', fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd)) +
      '</div>' +
      '<div><h3>The peers\u2019 record</h3>' +
      kv('Protocols in this category', String(r.peers.cohort)) +
      kv('Of those, already record a token', r.peers.tokenized + ' (' + peerShare + '%)') +
      kv('Peers\u2019 median multiple', r.peers.median_multiple === null ? 'not enough data' : r.peers.median_multiple + 'x of TVL') +
      kv('This protocol\u2019s base multiple', r.model.base_multiple + 'x of TVL') +
      '<p class="muted small" style="margin-top:8px">The cohort\u2019s own history, read off the snapshot: how much of this ' +
      'category already trades, and at what multiple. Context for the decision — it does not move this price.</p>' +
      '</div>' +
      '<div><h3>The farm plan\u2019s economics</h3>' +
      kv('Deposit the plan works with', fmtFull(f.deposit_usd)) +
      kv('Plan length', f.weeks + ' weeks') +
      kv('Estimated total cost', fmtFull(f.total_cost_usd)) +
      kv('Expected take, one wallet', fmtFull(f.expected_usd)) +
      kv('Break-even implied value', fmtFull(f.breakeven_usd)) +
      kv('FARM-line implied value', fmtFull(f.farm_line_usd)) +
      '<div class="verdict-line">' + badge(r.verdict) + '<span>Expected take vs cost: <b>' +
      (f.total_cost_usd > 0 ? (f.expected_usd / f.total_cost_usd).toFixed(1) + 'x' : 'n/a') +
      '</b> \u00b7 ' + esc(distance) + '.</span></div>' +
      '</div></div>' +
      '<div class="sens" id="sens">' +
      '<h3>What would change this rank</h3>' +
      '<p class="muted small">Drag the TVL slider: the page re-prices ' + esc(r.name) + ' from the same fitted ' +
      'coefficients the build published, holding the rest of the board and this protocol\u2019s own week still. ' +
      'It answers what would have to change — not what will happen.</p>' +
      '<div class="slider-row"><input type="range" id="sens-slider" min="0" max="200" value="82" step="1" ' +
      'aria-label="Scenario TVL multiplier"><span class="now" id="sens-now"></span></div>' +
      '<div class="sens-reads">' +
      '<div class="stat"><b id="sens-implied">\u2026</b><span>implied value at that TVL</span></div>' +
      '<div class="stat"><b id="sens-rank">\u2026</b><span>rank at that TVL</span></div>' +
      '<div class="stat"><b id="sens-verdict">\u2026</b><span>verdict at that TVL</span></div>' +
      '</div>' +
      '<table><thead><tr><th>Threshold</th><th class="num">Value needed</th><th class="num">TVL needed</th>' +
      '<th class="num">x today\u2019s TVL</th><th class="num">Weekly growth, 12 wks</th></tr></thead>' +
      '<tbody>' + thresholdRows(r) + '</tbody></table>' +
      '<p class="muted small" style="margin-top:8px">Plan cost held at today\u2019s; a bigger protocol would run a ' +
      'bigger plan. The FARM and break-even lines come from the verdict arithmetic stated on the board.</p>' +
      '</div>' +
      '<h3 style="margin-top:18px">The farm plan, step by step</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '</section>';
    $('sens-slider').addEventListener('input', renderScenario);
    renderScenario();
    window.scrollTo(0, 0);
  }
  function closeDetail() {
    $('view-detail').hidden = true;
    $('view-board').hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------- traded set + footer
  function renderTraded() {
    var q = $('f-traded').value.trim().toLowerCase();
    var rows = TRADED.filter(function (r) {
      return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.indexOf(q) >= 0;
    });
    $('live-body').innerHTML = rows.map(function (r) {
      var chg = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      return '<tr><td><span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + (r.mcap_usd === null ? 'not recorded' : fmtUsd(r.mcap_usd)) + '</td>' +
        '<td class="num ' + chg + '">' + fmtPct(r.change_7d) + '</td></tr>';
    }).join('');
    $('traded-note').textContent = 'Showing ' + rows.length + ' of ' + TRADED.length + ' protocols that record a token. ' +
      'The radar never ranks them; they are the fit\u2019s training set, the values the model learns from. Together with the ' +
      DATA.counts.pre_token + ' ranked above, every one of the ' + DATA.counts.protocols + ' protocols in the snapshot is accounted for.';
  }
  $('f-traded').addEventListener('input', renderTraded);
  renderTraded();
  $('foot-note').textContent = 'Data: ' + DATA.source + ' \u00b7 ' + DATA.counts.protocols + ' protocols in the snapshot: ' +
    DATA.counts.pre_token + ' record no token and are ranked above; ' + DATA.counts.tokenized +
    ' already record one and are never ranked by the model. Implied values are this entry\u2019s own claim from the snapshot\u2019s figures, not a prediction that a token will be issued.';

  // ---------------------------------------------------------- wiring
  $('f-q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('f-verdict').addEventListener('change', function (e) { state.verdict = e.target.value; renderBoard(); });
  $('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
  $('f-watch').addEventListener('change', function (e) { state.watch = e.target.checked; renderBoard(); });
  $('board-body').addEventListener('click', function (e) {
    var tr = e.target.closest('tr.row');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('board-body').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var tr = e.target.closest('tr.row');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  $('btn-back').addEventListener('click', closeDetail);
  $('btn-csv').addEventListener('click', function () {
    var head = 'rank,slug,name,category,tvl_usd,change_7d,age_days,implied_value_usd,implied_low_usd,implied_high_usd,breakeven_usd,farm_line_usd,verdict\n';
    var body = filtered().map(function (r) {
      return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"',
        r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days,
        r.implied_value_usd, r.implied_low_usd, r.implied_high_usd, r.farm.breakeven_usd, r.farm.farm_line_usd, r.verdict].join(',');
    }).join('\n');
    var blob = new Blob([head + body + '\n'], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'launch-radar-board.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Deep links the page itself honours: ?detail=<slug>, ?watchlist=1, ?cat=<category>.
  var params = new URLSearchParams(window.location.search);
  if (params.get('watchlist') === '1') { state.watch = true; $('f-watch').checked = true; }
  if (params.get('cat')) {
    var c = params.get('cat');
    var sel = $('f-cat');
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === c) { state.cat = c; sel.value = c; break; }
    }
  }
  renderBoard();
  if (params.get('detail')) openDetail(params.get('detail'));

  window.RADAR_APP = { openDetail: openDetail, closeDetail: closeDetail };
})();
