'use strict';

/* ===================== Раскладка ленты процесса =====================
   Детерминированная, пересчитывается при каждом изменении; зависит только от данных процесса:
   1. Обход в глубину от startStepId (переходы — в порядке исходов). Переход к шагу, который
      уже на текущем пути обхода, — возврат.
   2. Колонка шага — длина самого длинного пути от старта без учёта возвратов.
   3. Строка: первый ещё не размещённый переход продолжает строку шага, остальные — новые строки
      ниже всего уже размещённого. Каждая строка — одна цепочка, поэтому ячейки не пересекаются.
      Переход к уже размещённому шагу — слияние (стрелка к нему).
   4. Номер — по колонке, внутри колонки — по строке: 4, 4а, 4б.
   Шаги, недостижимые от начала, раскладываются так же отдельными блоками ниже, номер — «—». */

var STEP_LETTERS = 'абвгдежзиклмнопрстуфхцчшщэюя';

function processLayout(proc){
  var byId = {}; proc.steps.forEach(function(s){ byId[s.id] = s; });
  var comp = {}, col = {}, row = {}, order = [], numbers = {}, edgesOf = {};
  var terms = [], edges = [], maxRow = -1, compCount = 0;

  function layoutComponent(root){
    var ci = compCount++, mark = {}, post = [];
    function dfs(u){
      mark[u] = 1; comp[u] = ci; edgesOf[u] = [];
      stepEdges(byId[u]).forEach(function(e){
        var v = e.to, edge = {from:u, to:v, outIdx:e.outIdx, label:e.label, kind:'fwd'};
        if (!v || !byId[v]){ edge.to = null; edge.kind = byId[u].kind === 'decision' ? 'term' : 'tail'; }
        else if (comp[v] !== undefined && comp[v] !== ci) edge.kind = 'back';   /* в блок выше — как возврат */
        else if (mark[v] === 1) edge.kind = 'back';
        else if (!mark[v]) dfs(v);
        edgesOf[u].push(edge);
      });
      mark[u] = 2; post.push(u);
    }
    dfs(root);
    /* Колонки: самый длинный путь по переходам без возвратов (обратный postorder — топологический). */
    var topo = post.slice().reverse();
    topo.forEach(function(u){ col[u] = col[u] || 0; });
    topo.forEach(function(u){
      edgesOf[u].forEach(function(e){ if (e.kind === 'fwd') col[e.to] = Math.max(col[e.to] || 0, col[u] + 1); });
    });
    /* Строки. */
    function place(u, r){
      row[u] = r; if (r > maxRow) maxRow = r;
      var cont = false;
      edgesOf[u].forEach(function(e){
        if (e.kind === 'fwd' && row[e.to] === undefined){
          if (!cont){ cont = true; place(e.to, r); } else place(e.to, maxRow + 1);
        } else if (e.kind === 'term'){
          var tr = cont ? maxRow + 1 : r; cont = true;
          if (tr > maxRow) maxRow = tr;
          var t = {key:u + '#' + e.outIdx, from:u, outIdx:e.outIdx, label:e.label, col:col[u] + 1, row:tr};
          terms.push(t); e.to = t.key;
        }
      });
    }
    place(root, maxRow + 1);
    var ids = post.slice().sort(function(a, b){ return col[a] - col[b] || row[a] - row[b]; });
    ids.forEach(function(id){ order.push(id); });
    /* Номера — только в основном блоке (от начала процесса). */
    if (ci === 0 && root === proc.startStepId){
      var inCol = {};
      ids.forEach(function(id){
        var k = inCol[col[id]] = (inCol[col[id]] || 0) + 1;
        numbers[id] = String(col[id] + 1) + (k > 1 ? STEP_LETTERS.charAt(k - 2) : '');
      });
    } else ids.forEach(function(id){ numbers[id] = '—'; });
    post.forEach(function(u){ edgesOf[u].forEach(function(e){ edges.push(e); }); });
  }

  if (proc.startStepId && byId[proc.startStepId]) layoutComponent(proc.startStepId);
  /* Недостижимые: сначала те, на которые не ведут переходы из других недостижимых. */
  for (;;){
    var rest = proc.steps.filter(function(s){ return comp[s.id] === undefined; });
    if (!rest.length) break;
    var targeted = {};
    rest.forEach(function(s){ stepEdges(s).forEach(function(e){ if (e.to) targeted[e.to] = true; }); });
    var root = rest.filter(function(s){ return !targeted[s.id]; })[0] || rest[0];
    layoutComponent(root.id);
  }
  return {order:order, numbers:numbers, col:col, row:row, comp:comp, terms:terms, edges:edges, maxRow:maxRow};
}

