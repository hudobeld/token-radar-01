// Token Radar dashboard: renders window.RADAR (data.js) with no network.
// Views: board (sortable, filterable, paged), live tokens, model & method.
// URL params set the initial state, so screenshots are reproducible:
//   ?tab=live|model  ?detail=<slug>  ?filter=watchlist  ?category=RWA
//   ?chain=Ethereum  ?q=<text>  ?mintvl=50000000
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) { document.body.textContent = 'No radar data loaded.'; return; }
  var rows = D.rows || [];
  var live = D.live || [];
  var params = new URLSearchParams(window.location.search);
  var PAGE = 50;
  var state = {
    q: params.get('q') || '',
    cat: params.get('category') || '',
    chain: params.get('chain') || '',
    mintvl: Number(params.get('mintvl') || '0') || 0,
    watch: params.get('filter') === 'watchlist',
    sort: 'rank',
    dir: -1,
    shown: PAGE,
    detail: params.get('detail') || null,
  };
  var tab = params.get('tab') || 'board';
  if (state.detail) tab = 'board';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(v) {
    if (v == null) return '—';
    var s = (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    return '<span class="' + (v > 0 ? 'up' : v < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function ageText(days) {
    if (days == null) return '—';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function $(id) { return document.getElementById(id); }

  // ---- header + stats -------------------------------------------------
  $('meta').innerHTML =
    '<b>Snapshot</b> ' + esc(D.as_of) + '<br>' +
    '<b>Model</b> ' + esc(D.model_version) + ' · category-median FDV/TVL<br>' +
    '<b>Source</b> DefiLlama protocol snapshot';
  var t = D.totals;
  $('stats').innerHTML =
    stat(money(t.implied_total_usd), 'total implied value', 'hot') +
    stat(String(t.board), 'board rows', '') +
    stat(String(t.watchlist), 'watchlist protocols', 'warn') +
    stat(String(t.pre_token), 'pre-token of ' + t.protocols + ' tracked', '') +
    stat(String(t.live), 'live tokens shown', '');
  function stat(v, label, cls) {
    return '<div class="stat ' + cls + '"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>';
  }
  $('foot').textContent = 'Token Radar · model ' + D.model_version + ' · snapshot ' + D.as_of +
    ' · ' + t.protocols + ' protocols tracked, ' + t.board + ' ranked, ' + t.watchlist +
    ' on the watchlist. Implied values are this dashboard\u2019s own claim, not a market price.';

  // ---- filter controls -------------------------------------------------
  function fillSelect(id, values) {
    var el = $(id);
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v; el.appendChild(o);
    });
  }
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  fillSelect('cat', cats);
  fillSelect('chain', chains);
  $('q').value = state.q;
  $('cat').value = state.cat;
  $('chain').value = state.chain;
  $('mintvl').value = String(state.mintvl);
  $('watch').checked = state.watch;

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.watchlist) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.mintvl) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name < b.name ? -1 : 1; },
    category: function (a, b) { return (a.category || '') < (b.category || '') ? -1 : 1; },
    chain: function (a, b) { return (a.chains[0] || '') < (b.chains[0] || '') ? -1 : 1; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
    age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
  };
  function sorted(list) {
    var fn = SORTS[state.sort] || SORTS.rank;
    return list.slice().sort(function (a, b) {
      var d = fn(a, b);
      return d !== 0 ? d : (a.slug < b.slug ? -1 : 1);
    });
  }

  function renderBoard() {
    var list = sorted(filtered());
    var show = list.slice(0, state.shown);
    $('count').innerHTML = 'Showing <b>' + show.length + '</b> of <b>' + list.length + '</b> matching rows' +
      (list.length < rows.length ? ' (of ' + rows.length + ' ranked)' : '');
    $('rows').innerHTML = show.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.detail === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) +
          (r.watchlist ? '<span class="badge">WATCH</span>' : '') +
          '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc((r.chains || [])[0] || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    $('more').style.display = list.length > state.shown ? '' : 'none';
    $('rows').querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  // ---- detail drawer ---------------------------------------------------
  function findRow(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }
  function openDetail(slug) {
    var r = findRow(slug);
    if (!r) return;
    state.detail = slug;
    var m = r.model;
    var chain = (r.chains || [])[0] || 'its main chain';
    var steps = (r.farm_steps || []).map(function (s) {
      var i = s.lastIndexOf(' Cost: ');
      var body = i > 0 ? s.slice(0, i) : s;
      var ct = i > 0 ? s.slice(i + 1) : '';
      return '<li>' + esc(body) + (ct ? '<span class="ct">' + esc(ct) + '</span>' : '') + '</li>';
    }).join('');
    $('detailbody').innerHTML =
      '<h2>' + esc(r.name) + (r.watchlist ? ' <span class="badge">WATCH</span>' : '') + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(chain) +
        (r.chains.length > 1 ? ' +' + (r.chains.length - 1) + ' more' : '') + ' · listed ' + esc(r.listed_at || 'unknown date') + '</p>' +
      '<div class="kv">' +
      '<div><span>Implied value</span><b>' + moneyFull(r.implied_value_usd) + '</b></div>' +
      '<div><span>TVL</span><b>' + moneyFull(r.tvl_usd) + '</b></div>' +
      '<div><span>7d change</span><b>' + (r.change_7d == null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</b></div>' +
      '<div><span>Age</span><b>' + (r.age_days == null ? 'unknown' : r.age_days + ' days') + '</b></div>' +
      '</div>' +
      '<h3>Model breakdown</h3>' +
      '<div class="math">' + money(r.tvl_usd) + ' TVL × <b>' + m.category_multiple.toFixed(3) +
        '</b> category × <b>' + m.growth_multiplier.toFixed(3) + '</b> growth × <b>' +
        m.maturity_multiplier.toFixed(3) + '</b> maturity<br>= <b>' + moneyFull(r.implied_value_usd) + '</b> implied value</div>' +
      '<p class="fine">Category multiple ' + m.category_multiple.toFixed(3) + ' is the median market-cap / TVL of ' +
        m.category_sample + ' live-token ' + esc(r.category || 'uncategorised') + ' protocols in this snapshot' +
        (m.category_sample < 3 ? ' (fewer than 3 live samples, so the global median ' + D.global_multiple.toFixed(3) + ' is used)' : '') +
        '. Growth ' + (m.growth_pct > 0 ? '+' : '') + m.growth_pct.toFixed(1) + '% over 7 days. Maturity ' +
        m.maturity_multiplier.toFixed(3) + ' for ' + (m.age_days == null ? 'unknown age (counted as 365 days)' : m.age_days + ' days tracked') + '.</p>' +
      '<h3>How to farm it — 6 steps</h3>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<div class="note">This protocol <strong>records no token</strong> in the snapshot (no market cap, no ' +
      'CoinGecko id, no symbol). That is the snapshot\u2019s record, not proof it has no token — and it is ' +
      'no promise that one will ever be issued. Never pay to claim an airdrop; only follow links the ' +
      'protocol itself publishes.</div>';
    $('detail').hidden = false;
    renderBoard();
  }
  function closeDetail() {
    state.detail = null;
    $('detail').hidden = true;
    renderBoard();
  }
  $('close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // ---- live view -------------------------------------------------------
  $('liverows').innerHTML = live.map(function (p, i) {
    return '<tr><td class="num">' + (i + 1) + '</td>' +
      '<td class="name">' + esc(p.name) + '<span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td>' + esc((p.chains || [])[0] || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num"><b>' + money(p.mcap_usd) + '</b></td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- model view ------------------------------------------------------
  $('multrows').innerHTML = (D.multiples || []).map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num"><b>' + m.multiple.toFixed(3) + '</b></td>' +
      '<td class="num">' + m.sample + '</td><td>' + (m.fallback ? 'Fewer than 3 live samples — global median ' + D.global_multiple.toFixed(3) + ' used' : 'Median of live ' + esc(m.category) + ' protocols') + '</td></tr>';
  }).join('');

  // ---- tabs ------------------------------------------------------------
  function showTab(name) {
    ['board', 'live', 'model'].forEach(function (n) {
      $('view-' + n).hidden = n !== name;
      $('tab-' + n).classList.toggle('active', n === name);
    });
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
  });
  showTab(tab);

  // ---- events ----------------------------------------------------------
  var debounce = null;
  $('q').addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { state.q = $('q').value; state.shown = PAGE; renderBoard(); }, 120);
  });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; state.shown = PAGE; renderBoard(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; state.shown = PAGE; renderBoard(); });
  $('mintvl').addEventListener('change', function () { state.mintvl = Number($('mintvl').value) || 0; state.shown = PAGE; renderBoard(); });
  $('watch').addEventListener('change', function () { state.watch = $('watch').checked; state.shown = PAGE; renderBoard(); });
  $('sort').addEventListener('change', function () { state.sort = $('sort').value; state.shown = PAGE; renderBoard(); });
  $('more').addEventListener('click', function () { state.shown += PAGE; renderBoard(); });
  document.querySelectorAll('#board th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      if (k === 'rank' || k === 'implied') state.sort = 'rank';
      else state.sort = k;
      $('sort').value = state.sort;
      state.shown = PAGE;
      renderBoard();
    });
  });

  renderBoard();
  if (state.detail) openDetail(state.detail);
})();
