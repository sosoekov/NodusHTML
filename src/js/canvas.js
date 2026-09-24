'use strict';

/* ===================== Канвас: размер и инициализация ===================== */

function loadPanelWidths(){
  try{
    var raw = localStorage.getItem(PANEL_WIDTHS_KEY);
    if (raw){
      var d = JSON.parse(raw);
      if (d.left) panelWidths.left = d.left;
      if (d.right) panelWidths.right = d.right;
    }
  }catch(e){}
}
function savePanelWidths(){
  try{ localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(panelWidths)); }catch(e){}
}
function applyPanelWidths(){
  document.getElementById('sidebar-left').style.width = panelWidths.left + 'px';
  document.getElementById('detail-panel').style.width = panelWidths.right + 'px';
}
function setupResizeHandle(handleId, side){
  var handle = document.getElementById(handleId);
  var dragging = false, startX = 0, startWidth = 0;
  handle.addEventListener('mousedown', function(ev){
    dragging = true; startX = ev.clientX;
    startWidth = side === 'left' ? panelWidths.left : panelWidths.right;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    ev.preventDefault();
  });
  window.addEventListener('mousemove', function(ev){
    if (!dragging) return;
    var delta = ev.clientX - startX;
    if (side === 'left'){
      panelWidths.left = Math.max(200, Math.min(520, startWidth + delta));
    } else {
      panelWidths.right = Math.max(260, Math.min(560, startWidth - delta));
    }
    applyPanelWidths();
    if (currentView === 'graph') resizeCanvas();
  });
  window.addEventListener('mouseup', function(){
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    savePanelWidths();
  });
}

/* ===================== Масштаб, вписывание, центрирование ===================== */
var SCALE_MIN = 0.05, SCALE_MAX = 3;
var VIEW_ANIM_MS = 220;          /* ≤ 250 мс */
var FIT_PADDING = 48;            /* отступ от краёв холста до узла с подписью при «вписать в экран» */
var FIT_MAX_SCALE = 1.5;
var CENTER_EDGE_MARGIN = 80;     /* ближе к краю — центрируем */
var ZOOM_STEP = 1.25;
var viewAnim = null;

function clampScale(s){ return Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)); }

function cancelViewAnim(){ if (viewAnim){ cancelAnimationFrame(viewAnim); viewAnim = null; } }

function animateView(to){
  cancelViewAnim();
  var from = {scale:view.scale, offsetX:view.offsetX, offsetY:view.offsetY};
  var t0 = performance.now();
  function step(now){
    var t = Math.min(1, (now - t0)/VIEW_ANIM_MS);
    var k = 1 - Math.pow(1 - t, 3);
    view.scale = from.scale + (to.scale - from.scale)*k;
    view.offsetX = from.offsetX + (to.offsetX - from.offsetX)*k;
    view.offsetY = from.offsetY + (to.offsetY - from.offsetY)*k;
    requestRender();
    viewAnim = t < 1 ? requestAnimationFrame(step) : null;
  }
  viewAnim = requestAnimationFrame(step);
}

function zoomBy(factor){
  var cx = viewportWidth/2, cy = viewportHeight/2;
  var w = screenToWorld(cx, cy);
  var s = clampScale(view.scale*factor);
  animateView({scale:s, offsetX:cx - w.x*s, offsetY:cy - w.y*s});
}

/* Границы графа на экране при масштабе s (без сдвига): узлы плюс подписи, которые
   имеют постоянный экранный размер (у объекта — под кругом, у механизма — над ромбом). */
