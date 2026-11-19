// Launch Radar's dashboard. Reads window.RADAR (data.js, written beside this page by main.ts) and
// renders the ranked board, its filters, a per-protocol detail view and the already-trading set.
// No network and no framework: every byte on the page comes from that one data file.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var ROWS = DATA.rows;
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

  // ---------------------------------------------------------- header, KPIs, model panel
  $('k-asof').textContent = DATA.as_of;
  $('k-model').textContent = DATA.model_version;
  var M = DATA.model;
  var V = DATA.validation;
  var kpis = [
    [String(DATA.counts.pre_token), 'pre-token tracked'],
    [String(DATA.counts.watchlist), 'on the watchlist'],
    [fmtUsd(DATA.totals.implied_usd), 'total implied value'],
    [V.median_abs_err_pct + '%', 'model error, tested blind'],
  ];
  $('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
  }).join('');

  $('model-text').innerHTML =
    '<p>The radar prices a protocol the way the market prices its already-trading peers. On the ' +
    '<b>' + DATA.counts.fit_n + ' tokenized protocols</b> that record both a market cap and a TVL, it regresses ' +
    '<b>log(market cap) on log(TVL)</b> (slope ' + M.slope + '), then shifts each category by its mean ' +
    'residual, shrunk toward zero by n/(n+' + M.shrink_k + ') so thin categories barely move. A pre-token ' +
    'protocol\u2019s <b>base value</b> is that fit read at its own TVL and category. The base is then adjusted ' +
    'by <b>7-day TVL growth</b> (clamped to ' + M.growth_floor_pct + '%\u2026+' + M.growth_cap_pct + '%, weight ' +
    M.growth_weight + ') and by <b>maturity</b>: up to +' + Math.round(M.maturity_bonus * 100) + '% for ' +
    M.maturity_max_years + ' years live at scale with no token recorded, because a protocol that has run ' +
    'that long without one is the stronger launch candidate. No protocol name is an input anywhere.</p>' +
    '<p>Each row also carries a <b>range</b>: the fit\u2019s residual 10th\u201390th percentile (x' +
    M.range_low_factor + ' to x' + M.range_high_factor + '), because TVL prices loosely and the board ' +
    'says so. <b>Verdicts</b> net a plan\u2019s cost against an expected take that assumes a launch sets aside ' +
    (M.airdrop_share * 100) + '% of value for the community, shared by ' + full.format(M.airdrop_wallets) +
    ' qualifying wallets: FARM when the take is at least twice the cost, THIN when it covers the cost, SKIP below.</p>';
  $('validation').innerHTML = [
    [String(V.n), 'protocols predicted blind'],
    [V.folds + ' folds', 'split by slug hash'],
    [V.median_abs_err_pct + '%', 'median absolute error'],
    [V.within_2x_pct + '%', 'within 2x of market cap'],
    ['x' + M.range_low_factor + ' \u2013 x' + M.range_high_factor, 'residual range (p10\u2013p90)'],
  ].map(function (s) {
    return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>';
  }).join('');

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
      name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
    }[state.sort];
    return out.sort(key);
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
        '<span class="range">' + fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) + '</span></td>' +
        '<td>' + badge(r.verdict) + '</td></tr>';
    }).join('');
    $('board-note').textContent = rows.length === 0
      ? 'No protocol matches those filters.'
      : 'Click any row for the protocol\u2019s record, the model\u2019s arithmetic and its full farm plan. Ranks are the model\u2019s claim; the filters only change what you are looking at.';
  }

  // ---------------------------------------------------------- detail view
  function kv(k, v) { return '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }
  function openDetail(slug) {
    var r = bySlug[slug];
    if (!r) return;
    $('view-board').hidden = true;
    $('view-detail').hidden = false;
    var f = r.farm;
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
      kv('Growth adjustment', fmtMult(r.model.growth_multiplier)) +
      kv('Maturity adjustment', fmtMult(r.model.maturity_multiplier)) +
      kv('Implied value', fmtFull(r.implied_value_usd)) +
      kv('Range (residual p10\u2013p90)', fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd)) +
      '</div>' +
      '<div><h3>The farm plan\u2019s economics</h3>' +
      kv('Deposit the plan works with', fmtFull(f.deposit_usd)) +
      kv('Plan length', f.weeks + ' weeks') +
      kv('Estimated total cost', fmtFull(f.total_cost_usd)) +
      kv('Expected take, one wallet', fmtFull(f.expected_usd)) +
      '<div class="verdict-line">' + badge(r.verdict) + '<span>Expected take vs cost: <b>' +
      (f.total_cost_usd > 0 ? (f.expected_usd / f.total_cost_usd).toFixed(1) + 'x' : 'n/a') +
      '</b> under the stated assumptions.</span></div>' +
      '</div></div>' +
      '<h3 style="margin-top:18px">The farm plan, step by step</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '</section>';
    window.scrollTo(0, 0);
  }
  function closeDetail() {
    $('view-detail').hidden = true;
    $('view-board').hidden = false;
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------- live set + footer
  $('live-body').innerHTML = DATA.live.map(function (r) {
    var chg = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
    return '<tr><td><span class="pname">' + esc(r.name) + '</span><span class="pslug">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
      '<td class="num ' + chg + '">' + fmtPct(r.change_7d) + '</td></tr>';
  }).join('');
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
    var head = 'rank,slug,name,category,tvl_usd,change_7d,age_days,implied_value_usd,implied_low_usd,implied_high_usd,verdict\n';
    var body = filtered().map(function (r) {
      return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || '') + '"',
        r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days,
        r.implied_value_usd, r.implied_low_usd, r.implied_high_usd, r.verdict].join(',');
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