/* ----- Отрисовка ----- */

var RIBBON = {padX:40, padY:20, rowGap:48, laneH:26, arrowY:20, termW:120, termH:28, bend:16, corner:8}; /* termW — из токена --step-term-w */
var labelMeasureCtx = null;
function fitLabel(text, maxW){
  if (!labelMeasureCtx) labelMeasureCtx = document.createElement('canvas').getContext('2d');
  labelMeasureCtx.font = '400 ' + getComputedStyle(document.documentElement).getPropertyValue('--fs-caption') + ' ' + THEME.sans;
  if (maxW <= 12) return '';
  if (labelMeasureCtx.measureText(text).width <= maxW) return text;
  var t = text;
  while (t.length > 1 && labelMeasureCtx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}
/* SVG-путь по точкам со скруглёнными углами. */
function roundedPath(pts, r){
  var d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (var i = 1; i < pts.length - 1; i++){
    var p0 = pts[i - 1], p = pts[i], p1 = pts[i + 1];
    var l0 = Math.hypot(p[0] - p0[0], p[1] - p0[1]), l1 = Math.hypot(p1[0] - p[0], p1[1] - p[1]);
    var rr = Math.min(r, l0 / 2, l1 / 2);
    if (!rr){ d += ' L' + p[0] + ' ' + p[1]; continue; }
    var a = [p[0] - (p[0] - p0[0]) / l0 * rr, p[1] - (p[1] - p0[1]) / l0 * rr];
    var b = [p[0] + (p1[0] - p[0]) / l1 * rr, p[1] + (p1[1] - p[1]) / l1 * rr];
    d += ' L' + a[0] + ' ' + a[1] + ' Q' + p[0] + ' ' + p[1] + ' ' + b[0] + ' ' + b[1];
  }
  var last = pts[pts.length - 1];
  return d + ' L' + last[0] + ' ' + last[1];
}

/* Дорожки: строка карточки определяется ролью шага. Дорожка «Система» — автоматические действия
   без роли. Порядок дорожек — по первому появлению роли в процессе. Внутри дорожки ветки — подстроки
   (по строкам ленты), поэтому ячейки не пересекаются. Возвращает {rows, termRows, bands}. */
function laneKeyOf(s){ return s.roleId ? 'role:' + s.roleId : (s.kind === 'auto_action' ? 'system' : 'none'); }
function laneTitle(key){
  if (key === 'system') return 'Система';
  if (key === 'none') return 'Роль не указана';
  var id = key.slice(5);
  return state.roles[id] ? state.roles[id].name : '⚠ Удалено: ' + deletedName(id);
}
function laneLayout(proc, L){
  var byId = {}; proc.steps.forEach(function(s){ byId[s.id] = s; });
  var lanes = [], laneIdx = {};
  function lane(k){ if (!(k in laneIdx)){ laneIdx[k] = lanes.length; lanes.push({key:k, items:[]}); } return lanes[laneIdx[k]]; }
  L.order.forEach(function(id){ lane(laneKeyOf(byId[id])).items.push({id:id, row:L.row[id]}); });
  L.terms.forEach(function(t){ lane(laneKeyOf(byId[t.from])).items.push({term:t.key, row:t.row}); });
  var rows = {}, termRows = {}, bands = [], next = 0;
  lanes.forEach(function(ln){
    var distinct = []; ln.items.forEach(function(it){ if (distinct.indexOf(it.row) < 0) distinct.push(it.row); });
    distinct.sort(function(a, b){ return a - b; });
    ln.items.forEach(function(it){
      var r = next + distinct.indexOf(it.row);
      if (it.id) rows[it.id] = r; else termRows[it.term] = r;
    });
    bands.push({key:ln.key, title:laneTitle(ln.key), first:next, last:next + distinct.length - 1});
    next += distinct.length;
  });
  return {rows:rows, termRows:termRows, bands:bands, maxRow:next - 1};
}

/* opts (необязательно) — раскладка дорожек из laneLayout: строки и полосы вместо строк ленты.
   Возвращает геометрию полос [{title, top, height}] для заголовков дорожек. */
function renderRibbonLayout(stage, proc, L, opts){
  var rowOf = opts ? opts.rows : L.row, termRowOf = opts ? opts.termRows : null;
  var maxRow = opts ? opts.maxRow : L.maxRow;
  var bands = opts ? opts.bands : [{first:0, last:maxRow}];
  var bandOfRow = [];
  bands.forEach(function(b, i){ for (var r = b.first; r <= b.last; r++) bandOfRow[r] = i; });
  var cs = getComputedStyle(document.documentElement);
  var cardW = parseFloat(cs.getPropertyValue('--step-card-w')) || 240, gap = parseFloat(cs.getPropertyValue('--step-link-w')) || 112;
  var R = RIBBON, byId = {};
  R.termW = parseFloat(cs.getPropertyValue('--step-term-w')) || 120;
  proc.steps.forEach(function(s){ byId[s.id] = s; });
  function xOf(c){ return R.padX + c * (cardW + gap); }

  stage.style.zoom = 1;
  stage.innerHTML = '<svg class="proc-edges" aria-hidden="true"></svg>' +
    L.order.map(function(id){ return stepCardHTML(byId[id], L.numbers[id], L.comp[id] !== 0 || !proc.startStepId); }).join('') +
    L.terms.map(function(t){ return '<div class="step-term" data-term="' + escapeHtml(t.key) + '" title="Исход «' + escapeHtml(t.label) + '» — завершение процесса">Завершение</div>'; }).join('');

  /* Клетки: {id|key → {col,row,w,el}}; высоты строк — по самой высокой карточке. */
  var cells = {}, rowH = [], occ = [];
  function cell(key, c, r, el, w){ cells[key] = {col:c, row:r, el:el, w:w}; (occ[r] = occ[r] || {})[c] = true; }
  stage.querySelectorAll('.step-card').forEach(function(el){
    var id = el.getAttribute('data-step');
    el.style.left = xOf(L.col[id]) + 'px';
    cell(id, L.col[id], rowOf[id], el, cardW);
  });
  L.terms.forEach(function(t){
    var el = stage.querySelector('.step-term[data-term="' + t.key + '"]');
    el.style.left = xOf(t.col) + 'px';
    cell(t.key, t.col, termRowOf ? termRowOf[t.key] : t.row, el, R.termW);
  });
  fitChipLines();
  Object.keys(cells).forEach(function(k){
    var c = cells[k], h = cells[k].el.classList.contains('step-term') ? R.arrowY + R.termH / 2 : c.el.offsetHeight;
    c.h = cells[k].el.offsetHeight;
    rowH[c.row] = Math.max(rowH[c.row] || 0, h);
  });
  for (var r = 0; r <= maxRow; r++) if (!rowH[r]) rowH[r] = R.arrowY * 2;

  /* Возвраты: дуги над своей полосой (на ленте полоса одна; в дорожках — верхняя из двух дорожек);
     более короткие — ниже, пересекающиеся — на разных уровнях. */
  var returns = L.edges.filter(function(e){ return e.kind === 'back'; });
  var arcLanes = bands.map(function(){ return []; });
  returns.forEach(function(e){
    var U = cells[e.from], V = cells[e.to];
    e.band = bandOfRow[Math.min(U.row, V.row)];
    var first = bands[e.band].first;
    e.sx = U.row === first ? xOf(U.col) + cardW / 2 + 10 : xOf(U.col) + U.w + gap / 2;
    e.ex = V.row === first ? xOf(V.col) + cardW / 2 - 10 : xOf(V.col) - (V.col === 0 ? R.padX / 2 : gap / 2);
    e.span = [Math.min(e.sx, e.ex) - 4, Math.max(e.sx, e.ex) + 4];
  });
  returns.slice().sort(function(a, b){ return (a.span[1] - a.span[0]) - (b.span[1] - b.span[0]) || a.span[0] - b.span[0]; }).forEach(function(e){
    var lanes = arcLanes[e.band], lv = 0;
    while ((lanes[lv] || []).some(function(s){ return s[0] < e.span[1] && e.span[0] < s[1]; })) lv++;
    (lanes[lv] = lanes[lv] || []).push(e.span); e.lane = lv;
  });
  /* Высоты: полоса = место под дуги + её строки. */
  var rowTop = [], bandGeo = [], y = R.padY;
  bands.forEach(function(b, i){
    var top = y, n = arcLanes[i].length;
    y += n ? n * R.laneH + 14 : (opts ? 12 : 0);
    for (var rr = b.first; rr <= b.last; rr++){ rowTop[rr] = y; y += rowH[rr] + R.rowGap; }
    bandGeo.push({title:b.title, top:top, height:y - top});
  });
  rowTop[maxRow + 1] = y;
  Object.keys(cells).forEach(function(k){
    var c = cells[k];
    c.x = xOf(c.col); c.y = c.el.classList.contains('step-term') ? rowTop[c.row] + R.arrowY - R.termH / 2 : rowTop[c.row];
    c.yA = rowTop[c.row] + R.arrowY;
    c.el.style.top = c.y + 'px';
  });
  function rowClear(rw, c1, c2){
    var lo = Math.min(c1, c2), hi = Math.max(c1, c2);
    for (var c = lo + 1; c < hi; c++) if (occ[rw] && occ[rw][c]) return false;
    return true;
  }

  var paths = [], labels = [], plus = [];
  L.edges.forEach(function(e){
    var U = cells[e.from];
    if (e.kind === 'tail'){
      plus.push({x:U.x + U.w + R.bend, y:U.yA - 11, from:e.from, out:e.outIdx, tail:true});
      return;
    }
    var V = cells[e.to];
    if (e.kind === 'back'){
      var first = bands[e.band].first, laneY = rowTop[first] - 14 - e.lane * R.laneH, pts = [];
      if (U.row === first) pts.push([e.sx, U.y], [e.sx, laneY]);
      else pts.push([U.x + U.w, U.yA + 8], [e.sx, U.yA + 8], [e.sx, laneY]);
      if (V.row === first) pts.push([e.ex, laneY], [e.ex, V.y]);
      else pts.push([e.ex, laneY], [e.ex, V.yA + 8], [V.x, V.yA + 8]);
      paths.push({pts:pts, cls:'proc-edge is-return'});
      if (e.label) labels.push({x:(e.sx + e.ex) / 2, y:laneY - 5, text:fitLabel(e.label, Math.abs(e.sx - e.ex) - 12), full:e.label, anchor:'middle', cls:'is-return'});
      return;
    }
    var xR = U.x + U.w, xL = V.x, p;
    if (U.row === V.row && rowClear(U.row, U.col, V.col)) p = [[xR, U.yA], [xL, V.yA]];
    else if (V.row !== U.row && rowClear(V.row, U.col, V.col)) p = [[xR, U.yA], [xR + R.bend, U.yA], [xR + R.bend, V.yA], [xL, V.yA]];
    else if (V.row !== U.row && rowClear(U.row, U.col, V.col)) p = [[xR, U.yA], [xL - R.bend, U.yA], [xL - R.bend, V.yA], [xL, V.yA]];
    else {
      /* Обход по каналу под строкой источника. */
      var chY = rowTop[U.row] + rowH[U.row] + R.rowGap / 2, sx = U.x + U.w / 2 + 20;
      p = [[sx, U.y + U.h], [sx, chY], [xL - R.bend, chY], [xL - R.bend, V.yA], [xL, V.yA]];
    }
    paths.push({pts:p, cls:'proc-edge'});
    /* Подпись исхода и «+» — на самом длинном горизонтальном отрезке. */
    var best = null;
    for (var i = 1; i < p.length; i++) if (p[i][1] === p[i - 1][1]){
      var len = Math.abs(p[i][0] - p[i - 1][0]);
      if (!best || len > best.len) best = {x0:Math.min(p[i][0], p[i - 1][0]), x1:Math.max(p[i][0], p[i - 1][0]), y:p[i][1], len:len};
    }
    if (!best) best = {x0:xR, x1:xL, y:U.yA, len:xL - xR};
    var isDecision = e.outIdx >= 0;
    var px = isDecision ? best.x1 - 20 : (best.x0 + best.x1) / 2;
    plus.push({x:px - 11, y:best.y - 11, from:e.from, out:e.outIdx});
    /* Подпись — над линией и выше кнопки «+», поэтому может занимать весь отрезок. */
    if (isDecision && e.label) labels.push({x:best.x0 + 6, y:best.y - 14, text:fitLabel(e.label, best.len - 12), full:e.label, anchor:'start'});
  });

  var maxCol = 0; Object.keys(cells).forEach(function(k){ maxCol = Math.max(maxCol, cells[k].col); });
  var W = xOf(maxCol + 1) + R.padX / 2, H = rowTop[maxRow + 1] - R.rowGap + R.padY + 40;
  if (!L.order.length){ W = 400; H = 120; }
  var svg = stage.querySelector('.proc-edges');
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.innerHTML = '<defs><marker id="proc-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0 0 L10 5 L0 10 z" class="proc-arrowhead"/></marker></defs>' +
    (opts ? bandGeo.map(function(b, i){ return '<rect class="lane-band' + (i % 2 ? ' is-odd' : '') + '" x="0" y="' + b.top + '" width="' + W + '" height="' + b.height + '"/>'; }).join('') : '') +
    paths.map(function(pp){ return '<path class="' + pp.cls + '" d="' + roundedPath(pp.pts, R.corner) + '" marker-end="url(#proc-arrowhead)"/>'; }).join('') +
    labels.map(function(l){ return '<text class="proc-edge-label ' + (l.cls || '') + '" x="' + l.x + '" y="' + l.y + '" text-anchor="' + l.anchor + '"><title>' + escapeHtml(l.full) + '</title>' + escapeHtml(l.text) + '</text>'; }).join('');
  stage.insertAdjacentHTML('beforeend', plus.map(function(b){
    return '<button type="button" class="step-add' + (b.tail ? ' is-tail' : '') + '" data-from="' + b.from + '" data-out="' + b.out + '" style="left:' + b.x + 'px;top:' + b.y + 'px"' +
      ' title="' + (b.tail ? 'Добавить шаг после' : 'Вставить шаг') + '" aria-label="' + (b.tail ? 'Добавить шаг после' : 'Вставить шаг') + '">+</button>';
  }).join('') + (L.order.length ? '' : '<button type="button" class="btn step-add-first" data-from="" data-out="-1">+ Добавить шаг</button>'));
  stage.style.width = W + 'px'; stage.style.height = H + 'px';
  stage.style.zoom = procZoom;
  return bandGeo;
}