function screenExtents(s){
  ctx2d.font = THEME.labelFont;
  var e = {x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity};
  currentNodes.forEach(function(n){
    var r = nodeRadius(n)*s, cx = n.x*s, cy = n.y*s;
    var hw = Math.max(r, labelWidth(ctx2d, n)/2 + LABEL_PAD_X), lh = labelHeight(n) + LABEL_GAP;
    e.x0 = Math.min(e.x0, cx - hw); e.x1 = Math.max(e.x1, cx + hw);
    e.y0 = Math.min(e.y0, cy - r - (n.kind === 'mechanism' ? lh : 0));
    e.y1 = Math.max(e.y1, cy + r + (n.kind === 'mechanism' ? 0 : lh));
  });
  return e;
}
function fitView(){
  var W = viewportWidth - 2*FIT_PADDING, H = viewportHeight - 2*FIT_PADDING;
  function fits(s){ var e = screenExtents(s); return e.x1 - e.x0 <= W && e.y1 - e.y0 <= H; }
  /* Размер подписей не зависит от масштаба — подбираем масштаб двоичным поиском. */
  var lo = clampScale(0), hi = clampScale(FIT_MAX_SCALE);
  if (fits(hi)) lo = hi;
  else for (var i = 0; i < 30; i++){ var mid = (lo + hi)/2; if (fits(mid)) lo = mid; else hi = mid; }
  var e = screenExtents(lo);
  return {scale:lo, offsetX:viewportWidth/2 - (e.x0 + e.x1)/2, offsetY:viewportHeight/2 - (e.y0 + e.y1)/2};
}
function fitToScreen(){
  if (!currentNodes.length) return;
  animateView(fitView());
}
/* Начальная раскладка (и «Разложить заново»): когда физика успокоилась, граф
   вписывается, если выходит за отступы. */
var pendingInitialFit = true;
function maybeInitialFit(){
  if (!pendingInitialFit || focusMode || currentView !== 'graph' || !currentNodes.length || !viewportWidth) return;
  pendingInitialFit = false;
  var e = screenExtents(view.scale);
  var fitsNow = e.x0 + view.offsetX >= FIT_PADDING && e.x1 + view.offsetX <= viewportWidth - FIT_PADDING &&
                e.y0 + view.offsetY >= FIT_PADDING && e.y1 + view.offsetY <= viewportHeight - FIT_PADDING;
  if (fitsNow) return;
  animateView(fitView());
}

/* Точка сущности на холсте: узел объекта/механизма; механизм без узла (режим без
   механизмов) — центр его участников. */
function entityWorldPoint(kind, id){
  var node = nodeById.get((kind==='obj' ? 'obj:' : 'mech:') + id);
  if (node && currentNodes.indexOf(node) >= 0) return {x:node.x, y:node.y};
  if (kind !== 'mech') return null;
  var pts = (mechIndex.parts.get(id) || []).map(function(o){ return nodeById.get('obj:'+o); }).filter(Boolean);
  if (!pts.length) return null;
  return {x:pts.reduce(function(s,n){return s+n.x;},0)/pts.length, y:pts.reduce(function(s,n){return s+n.y;},0)/pts.length};
}

function centerOnEntity(kind, id){
  if (currentView !== 'graph') return;
  var p = entityWorldPoint(kind, id);
  if (!p) return;
  var sx = p.x*view.scale + view.offsetX, sy = p.y*view.scale + view.offsetY;
  var m = CENTER_EDGE_MARGIN;
  if (sx >= m && sx <= viewportWidth - m && sy >= m && sy <= viewportHeight - m) return;
  animateView({scale:view.scale, offsetX:viewportWidth/2 - p.x*view.scale, offsetY:viewportHeight/2 - p.y*view.scale});
}

/* ===================== Фокус-режим механизма =====================
   Временная раскладка одного механизма как потока: источники — колонкой слева,
   механизм — в центре, приёмники — справа, участники без направления — под механизмом.
   Остальные узлы приглушены, физика на время режима остановлена. Ничего не пишется
   в данные: позиции узлов до входа запоминаются и точно восстанавливаются при выходе. */
var FOCUS_COL_DX = 300, FOCUS_ROW_DY = 100, FOCUS_NEUTRAL_DY = 160, FOCUS_NEUTRAL_DX = 200;
/* Поля при вписывании фокуса: сверху — плашка «Фокус», по бокам — подписи узлов,
   снизу — легенда (если развёрнута). */
var FOCUS_FIT_PAD = { top:70, side:160, bottom:90 };
var EDGE_LABEL_MAX = 32;
var focusMode = null;   /* {mechId, prevMode, saved:Map, prevView, exiting} */
var edgeLabelBoxes = [];

function focusColumns(mid){
  var m = state.mechanisms[mid], cols = {source:[], target:[], neutral:[]}, seen = {};
  if (!m) return cols;
  m.participants.forEach(function(p){
    if (!p.objectId || !state.objects[p.objectId] || seen[p.objectId]) return;
    seen[p.objectId] = true;
    cols[roleInfo(p.role).direction].push('obj:'+p.objectId);
  });
  return cols;
}

function focusTargets(mid){
  var center = nodeById.get('mech:'+mid);
  var targets = new Map();
  if (!center) return targets;
  var cx = center.x, cy = center.y;
  targets.set(center.id, {x:cx, y:cy});
  var cols = focusColumns(mid);
  function column(ids, x){ ids.forEach(function(id, i){ targets.set(id, {x:x, y:cy + (i - (ids.length-1)/2)*FOCUS_ROW_DY}); }); }
  column(cols.source, cx - FOCUS_COL_DX);
  column(cols.target, cx + FOCUS_COL_DX);
  var sideRows = Math.max(cols.source.length, cols.target.length);
  var ny = cy + Math.max(FOCUS_NEUTRAL_DY, (sideRows-1)/2*FOCUS_ROW_DY + FOCUS_ROW_DY);
  cols.neutral.forEach(function(id, i){ targets.set(id, {x:cx + (i - (cols.neutral.length-1)/2)*FOCUS_NEUTRAL_DX, y:ny}); });
  return targets;
}

function animateNodePositions(targets, done){
  var from = new Map();
  targets.forEach(function(t, id){ var n = nodeById.get(id); if (n) from.set(id, {x:n.x, y:n.y}); });
  var t0 = performance.now();
  function step(now){
    var t = Math.min(1, (now - t0)/VIEW_ANIM_MS), k = 1 - Math.pow(1 - t, 3);
    from.forEach(function(f, id){
      var n = nodeById.get(id), to = targets.get(id);
      if (!n) return;
      n.x = f.x + (to.x - f.x)*k; n.y = f.y + (to.y - f.y)*k;
    });
    requestRender();
    if (t < 1) requestAnimationFrame(step); else if (done) done();
  }
  requestAnimationFrame(step);
}

function viewToFit(points, pad){
  var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  points.forEach(function(p){ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
  var bw = Math.max(1, maxX-minX), bh = Math.max(1, maxY-minY);
  var availW = viewportWidth - pad.left - pad.right, availH = viewportHeight - pad.top - pad.bottom;
  var s = clampScale(Math.min(availW/bw, availH/bh, FIT_MAX_SCALE));
  return {scale:s, offsetX:pad.left + availW/2 - (minX+bw/2)*s, offsetY:pad.top + availH/2 - (minY+bh/2)*s};
}
function focusFitPadding(){
  var legend = document.getElementById('graph-legend');
  var body = document.getElementById('legend-body');
  var legendH = (!legend.hidden && !body.hidden) ? legend.offsetHeight + 50 : 0;
  return { top:FOCUS_FIT_PAD.top, left:FOCUS_FIT_PAD.side, right:FOCUS_FIT_PAD.side, bottom:Math.max(FOCUS_FIT_PAD.bottom, legendH) };
}

function enterFocus(mid){
  if (!state.mechanisms[mid] || currentView !== 'graph') return;
  if (focusMode){
    if (focusMode.mechId === mid){ exitFocus(); return; }
    exitFocus(true);
  }
  var prevMode = currentMode;
  var prevSimAlpha = sim.alpha;
  var prevView = {scale:view.scale, offsetX:view.offsetX, offsetY:view.offsetY};
  if (currentMode !== 'full'){
    currentMode = 'full';
    syncMechModeUI();
    syncGraphModel();
    /* Узел механизма только что появился в случайном месте — ставим его в центр участников. */
    var mn = nodeById.get('mech:'+mid), pts = focusColumns(mid);
    var all = pts.source.concat(pts.target, pts.neutral).map(function(id){ return nodeById.get(id); }).filter(Boolean);
    if (mn && all.length){
      mn.x = all.reduce(function(s,n){return s+n.x;},0)/all.length;
      mn.y = all.reduce(function(s,n){return s+n.y;},0)/all.length;
    }
  }
  var saved = new Map();
  nodeById.forEach(function(n, id){ saved.set(id, {x:n.x, y:n.y, vx:n.vx, vy:n.vy}); });
  focusMode = {mechId:mid, prevMode:prevMode, prevSimAlpha:prevSimAlpha, saved:saved, prevView:prevView, exiting:false};
  pinnedMechanismId = mid; pinnedNodeId = null; pinnedEdgeKey = null;
  renderMechanismPanel(state.mechanisms[mid]);
  syncSidebarActive();
  var targets = focusTargets(mid);
  animateNodePositions(targets);
  var pts2 = []; targets.forEach(function(t){ pts2.push(t); });
  animateView(viewToFit(pts2, focusFitPadding()));
  updateFocusUI();
}

/* Правки механизма во время фокуса (добавили/убрали участника) — перераскладка без анимации. */
function refreshFocusLayout(){
  if (!state.mechanisms[focusMode.mechId]){ exitFocus(true); return; }
  nodeById.forEach(function(n, id){ if (!focusMode.saved.has(id)) focusMode.saved.set(id, {x:n.x, y:n.y, vx:n.vx, vy:n.vy}); });
  focusTargets(focusMode.mechId).forEach(function(t, id){ var n = nodeById.get(id); if (n){ n.x = t.x; n.y = t.y; } });
  updateFocusUI();
}

function exitFocus(immediate){
  if (!focusMode || focusMode.exiting) return;
  var fm = focusMode;
  fm.exiting = true;
  function finish(){
    fm.saved.forEach(function(s, id){ var n = nodeById.get(id); if (n){ n.x = s.x; n.y = s.y; n.vx = s.vx; n.vy = s.vy; } });
    focusMode = null;
    hideCanvasTooltip();
    if (fm.prevMode !== currentMode){
      currentMode = fm.prevMode;
      syncMechModeUI();
      syncGraphModel();
    }
    /* Перестройка графа «подогревает» физику — возвращаем её состояние до входа,
       чтобы узлы остались ровно там, где были. */
    sim.alpha = fm.prevSimAlpha;
    updateFocusUI();
    requestRender();
  }
  if (immediate){ cancelViewAnim(); view.scale = fm.prevView.scale; view.offsetX = fm.prevView.offsetX; view.offsetY = fm.prevView.offsetY; finish(); return; }
  var back = new Map();
  fm.saved.forEach(function(s, id){ back.set(id, {x:s.x, y:s.y}); });
  animateNodePositions(back, finish);
  animateView(fm.prevView);
}

function updateFocusUI(){
  var banner = document.getElementById('focus-banner');
  var m = focusMode && state.mechanisms[focusMode.mechId];
  banner.hidden = !m;
  if (m) document.getElementById('focus-banner-title').innerHTML = 'Фокус: <b>' + escapeHtml(m.title) + '</b>';
  document.querySelectorAll('.card-focus-btn').forEach(function(b){
    var on = !!focusMode && b.getAttribute('data-mech') === focusMode.mechId;
    b.textContent = on ? 'Выйти из фокуса' : 'Фокус';
  });
}

/* Подписи рёбер в фокусе: описание передачи участника (или название роли, если описания нет),
   до EDGE_LABEL_MAX символов; полный текст — во всплывающей подсказке. Подписи не должны
   пересекаться ни друг с другом, ни с подписями узлов: при пересечении сдвигаются вдоль ребра. */
function drawFocusEdgeLabels(ctx, nodeLabels){
  var m = state.mechanisms[focusMode.mechId], mn = nodeById.get('mech:'+focusMode.mechId);
  if (!m || !mn) return [];
  var byObj = new Map();
  m.participants.forEach(function(p){
    if (!p.objectId || !state.objects[p.objectId]) return;
    var e = byObj.get(p.objectId) || byObj.set(p.objectId, {notes:[], role:p.role}).get(p.objectId);
    if (p.note) e.notes.push(p.note);
  });
  ctx.font = THEME.labelFont;
  var taken = nodeLabels.map(function(b){ return b; }), out = [];
  /* Площадь пересечения с уже занятыми местами (0 — место свободно). */
  function overlapArea(b){
    return taken.reduce(function(sum, o){
      var w = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0), hh = Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0);
      return sum + (w > 0 && hh > 0 ? w*hh : 0);
    }, 0);
  }
  var EDGE_LABEL_T = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  var EDGE_LABEL_SHIFT = [0, -(LABEL_H+2), LABEL_H+2, -2*(LABEL_H+2), 2*(LABEL_H+2)];
  var msx = mn.x*view.scale + view.offsetX, msy = mn.y*view.scale + view.offsetY;
  byObj.forEach(function(info, oid){
    var n = nodeById.get('obj:'+oid);
    if (!n) return;
    var full = info.notes.length ? info.notes.join('; ') : roleInfo(info.role).title;
    var text = full.length > EDGE_LABEL_MAX ? full.slice(0, EDGE_LABEL_MAX - 1) + '…' : full;
    var w = ctx.measureText(text).width + 2*LABEL_PAD_X;
    var psx = n.x*view.scale + view.offsetX, psy = n.y*view.scale + view.offsetY;
    /* Сначала места вдоль ребра, затем — со сдвигом вверх/вниз; если свободных нет,
       берём место с наименьшим наложением. */
    var box = null, bestArea = Infinity;
    outer: for (var si = 0; si < EDGE_LABEL_SHIFT.length; si++){
      for (var i = 0; i < EDGE_LABEL_T.length; i++){
        var cx = psx + (msx - psx)*EDGE_LABEL_T[i], cy = psy + (msy - psy)*EDGE_LABEL_T[i] + EDGE_LABEL_SHIFT[si];
        var b = {x0:cx - w/2, x1:cx + w/2, y0:cy - LABEL_H/2, y1:cy + LABEL_H/2, cx:cx, cy:cy};
        var area = overlapArea(b);
        if (area < bestArea){ bestArea = area; box = b; }
        if (area === 0) break outer;
      }
    }
    box.text = text; box.full = full; box.isRole = !info.notes.length;
    taken.push(box); out.push(box);
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  out.forEach(function(b){
    ctx.globalAlpha = THEME.alpha.labelPlate; ctx.fillStyle = THEME.bg;
    ctx.beginPath(); roundRectPath(ctx, b.x0, b.y0, b.x1-b.x0, b.y1-b.y0, 3); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = b.isRole ? THEME.textFaint : THEME.textMuted;
    ctx.fillText(b.text, b.cx, b.cy + 0.5);
  });
  ctx.textBaseline = 'alphabetic';
  return out;
}

function hideCanvasTooltip(){ var t = document.getElementById('canvas-tooltip'); if (t) t.hidden = true; }
function showCanvasTooltipAt(tip, sx, sy){
  tip.hidden = false;
  var w = tip.offsetWidth, hgt = tip.offsetHeight;
  tip.style.left = Math.max(4, Math.min(sx + 12, viewportWidth - w - 8)) + 'px';
  tip.style.top = (sy + 14 + hgt > viewportHeight - 4 ? Math.max(4, sy - hgt - 10) : sy + 14) + 'px';
}
/* Ребро в режиме «связями»: все механизмы между двумя объектами — название (ромб в цвете
   категории), направление «Источник → Приёмник» и описания участия. */
function edgeTooltipHTML(e){
  var a = state.objects[e.a.slice(4)], b = state.objects[e.b.slice(4)];
  if (!a || !b) return '';
  var ids = Array.from(e.mechanismIds).filter(function(id){ return state.mechanisms[id]; })
    .sort(function(x, y){ return state.mechanisms[x].title.localeCompare(state.mechanisms[y].title, 'ru'); });
  return ids.map(function(mid){
    var m = state.mechanisms[mid];
    function parts(o){ return m.participants.filter(function(p){ return p.objectId === o.id; }); }
    function dir(o, d){ return parts(o).some(function(p){ return roleInfo(p.role).direction === d; }); }
    var arrow;
    if (dir(a,'source') && dir(b,'target')) arrow = escapeHtml(a.name) + ' → ' + escapeHtml(b.name);
    else if (dir(b,'source') && dir(a,'target')) arrow = escapeHtml(b.name) + ' → ' + escapeHtml(a.name);
    else arrow = escapeHtml(a.name) + ' — ' + escapeHtml(b.name);
    var notes = [a, b].map(function(o){
      var n = parts(o).map(function(p){ return p.note; }).filter(Boolean);
      return n.length ? '<div class="ctip-note"><b>' + escapeHtml(o.name) + ':</b> ' + escapeHtml(n.join('; ')) + '</div>' : '';
    }).join('');
    return '<div class="ctip-mech"><div class="ctip-title"><span class="om-diamond" style="--c:' + categoryAccent(m.category) + '"></span>' + escapeHtml(m.title) + '</div>' +
      '<div class="ctip-dir">' + arrow + '</div>' + notes + '</div>';
  }).join('');
}
var graphTipKey = null;
function updateGraphTooltip(sx, sy, node, wp){
  var tip = document.getElementById('canvas-tooltip');
  if (dragNode || isPanning){ tip.hidden = true; graphTipKey = null; return; }
  var key = null, html = '';
  if (node){
    labelInfo(ctx2d, node);
    if (node._labelTruncated){ key = 'n:' + node.id; html = escapeHtml(node.label); }
  } else if (currentMode === 'collapsed'){
    var edge = hitTestEdge(wp.x, wp.y);
    if (edge){ key = 'e:' + edge.key; html = edgeTooltipHTML(edge); }
  }
  if (!key){
    /* Обрезанная подпись под курсором (сама плашка, не круг). */
    var lb = (lastLabels || []).filter(function(b){ return b.n._labelTruncated && sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1; })[0];
    if (lb){ key = 'n:' + lb.n.id; html = escapeHtml(lb.n.label); }
  }
  if (!key || !html){ tip.hidden = true; graphTipKey = null; return; }
  if (key !== graphTipKey){ tip.innerHTML = html; graphTipKey = key; }
  showCanvasTooltipAt(tip, sx, sy);
}
function updateCanvasTooltip(sx, sy){
  var tip = document.getElementById('canvas-tooltip');
  var b = edgeLabelBoxes.filter(function(b){ return b.full !== b.text && sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1; })[0];
  if (!b){ tip.hidden = true; return; }
  tip.textContent = b.full; graphTipKey = null;
  tip.style.left = Math.min(sx + 12, viewportWidth - 330) + 'px';
  tip.style.top = (sy + 14) + 'px';
  tip.hidden = false;
}

/* ===================== Мини-карта =====================
   Весь граф схематично + рамка видимой области; клик и перетаскивание переносят холст.
   По умолчанию свёрнута, если узлов меньше MINIMAP_AUTO_MIN_NODES (пока пользователь сам
   её не открыл или не свернул). */
var MINIMAP_AUTO_MIN_NODES = 30;
var MINIMAP_W = 180, MINIMAP_H = 120, MINIMAP_PAD = 8;
var minimapUserSet = false, minimapOpen = false, minimapXf = null;

function updateMinimapVisibility(){
  if (!minimapUserSet) minimapOpen = currentNodes.length >= MINIMAP_AUTO_MIN_NODES;
  var c = document.getElementById('minimap-canvas');
  if (!c) return;
  c.hidden = !minimapOpen;
  document.getElementById('minimap-toggle').setAttribute('aria-expanded', minimapOpen ? 'true' : 'false');
}

function drawMinimap(){
  var c = document.getElementById('minimap-canvas');
  if (!c || !minimapOpen || currentView !== 'graph') return;
  var dpr = window.devicePixelRatio || 1;
  if (c.width !== MINIMAP_W*dpr){ c.width = MINIMAP_W*dpr; c.height = MINIMAP_H*dpr; }
  var mc = c.getContext('2d');
  mc.setTransform(dpr,0,0,dpr,0,0);
  mc.clearRect(0,0,MINIMAP_W,MINIMAP_H);
  if (!currentNodes.length){ minimapXf = null; return; }
  var tl = screenToWorld(0,0), br = screenToWorld(viewportWidth, viewportHeight);
  var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  currentNodes.forEach(function(n){ minX=Math.min(minX,n.x); maxX=Math.max(maxX,n.x); minY=Math.min(minY,n.y); maxY=Math.max(maxY,n.y); });
  var bw = Math.max(1, maxX-minX), bh = Math.max(1, maxY-minY);
  var s = Math.min((MINIMAP_W - 2*MINIMAP_PAD)/bw, (MINIMAP_H - 2*MINIMAP_PAD)/bh);
  var ox = (MINIMAP_W - bw*s)/2 - minX*s, oy = (MINIMAP_H - bh*s)/2 - minY*s;
  minimapXf = {s:s, ox:ox, oy:oy};
  currentNodes.forEach(function(n){
    mc.fillStyle = n.kind === 'mechanism' ? categoryAccent(n.category) : typeColor(n.type);
    var r = n.kind === 'mechanism' ? 1.5 : 2;
    mc.fillRect(n.x*s + ox - r, n.y*s + oy - r, 2*r, 2*r);
  });
  /* Рамка видимой области; если она больше графа — обрезается краем мини-карты. */
  var rx0 = Math.max(1, tl.x*s + ox), ry0 = Math.max(1, tl.y*s + oy);
  var rx1 = Math.min(MINIMAP_W - 1, br.x*s + ox), ry1 = Math.min(MINIMAP_H - 1, br.y*s + oy);
  mc.strokeStyle = THEME.textMuted; mc.lineWidth = 1;
  if (rx1 > rx0 && ry1 > ry0) mc.strokeRect(rx0 + 0.5, ry0 + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
}

function bindMinimap(){
  var c = document.getElementById('minimap-canvas');
  document.getElementById('minimap-toggle').addEventListener('click', function(){
    minimapUserSet = true; minimapOpen = !minimapOpen;
    updateMinimapVisibility(); requestRender();
  });
  var dragging = false;
  function moveTo(ev){
    if (!minimapXf) return;
    var r = c.getBoundingClientRect();
    var wx = (ev.clientX - r.left - minimapXf.ox)/minimapXf.s, wy = (ev.clientY - r.top - minimapXf.oy)/minimapXf.s;
    cancelViewAnim();
    view.offsetX = viewportWidth/2 - wx*view.scale;
    view.offsetY = viewportHeight/2 - wy*view.scale;
    requestRender();
  }
  c.addEventListener('mousedown', function(ev){ dragging = true; moveTo(ev); ev.preventDefault(); });
  window.addEventListener('mousemove', function(ev){ if (dragging) moveTo(ev); });
  window.addEventListener('mouseup', function(){ dragging = false; });
}

/* ===================== Легенда ===================== */
function updateLegend(){
  var legend = document.getElementById('graph-legend');
  if (!legend) return;
  var typeSeen = {}, catSeen = {};
  Object.keys(state.objects).forEach(function(id){ var o = state.objects[id]; if (!isShown(o)) return; typeSeen[typeInfo(o.type) ? o.type : ''] = true; });
  if (currentMode === 'full') Object.keys(state.mechanisms).forEach(function(id){ if (isShown(state.mechanisms[id])) catSeen[state.mechanisms[id].category] = true; });
  var types = OBJECT_TYPES.filter(function(t){ return typeSeen[t.code]; });
  var cats = MECH_CATEGORIES.filter(function(c){ return catSeen[c.code]; });
  var html = '';
  if (types.length || typeSeen['']){
    html += '<p class="legend-group-title">Типы объектов</p>' + types.map(function(t){
      return '<div class="legend-item"><span class="dot" style="background:'+typeColor(t.code)+'"></span>'+escapeHtml(t.title)+'<span class="legend-tag">'+escapeHtml(t.short)+'</span></div>';
    }).join('');
    if (typeSeen['']) html += '<div class="legend-item"><span class="dot" style="background:'+THEME.typeUnknown+'"></span>'+UNKNOWN_TYPE_TITLE+'</div>';
  }
  if (cats.length){
    html += '<p class="legend-group-title">Категории механизмов</p>' + cats.map(function(c){
      return '<div class="legend-item"><span class="dot dot-diamond" style="--c:'+categoryAccent(c.code)+'"></span>'+escapeHtml(c.title)+'</div>';
    }).join('');
  }
  if (html){
    /* Линии — те же, что рисует холст (EDGE_DASH, edgeStyle). */
    var lines = currentMode === 'full'
      ? [['solid', 'Объект передаёт данные в механизм'], ['dashed', 'Механизм передаёт данные в объект'], ['dotted', 'Участие без направления (параметр, условие)']]
      : [['solid', 'Передача данных: от источника к приёмнику'], ['dotted', 'Связь без направления (параметр, условие)']];
    html += '<p class="legend-group-title">Связи</p>' + lines.map(function(l){
      var dash = EDGE_DASH[l[0]].join(' ');
      return '<div class="legend-item"><svg class="legend-line" viewBox="0 0 22 10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="currentColor" stroke-width="1.5"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : '') + (l[0] === 'dotted' ? ' stroke-linecap="round"' : '') + '/></svg>' + escapeHtml(l[1]) + '</div>';
    }).join('');
  }
  document.getElementById('legend-body').innerHTML = html;
  legend.hidden = !html;
}

