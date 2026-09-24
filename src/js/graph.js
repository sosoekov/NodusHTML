'use strict';

/* ===================== Построение графа ===================== */

function addEdge(map, from, to, directed, mechanismId){
  if (from === to) return;
  var pair = [from, to].sort();
  var key = pair.join('|||');
  var e = map.get(key);
  if (!e){
    e = {key:key, a:pair[0], b:pair[1], mechanismIds:new Set(), abDirected:false, baDirected:false};
    map.set(key, e);
  }
  e.mechanismIds.add(mechanismId);
  if (directed){
    if (from === e.a && to === e.b) e.abDirected = true;
    else if (from === e.b && to === e.a) e.baDirected = true;
  }
}

function buildGraph(mode){
  var nodes = [];
  var edgesMap = new Map();

  Object.keys(state.objects).forEach(function(id){
    var o = state.objects[id];
    if (!isShown(o)) return;
    nodes.push({id:'obj:'+id, refId:id, kind:'object', type:o.type, label:o.name, status:o.status, fx:o.fx, fy:o.fy});
  });

  var mechIds = Object.keys(state.mechanisms).filter(function(mid){ return isShown(state.mechanisms[mid]); });

  if (mode === 'full'){
    mechIds.forEach(function(mid){
      var m = state.mechanisms[mid];
      nodes.push({id:'mech:'+m.id, refId:m.id, kind:'mechanism', category:m.category, label:m.title, status:m.status, fx:m.fx, fy:m.fy});
      m.participants.forEach(function(p){
        if (!p.objectId || !state.objects[p.objectId] || !isShown(state.objects[p.objectId])) return;
        var role = roleInfo(p.role);
        var from, to, directed;
        if (role.direction === 'source'){ from='obj:'+p.objectId; to='mech:'+m.id; directed=true; }
        else if (role.direction === 'target'){ from='mech:'+m.id; to='obj:'+p.objectId; directed=true; }
        else { from='obj:'+p.objectId; to='mech:'+m.id; directed=false; }
        addEdge(edgesMap, from, to, directed, m.id);
      });
    });
  } else {
    mechIds.forEach(function(mid){
      var m = state.mechanisms[mid];
      var validParts = m.participants.filter(function(p){ return p.objectId && state.objects[p.objectId] && isShown(state.objects[p.objectId]); });
      var byDir = {source:[], target:[], neutral:[]};
      validParts.forEach(function(p){ byDir[roleInfo(p.role).direction].push(p); });
      if (byDir.source.length && byDir.target.length){
        byDir.source.forEach(function(s){
          byDir.target.forEach(function(t){ addEdge(edgesMap, 'obj:'+s.objectId, 'obj:'+t.objectId, true, m.id); });
        });
        byDir.neutral.forEach(function(n){
          byDir.target.forEach(function(t){ addEdge(edgesMap, 'obj:'+n.objectId, 'obj:'+t.objectId, false, m.id); });
        });
      } else {
        for (var i=0; i<validParts.length; i++){
          for (var j=i+1; j<validParts.length; j++){
            addEdge(edgesMap, 'obj:'+validParts[i].objectId, 'obj:'+validParts[j].objectId, false, m.id);
          }
        }
      }
    });
  }
  return {nodes:nodes, edges:Array.from(edgesMap.values())};
}

/* Вес объекта = число разных связанных с ним объектов + число механизмов, где он участвует.
   Вес механизма = число разных объектов-участников. Не зависит от режима отображения. */
function computeWeights(){
  var neighbors = {}, mechCount = {}, mechWeight = {};
  Object.keys(state.mechanisms).forEach(function(mid){
    var seen = {}, ids = [];
    state.mechanisms[mid].participants.forEach(function(p){
      if (p.objectId && state.objects[p.objectId] && !seen[p.objectId]){ seen[p.objectId] = true; ids.push(p.objectId); }
    });
    mechWeight[mid] = ids.length;
    ids.forEach(function(a){
      mechCount[a] = (mechCount[a]||0) + 1;
      var set = neighbors[a] || (neighbors[a] = new Set());
      ids.forEach(function(b){ if (b !== a) set.add(b); });
    });
  });
  var objWeight = {};
  Object.keys(state.objects).forEach(function(id){
    objWeight[id] = (neighbors[id] ? neighbors[id].size : 0) + (mechCount[id] || 0);
  });
  return {objects:objWeight, mechanisms:mechWeight};
}

/* Разброс случайного начального положения растёт с числом узлов,
   иначе тысяча узлов стартует в одной точке и долго разлетается. */
function initialSpread(count, minHalf){ return Math.max(minHalf, 25*Math.sqrt(count)); }

function syncGraphModel(){
  var built = buildGraph(currentMode);
  var spread = initialSpread(built.nodes.length, 130);
  var freshIds = new Set(built.nodes.map(function(n){return n.id;}));
  Array.from(nodeById.keys()).forEach(function(id){ if (!freshIds.has(id)) nodeById.delete(id); });
  built.nodes.forEach(function(fn){
    var existing = nodeById.get(fn.id);
    if (!existing){
      nodeById.set(fn.id, {
        id:fn.id, refId:fn.refId, kind:fn.kind, type:fn.type, category:fn.category,
        label:fn.label, status:fn.status,
        x:(Math.random()-0.5)*2*spread, y:(Math.random()-0.5)*2*spread,
        vx:0, vy:0, fx:fn.fx, fy:fn.fy
      });
    } else {
      existing.label = fn.label; existing.status = fn.status;
      existing.type = fn.type; existing.category = fn.category;
      existing.fx = fn.fx; existing.fy = fn.fy;
    }
  });
  currentNodes = built.nodes.map(function(fn){ return nodeById.get(fn.id); });
  currentEdges = built.edges;
  buildMechIndex();
  updateLegend();
  var weights = computeWeights();
  currentNodes.forEach(function(n){
    n.weight = (n.kind==='mechanism' ? weights.mechanisms[n.refId] : weights.objects[n.refId]) || 0;
  });
  /* Порядок, в котором подписи претендуют на место: сначала «тяжёлые». */
  if (focusMode && !focusMode.exiting) refreshFocusLayout();
  updateMinimapVisibility();
  labelOrder = currentNodes.slice().sort(function(a,b){
    return (b.weight - a.weight) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  sim.alpha = Math.max(sim.alpha, 0.35);
  requestRender();
}

/* ===================== Симуляция сил ===================== */

/* Отталкивание считается через квадродерево (Barnes–Hut): далёкая группа узлов
   действует как один узел в своём центре масс. O(n log n) вместо O(n²). */
var BH_THETA_SQ = 0.81;
var BH_MAX_DEPTH = 40;

function bhCell(x0, y0, size){ return {x0:x0, y0:y0, size:size, mass:0, cx:0, cy:0, node:null, children:null}; }

function bhInsert(cell, n){
  var depth = 0;
  while (true){
    cell.cx = (cell.cx*cell.mass + n.x) / (cell.mass+1);
    cell.cy = (cell.cy*cell.mass + n.y) / (cell.mass+1);
    cell.mass++;
    if (cell.mass === 1 && !cell.children){ cell.node = n; return; }
    if (depth >= BH_MAX_DEPTH) return; /* совпадающие точки: копим только массу */
    if (!cell.children){
      var half = cell.size/2;
      cell.children = [
        bhCell(cell.x0, cell.y0, half), bhCell(cell.x0+half, cell.y0, half),
        bhCell(cell.x0, cell.y0+half, half), bhCell(cell.x0+half, cell.y0+half, half)
      ];
      var old = cell.node; cell.node = null;
      var oc = bhChild(cell, old);
      oc.node = old; oc.mass = 1; oc.cx = old.x; oc.cy = old.y;
    }
    cell = bhChild(cell, n);
    depth++;
  }
}
function bhChild(cell, n){
  var half = cell.size/2;
  return cell.children[(n.x >= cell.x0+half ? 1 : 0) + (n.y >= cell.y0+half ? 2 : 0)];
}

function buildQuadTree(nodes){
  var minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  nodes.forEach(function(n){
    if (n.x<minX) minX=n.x; if (n.x>maxX) maxX=n.x;
    if (n.y<minY) minY=n.y; if (n.y>maxY) maxY=n.y;
  });
  var root = bhCell(minX-1, minY-1, Math.max(maxX-minX, maxY-minY) + 2);
  nodes.forEach(function(n){ bhInsert(root, n); });
  return root;
}

function tickSimulation(){
  var n = currentNodes.length;
  if (n === 0) return;
  var kk = 900*900;
  var root = buildQuadTree(currentNodes);
  var stack = [];
  for (var i=0;i<n;i++){
    var ni = currentNodes[i];
    var fx=0, fy=0;
    stack.length = 0; stack.push(root);
    while (stack.length){
      var c = stack.pop();
      if (c.mass === 0 || c.node === ni && c.mass === 1) continue;
      var dx = ni.x-c.cx, dy = ni.y-c.cy;
      var distSq = dx*dx+dy*dy;
      if (c.children && c.size*c.size >= BH_THETA_SQ*distSq){
        for (var q=0;q<4;q++) stack.push(c.children[q]);
        continue;
      }
      var mass = c.node === ni ? c.mass-1 : c.mass;
      if (distSq < 0.02){ dx=(Math.random()-0.5); dy=(Math.random()-0.5); distSq=1; }
      var dist = Math.sqrt(distSq);
      var force = mass*kk/distSq;
      fx += (dx/dist)*force; fy += (dy/dist)*force;
    }
    ni.vx += fx*0.0022*sim.alpha; ni.vy += fy*0.0022*sim.alpha;
  }
  var restLength = 150, springK = 0.02;
  currentEdges.forEach(function(e){
    var a = nodeById.get(e.a), b = nodeById.get(e.b);
    if (!a || !b) return;
    var dx=b.x-a.x, dy=b.y-a.y;
    var dist = Math.sqrt(dx*dx+dy*dy) || 1;
    var force = (dist-restLength)*springK*sim.alpha;
    var fx=(dx/dist)*force, fy=(dy/dist)*force;
    a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
  });
  var cx=0, cy=0;
  currentNodes.forEach(function(nd){ cx+=nd.x; cy+=nd.y; });
  cx/=n; cy/=n;
  currentNodes.forEach(function(nd){
    nd.vx += (0-cx)*0.0007; nd.vy += (0-cy)*0.0007;
  });
  currentNodes.forEach(function(nd){
    if (nd.fx !== null && nd.fx !== undefined && nd.fy !== null && nd.fy !== undefined){
      nd.x = nd.fx; nd.y = nd.fy; nd.vx=0; nd.vy=0; return;
    }
    nd.vx *= 0.84; nd.vy *= 0.84;
    nd.x += nd.vx; nd.y += nd.vy;
  });
  sim.alpha *= (1-sim.alphaDecay);
}

/* ===================== Подсветка ===================== */

/* ===================== Фокус (выделение / наведение) =====================
   Три уровня: центр и его прямые участники (first) — 100%; соседи второго порядка
   (second: другие механизмы тех же объектов и их участники) — 55%; остальное — 35%.
   Уровни считаются по механизмам-гиперрёбрам, а не по нарисованным рёбрам, поэтому
   одинаковы в обоих режимах графа. */
var mechIndex = { byObject:new Map(), parts:new Map() };

function buildMechIndex(){
  var byObject = new Map(), parts = new Map();
  Object.keys(state.mechanisms).forEach(function(mid){
    var seen = {}, list = [];
    state.mechanisms[mid].participants.forEach(function(p){
      if (p.objectId && state.objects[p.objectId] && !seen[p.objectId]){ seen[p.objectId] = true; list.push(p.objectId); }
    });
    parts.set(mid, list);
    list.forEach(function(oid){ (byObject.get(oid) || byObject.set(oid, []).get(oid)).push(mid); });
  });
  mechIndex = { byObject:byObject, parts:parts };
}

function addSecondOrder(first, second, objIds, skipMechs){
  objIds.forEach(function(oid){
    (mechIndex.byObject.get(oid) || []).forEach(function(mid){
      if (skipMechs.has(mid)) return;
      if (!first.has('mech:'+mid)) second.add('mech:'+mid);
      (mechIndex.parts.get(mid) || []).forEach(function(o2){ if (!first.has('obj:'+o2)) second.add('obj:'+o2); });
    });
  });
}

function objectFocus(oid){
  var center = 'obj:'+oid, first = new Set([center]), second = new Set();
  var mechs = new Set(mechIndex.byObject.get(oid) || []);
  var peers = [];
  mechs.forEach(function(mid){
    first.add('mech:'+mid);
    (mechIndex.parts.get(mid) || []).forEach(function(o){ first.add('obj:'+o); if (o !== oid) peers.push(o); });
  });
  addSecondOrder(first, second, peers, mechs);
  return {kind:'node', id:center, center:center, set:first, second:second};
}

function mechanismFocus(mid){
  var center = 'mech:'+mid, first = new Set([center]), second = new Set();
  var parts = mechIndex.parts.get(mid) || [];
  parts.forEach(function(o){ first.add('obj:'+o); });
  addSecondOrder(first, second, parts, new Set([mid]));
  return {kind:'mechanism', id:mid, center: currentMode==='full' ? center : null, set:first, second:second};
}

function nodeFocus(nid){
  if (nid.indexOf('mech:') === 0) return mechanismFocus(nid.slice(5));
  return objectFocus(nid.slice(4));
}

function getFocus(){
  var f = null;
  if (focusMode){
    f = mechanismFocus(focusMode.mechId);
    f.focusMode = true; f.second = new Set();
    if (hoverId && hoverId !== f.center) f.hover = hoverId;
    return f;
  }
  if (pinnedMechanismId && state.mechanisms[pinnedMechanismId]) f = mechanismFocus(pinnedMechanismId);
  else if (pinnedEdgeKey){
    var e = currentEdges.filter(function(x){return x.key===pinnedEdgeKey;})[0];
    if (e){
      var first = new Set([e.a, e.b]), second = new Set();
      e.mechanismIds.forEach(function(mid){
        first.add('mech:'+mid);
        (mechIndex.parts.get(mid) || []).forEach(function(o){ if (!first.has('obj:'+o)) second.add('obj:'+o); });
      });
      f = {kind:'edge', key:pinnedEdgeKey, center:null, set:first, second:second};
    }
  }
  else if (pinnedNodeId && nodeById.has(pinnedNodeId)) f = nodeFocus(pinnedNodeId);
  /* Выбор кликом (не наведение): у приглушённых узлов скрываются и подписи. */
  if (f) f.pinned = true;
  else if (hoverId) f = nodeFocus(hoverId);
  else if (listHover && listHover.kind === 'object' && state.objects[listHover.id]) f = objectFocus(listHover.id);
  else if (listHover && listHover.kind === 'mechanism' && state.mechanisms[listHover.id]) f = mechanismFocus(listHover.id);
  /* Наведение на чип/участника в карточке: без выделения — подсветка объекта, при
     выделении — рамка и подпись узла, а для участника ещё и его ребро. */
  if (graphHint && graphHint.objId && state.objects[graphHint.objId]){
    if (!f) f = objectFocus(graphHint.objId);
    f.hint = 'obj:' + graphHint.objId;
    if (graphHint.mechId) f.hintMech = graphHint.mechId;
  } else if (graphHint && graphHint.mechOnly && state.mechanisms[graphHint.mechOnly]){
    /* Наведение на механизм в карточке объекта: подсвечиваются рёбра механизма. */
    if (!f) f = mechanismFocus(graphHint.mechOnly);
    f.hintMechAll = graphHint.mechOnly;
    if (currentMode === 'full') f.hint = 'mech:' + graphHint.mechOnly;
  }
  /* Наведение поверх закреплённого выделения: подсветку не меняет, но подпись
     узла под курсором показывается (см. layoutLabels). */
  if (f && hoverId && hoverId !== f.center) f.hover = hoverId;
  else if (f && f.hint && f.hint !== f.center) f.hover = f.hint;
  return f;
}

function nodeAlpha(id, focus){
  if (focus.focusMode) return focus.set.has(id) ? THEME.alpha.nodeActive : THEME.alpha.focusOther;
  if (id === focus.center) return THEME.alpha.nodeActive;
  if (focus.set.has(id)) return THEME.alpha.nodeNeighbor;
  if (focus.second.has(id)) return THEME.alpha.nodeSecond;
  return THEME.alpha.nodeBackground;
}

function isEdgeHighlighted(e, focus){
  if (!focus) return false;
  if (focus.hintMechAll){
    if (currentMode === 'full'){ var hmid = 'mech:'+focus.hintMechAll; return e.a === hmid || e.b === hmid; }
    return e.mechanismIds.has(focus.hintMechAll);
  }
  if (focus.hintMech){
    /* Ребро участника: объект ↔ механизм (или рёбра этого механизма у объекта без режима механизмов). */
    var touches = e.a === focus.hint || e.b === focus.hint;
    if (currentMode === 'full'){ var hm = 'mech:'+focus.hintMech; return touches && (e.a === hm || e.b === hm); }
    return touches && e.mechanismIds.has(focus.hintMech);
  }
  if (focus.kind==='edge') return e.key===focus.key;
  if (focus.kind==='node') return e.a===focus.id || e.b===focus.id;
  if (focus.kind==='mechanism'){
    if (currentMode==='full'){ var mid='mech:'+focus.id; return e.a===mid || e.b===mid; }
    return e.mechanismIds.has(focus.id);
  }
  return false;
}

/* ===================== Подписи узлов =====================
   Подпись — на плашке цвета холста; у механизма над ромбом, у объекта под кругом.
   Приоритет места: центр выделения > его участники > узел под курсором > узлы
   с большей степенью > остальные. Эти три первые группы подписаны всегда: если
   основная позиция занята, пробуются запасные (сверху/снизу/сбоку). Остальные
   подписи при пересечении скрываются и при отдалении гаснут, начиная с «лёгких». */
var LABEL_MIN_PX = 7;
var LABEL_FADE_PX = 3;
var LABEL_CELL = 64;
var LABEL_PAD_X = 5;
var LABEL_H = 18;          /* высота плашки в одну строку */
var LABEL_LINE_H = 14;     /* каждая следующая строка */
var LABEL_GAP = 4;
var LABEL_MAX_CHARS = 24;  /* ширина строки подписи, символов */
var LABEL_MAX_LINES = 2;

/* Перенос по словам: до LABEL_MAX_LINES строк по LABEL_MAX_CHARS символов;
   не поместилось — многоточие (полный текст — во всплывающей подсказке). */
function wrapLabel(text){
  var words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
  var lines = [], cur = '', i = 0;
  while (i < words.length && lines.length < LABEL_MAX_LINES){
    var w = words[i];
    if (!cur && w.length > LABEL_MAX_CHARS){ lines.push(w.slice(0, LABEL_MAX_CHARS)); words[i] = w.slice(LABEL_MAX_CHARS); continue; }
    var next = cur ? cur + ' ' + w : w;
    if (next.length <= LABEL_MAX_CHARS){ cur = next; i++; }
    else { lines.push(cur); cur = ''; }
  }
  if (cur && lines.length < LABEL_MAX_LINES) lines.push(cur);
  var truncated = i < words.length;
  if (truncated){
    var last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length >= LABEL_MAX_CHARS ? last.slice(0, LABEL_MAX_CHARS - 1) : last).replace(/\s+$/, '') + '…';
  }
  return {lines:lines, truncated:truncated};
}
function labelInfo(ctx, n){
  if (n._labelFor !== n.label){
    var wr = wrapLabel(n.label);
    n._labelLines = wr.lines; n._labelTruncated = wr.truncated;
    n._labelW = Math.max.apply(null, wr.lines.map(function(l){ return ctx.measureText(l).width; }).concat([0]));
    n._labelFor = n.label;
  }
  return n;
}
function labelWidth(ctx, n){ return labelInfo(ctx, n)._labelW; }
function labelHeight(n){ return LABEL_H + ((n._labelLines ? n._labelLines.length : 1) - 1)*LABEL_LINE_H; }

function labelCandidates(n, forced, w){
  var r = nodeRadius(n)*view.scale;
  var sx = n.x*view.scale + view.offsetX, sy = n.y*view.scale + view.offsetY;
  var h = labelHeight(n);
  var below = {cx:sx, cy:sy + r + LABEL_GAP + h/2};
  var above = {cx:sx, cy:sy - r - LABEL_GAP - h/2};
  var list = n.kind==='mechanism' ? [above, below] : [below, above];
  if (!forced) return list;
  var right = {cx:sx + r + LABEL_GAP + w/2, cy:sy}, left = {cx:sx - r - LABEL_GAP - w/2, cy:sy};
  var below2 = {cx:sx, cy:below.cy + h + 2}, above2 = {cx:sx, cy:above.cy - h - 2};
  var dr = {cx:right.cx, cy:below.cy}, dl = {cx:left.cx, cy:below.cy}, ur = {cx:right.cx, cy:above.cy}, ul = {cx:left.cx, cy:above.cy};
  return list.concat([right, left, dr, dl, ur, ul, below2, above2]);
}

function layoutLabels(ctx, focus){
  ctx.font = THEME.labelFont;
  var placed = [], grid = new Map(), done = new Set();
  function cells(b, fn){
    for (var gx=Math.floor(b.x0/LABEL_CELL); gx<=Math.floor(b.x1/LABEL_CELL); gx++)
      for (var gy=Math.floor(b.y0/LABEL_CELL); gy<=Math.floor(b.y1/LABEL_CELL); gy++) if (fn(gx+':'+gy)) return true;
    return false;
  }
  function overlaps(b){
    return cells(b, function(key){
      var list = grid.get(key);
      return !!list && list.some(function(o){ return b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0; });
    });
  }
  function add(b){
    cells(b, function(key){ (grid.get(key) || grid.set(key, []).get(key)).push(b); return false; });
    placed.push(b);
  }
  function box(n, c, w, alpha){
    var h = labelHeight(n);
    return {x0:c.cx - w/2, x1:c.cx + w/2, y0:c.cy - h/2, y1:c.cy + h/2, cx:c.cx, cy:c.cy, n:n, alpha:alpha};
  }
  function onScreen(b){ return !(b.x1 < 0 || b.x0 > viewportWidth || b.y1 < 0 || b.y0 > viewportHeight); }
  function place(n, forced, alpha){
    if (done.has(n.id)) return;
    var w = labelWidth(ctx, n) + 2*LABEL_PAD_X;
    var cands = labelCandidates(n, forced, w);
    for (var i=0; i<cands.length; i++){
      var b = box(n, cands[i], w, alpha);
      if (!onScreen(b)) continue;
      if (!overlaps(b)){ add(b); done.add(n.id); return; }
    }
    if (forced){
      var b0 = box(n, cands[0], w, alpha);
      if (onScreen(b0)){ add(b0); done.add(n.id); }
    }
  }
  function fadeAlpha(n){
    var sizePx = labelRadius(n)*view.scale;
    if (sizePx < LABEL_MIN_PX) return 0;
    return Math.min(1, (sizePx-LABEL_MIN_PX)/LABEL_FADE_PX + 0.25);
  }

  if (focus && focus.focusMode){
    if (focus.center && nodeById.has(focus.center)) place(nodeById.get(focus.center), true, 1);
    labelOrder.forEach(function(n){ if (focus.set.has(n.id)) place(n, true, 1); });
    if (focus.hover && nodeById.has(focus.hover)) place(nodeById.get(focus.hover), true, 1);
    return placed;
  }
  if (focus){
    if (focus.center && nodeById.has(focus.center)) place(nodeById.get(focus.center), true, 1);
    labelOrder.forEach(function(n){ if (focus.set.has(n.id)) place(n, true, 1); });
    if (focus.hover && nodeById.has(focus.hover)) place(nodeById.get(focus.hover), true, 1);
    if (focus.pinned) return placed;
    labelOrder.forEach(function(n){
      if (!focus.second.has(n.id)) return;
      var a = fadeAlpha(n); if (a) place(n, false, Math.max(THEME.alpha.labelBackground, a*THEME.alpha.labelSecond));
    });
    labelOrder.forEach(function(n){
      var a = fadeAlpha(n); if (a) place(n, false, THEME.alpha.labelBackground);
    });
    return placed;
  }
  if (graphFilter || processOverlay){
    /* Сначала место под подписи отобранных, потом — остальных. */
    labelOrder.forEach(function(n){ if (inGraphSelection(n.id)){ var a = fadeAlpha(n); if (a) place(n, false, a); } });
    labelOrder.forEach(function(n){ if (!inGraphSelection(n.id)){ var a = fadeAlpha(n); if (a) place(n, false, a*THEME.alpha.labelBackground); } });
    return placed;
  }
  labelOrder.forEach(function(n){ var a = fadeAlpha(n); if (a) place(n, false, a); });
  return placed;
}

function roundRectPath(ctx, x, y, w, h, r){
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
}

function drawLabels(ctx, labels){
  ctx.font = THEME.labelFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach(function(b){
    /* Плашка всегда плотная — чтобы и бледная подпись читалась поверх узлов. */
    ctx.globalAlpha = THEME.alpha.labelPlate;
    ctx.fillStyle = THEME.bg;
    ctx.beginPath(); roundRectPath(ctx, b.x0, b.y0, b.x1-b.x0, b.y1-b.y0, 3); ctx.fill();
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = THEME.text;
    var lines = b.n._labelLines || [b.n.label];
    var y = b.cy - (lines.length - 1)*LABEL_LINE_H/2 + 0.5;
    lines.forEach(function(l, i){ ctx.fillText(l, b.cx, y + i*LABEL_LINE_H); });
  });
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

/* ===================== Отрисовка ===================== */

function screenToWorld(sx, sy){ return { x:(sx-view.offsetX)/view.scale, y:(sy-view.offsetY)/view.scale }; }

function drawGrid(ctx){
  var spacing = 50;
  var tl = screenToWorld(0,0), br = screenToWorld(viewportWidth, viewportHeight);
  var cols = (br.x-tl.x)/spacing, rows = (br.y-tl.y)/spacing;
  while (cols*rows > 3000 && spacing < 4000){ spacing*=2; cols=(br.x-tl.x)/spacing; rows=(br.y-tl.y)/spacing; }
  var startX = Math.floor(tl.x/spacing)*spacing, startY = Math.floor(tl.y/spacing)*spacing;
  ctx.fillStyle = THEME.grid;
  ctx.beginPath();
  for (var x=startX; x<br.x; x+=spacing){
    for (var y=startY; y<br.y; y+=spacing){
      ctx.moveTo(x+1.1, y); ctx.arc(x,y,1.1,0,Math.PI*2);
    }
  }
  ctx.fill();
}

/* Круг не меньше NODE_MIN_R, чтобы в него помещалась метка типа (12px). */
var NODE_MIN_R = 16, NODE_MAX_R = 40;
function radiusForWeight(w){ return Math.min(NODE_MAX_R, 8 + 4*Math.sqrt(w || 0)); }
function nodeRadius(n){
  if (n.kind==='mechanism') return 12;
  return Math.max(NODE_MIN_R, radiusForWeight(n.weight));
}
/* Радиус, по которому решается видимость подписи: у механизма ромб постоянного
   размера, но подпись гаснет по числу участников — как у объекта того же веса. */
function labelRadius(n){ return radiusForWeight(n.weight); }

/* Отрисовка пакетами: элементы одного стиля собираются в один path и рисуются
   одним fill/stroke — на тысячах узлов это в разы быстрее поштучных вызовов. */

function diamondPath(ctx, x, y, r){
  ctx.moveTo(x, y-r); ctx.lineTo(x+r, y); ctx.lineTo(x, y+r); ctx.lineTo(x-r, y); ctx.closePath();
}

function drawFocusBrackets(ctx, x, y, half){
  var len = 8;
  ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.6;
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(c){
    var sx=c[0], sy=c[1];
    var cx = x+sx*half, cy = y+sy*half;
    ctx.beginPath(); ctx.moveTo(cx-sx*len, cy); ctx.lineTo(cx,cy); ctx.lineTo(cx, cy-sy*len); ctx.stroke();
  });
}

function arrowheadPath(ctx, fromX, fromY, toX, toY){
  var angle = Math.atan2(toY-fromY, toX-fromX);
  var size = 7;
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size*Math.cos(angle-Math.PI/6), toY - size*Math.sin(angle-Math.PI/6));
  ctx.lineTo(toX - size*Math.cos(angle+Math.PI/6), toY - size*Math.sin(angle+Math.PI/6));
  ctx.closePath();
}

function edgeGeometry(e){
  var a = nodeById.get(e.a), b = nodeById.get(e.b);
  var ra = nodeRadius(a), rb = nodeRadius(b);
  var dx=b.x-a.x, dy=b.y-a.y, dist=Math.hypot(dx,dy)||1;
  var ux=dx/dist, uy=dy/dist;
  return {e:e, sx:a.x+ux*ra, sy:a.y+uy*ra, ex:b.x-ux*rb, ey:b.y-uy*rb};
}

/* Стиль ребра по роли. С механизмами: источник → механизм — сплошная,
   механизм → приёмник — пунктир, роль без направления (Параметр, Условие) — точки.
   Без механизмов (объект → объект): направленная связь — сплошная, без направления — точки. */
var EDGE_DASH = { solid:[], dashed:[6,4], dotted:[1.5,3.5] };

function edgeStyle(e){
  if (currentMode === 'full'){
    var aIsMech = e.a.indexOf('mech:') === 0;
    var objToMech = aIsMech ? e.baDirected : e.abDirected;
    var mechToObj = aIsMech ? e.abDirected : e.baDirected;
    if (objToMech) return 'solid';
    if (mechToObj) return 'dashed';
    return 'dotted';
  }
  return (e.abDirected || e.baDirected) ? 'solid' : 'dotted';
}

function drawEdgeBatch(ctx, list, hl, alpha, style){
  if (!list.length) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = hl ? THEME.accent : THEME.edge;
  ctx.lineWidth = hl ? 2 : 1;
  ctx.setLineDash(EDGE_DASH[style].map(function(d){ return d/view.scale; }));
  ctx.lineCap = style === 'dotted' ? 'round' : 'butt';
  ctx.beginPath();
  list.forEach(function(g){ ctx.moveTo(g.sx,g.sy); ctx.lineTo(g.ex,g.ey); });
  ctx.stroke();
  ctx.setLineDash([]); ctx.lineCap = 'butt';

  ctx.fillStyle = hl ? THEME.accent : THEME.arrow;
  ctx.beginPath();
  list.forEach(function(g){
    if (g.e.abDirected) arrowheadPath(ctx, g.sx,g.sy,g.ex,g.ey);
    if (g.e.baDirected) arrowheadPath(ctx, g.ex,g.ey,g.sx,g.sy);
  });
  ctx.fill();

  var multi = list.filter(function(g){ return g.e.mechanismIds.size > 1; });
  if (!multi.length) return;
  ctx.beginPath();
  multi.forEach(function(g){
    var mx=(g.sx+g.ex)/2, my=(g.sy+g.ey)/2;
    ctx.moveTo(mx+9, my); ctx.arc(mx,my,9,0,Math.PI*2);
  });
  ctx.fillStyle = THEME.bg; ctx.fill();
  ctx.strokeStyle = THEME.badgeStroke; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle = THEME.accent; ctx.font = THEME.badgeFont;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  multi.forEach(function(g){ ctx.fillText(String(g.e.mechanismIds.size), (g.sx+g.ex)/2, (g.sy+g.ey)/2+0.5); });
  ctx.textBaseline='alphabetic';
}

/* Рёбра группируются по (подсветка, прозрачность, стиль) и рисуются от самых
   бледных к подсвеченным. Прозрачность обычного ребра — как у более бледного конца. */
function drawEdges(ctx, edges, focus){
  var groups = new Map();
  edges.forEach(function(e){
    var hl = !!focus && isEdgeHighlighted(e, focus);
    var alpha;
    if (focus) alpha = hl ? 1 : Math.min(nodeAlpha(e.a, focus), nodeAlpha(e.b, focus));
    else if (graphFilter || processOverlay) alpha = (!graphFilter || graphFilter.edge(e)) && (!processOverlay || overlayEdgeIn(e)) ? 1 :
      (graphFilter ? THEME.alpha.edgeFiltered : THEME.alpha.nodeBackground);
    else alpha = 1;
    var style = edgeStyle(e);
    var key = (hl?1:0) + '|' + alpha + '|' + style;
    var g = groups.get(key) || groups.set(key, {hl:hl, alpha:alpha, style:style, list:[]}).get(key);
    g.list.push(edgeGeometry(e));
  });
  Array.from(groups.values())
    .sort(function(a,b){ return (a.hl - b.hl) || (a.alpha - b.alpha); })
    .forEach(function(g){ drawEdgeBatch(ctx, g.list, g.hl, g.alpha, g.style); });
  ctx.globalAlpha = 1;
}

/* Узлы одного прохода имеют одну базовую прозрачность; приглушённые рисуются
   первым проходом, чтобы не перекрывать узлы в фокусе. */
function drawNodeBatch(ctx, nodes, baseAlpha){
  var fills = new Map(), stubs = [], mechs = new Map();
  nodes.forEach(function(n){
    if (n.kind==='mechanism'){
      var color = categoryAccent(n.category);
      (mechs.get(color) || mechs.set(color, []).get(color)).push(n);
      return;
    }
    var key = typeColor(n.type) + '|' + (n.status==='deprecated' ? THEME.alpha.deprecated : 1);
    (fills.get(key) || fills.set(key, []).get(key)).push(n);
    if (n.status==='stub') stubs.push(n);
  });
  fills.forEach(function(list, key){
    var parts = key.split('|');
    ctx.globalAlpha = baseAlpha * Number(parts[1]);
    ctx.fillStyle = parts[0];
    ctx.beginPath();
    list.forEach(function(n){ var r = nodeRadius(n); ctx.moveTo(n.x+r, n.y); ctx.arc(n.x,n.y,r,0,Math.PI*2); });
    ctx.fill();
  });
  if (stubs.length){
    ctx.globalAlpha = baseAlpha;
    ctx.setLineDash([3,3]); ctx.strokeStyle=THEME.stubStroke; ctx.lineWidth=1.4;
    ctx.beginPath();
    stubs.forEach(function(n){ var r = nodeRadius(n); ctx.moveTo(n.x+r, n.y); ctx.arc(n.x,n.y,r,0,Math.PI*2); });
    ctx.stroke(); ctx.setLineDash([]);
  }
  /* Метки типа только у неприглушённых узлов: в бледном круге они читаются как шум. */
  if (baseAlpha >= 1) drawTypeTags(ctx, fills, baseAlpha);
  mechs.forEach(function(list, color){
    ctx.globalAlpha = baseAlpha;
    ctx.beginPath();
    list.forEach(function(n){ diamondPath(ctx, n.x, n.y, nodeRadius(n)); });
    ctx.fillStyle = THEME.panel; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

/* Метка типа внутри круга: экранный размер как у подписей (12px); рисуется, только
   если помещается в круг на текущем масштабе. */
var TYPE_TAG_PAD = 2;
var typeTagWidthCache = {};
function typeTagWidth(ctx, text){
  if (typeTagWidthCache[text] === undefined){
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.font = THEME.typeTagWeight + ' ' + THEME.labelSize + 'px ' + THEME.sans;
    typeTagWidthCache[text] = ctx.measureText(text).width;
    ctx.restore();
  }
  return typeTagWidthCache[text];
}
function drawTypeTags(ctx, fills, baseAlpha){
  var scale = view.scale;
  ctx.font = THEME.typeTagWeight + ' ' + (THEME.labelSize/scale) + 'px ' + THEME.sans;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.nodeText;
  fills.forEach(function(list, key){
    ctx.globalAlpha = baseAlpha * Number(key.split('|')[1]);
    list.forEach(function(n){
      var tag = typeShort(n.type);
      if (!tag) return;
      if (typeTagWidth(ctx, tag) + TYPE_TAG_PAD > 2*nodeRadius(n)*scale) return;
      ctx.fillText(tag, n.x, n.y + 0.5/scale);
    });
  });
  ctx.textBaseline = 'alphabetic';
}

function drawNodes(ctx, nodes, focus){
  if (!focus && (graphFilter || processOverlay)){
    /* Отбор левой панели — до «отфильтровано», наложение процесса — до «фона». */
    drawNodeBatch(ctx, nodes.filter(function(n){ return !inGraphSelection(n.id); }), graphFilter ? THEME.alpha.nodeFiltered : THEME.alpha.nodeBackground);
    drawNodeBatch(ctx, nodes.filter(function(n){ return inGraphSelection(n.id); }), 1);
    return;
  }
  if (!focus){ drawNodeBatch(ctx, nodes, 1); return; }
  /* Слои от бледных к ярким: фон → второй порядок → участники → центр. */
  var layers = new Map();
  nodes.forEach(function(n){
    var a = nodeAlpha(n.id, focus);
    var key = (n.id === focus.center ? 3 : focus.set.has(n.id) ? 2 : focus.second.has(n.id) ? 1 : 0);
    (layers.get(key) || layers.set(key, {alpha:a, list:[]}).get(key)).list.push(n);
  });
  [0,1,2,3].forEach(function(k){ var l = layers.get(k); if (l) drawNodeBatch(ctx, l.list, l.alpha); });
  nodes.forEach(function(n){
    var showBracket = (focus.hint === n.id) ||
      (focus.kind==='node' && focus.id===n.id) ||
      (focus.kind==='mechanism' && n.id===('mech:'+focus.id)) ||
      (focus.kind==='edge' && focus.set.has(n.id));
    if (showBracket) drawFocusBrackets(ctx, n.x, n.y, nodeRadius(n)+6);
  });
}

var lastLabels = [];
function render(){
  var focus = getFocus();
  ctx2d.save();
  ctx2d.clearRect(0,0,viewportWidth, viewportHeight);
  ctx2d.translate(view.offsetX, view.offsetY);
  ctx2d.scale(view.scale, view.scale);
  drawGrid(ctx2d);
  /* Отсечение: не рисуем то, что целиком за пределами экрана. */
  var tl = screenToWorld(0,0), br = screenToWorld(viewportWidth, viewportHeight);
  var pad = 60;
  var x0 = tl.x-pad, y0 = tl.y-pad, x1 = br.x+pad, y1 = br.y+pad;
  drawEdges(ctx2d, currentEdges.filter(function(e){
    var a = nodeById.get(e.a), b = nodeById.get(e.b);
    if (!a || !b) return false;
    return !((a.x<x0 && b.x<x0) || (a.x>x1 && b.x>x1) || (a.y<y0 && b.y<y0) || (a.y>y1 && b.y>y1));
  }), focus);
  drawNodes(ctx2d, currentNodes.filter(function(n){
    return n.x>=x0 && n.x<=x1 && n.y>=y0 && n.y<=y1;
  }), focus);
  ctx2d.restore();
  var labels = layoutLabels(ctx2d, focus);
  lastLabels = labels;
  drawLabels(ctx2d, labels);
  edgeLabelBoxes = focusMode ? drawFocusEdgeLabels(ctx2d, labels) : [];
  drawProcessBadges(ctx2d);
  drawMinimap();
}

function requestRender(){
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(function(){
    renderRequested = false;
    /* В фокус-режиме физика стоит: раскладка фокуса временная и не должна плыть. */
    if (!focusMode && sim.alpha > sim.alphaMin){ tickSimulation(); requestRender(); }
    else maybeInitialFit();
    render();
  });
}

/* ===================== Взаимодействие с канвасом ===================== */

function hitTestNode(wx, wy){
  for (var i=currentNodes.length-1; i>=0; i--){
    var n = currentNodes[i];
    var r = nodeRadius(n) + 3;
    var dx = wx-n.x, dy = wy-n.y;
    if (dx*dx+dy*dy <= r*r) return n;
  }
  return null;
}
function pointToSegmentDist(px,py,x1,y1,x2,y2){
  var dx=x2-x1, dy=y2-y1;
  var lenSq = dx*dx+dy*dy;
  var t = lenSq===0 ? 0 : ((px-x1)*dx+(py-y1)*dy)/lenSq;
  t = Math.max(0, Math.min(1,t));
  var cx=x1+t*dx, cy=y1+t*dy;
  return Math.hypot(px-cx, py-cy);
}
function hitTestEdge(wx, wy){
  var threshold = 6/view.scale;
  for (var i=0;i<currentEdges.length;i++){
    var e = currentEdges[i];
    var a = nodeById.get(e.a), b = nodeById.get(e.b);
    if (!a || !b) continue;
    if (pointToSegmentDist(wx,wy,a.x,a.y,b.x,b.y) <= threshold) return e;
  }
  return null;
}

function persistNodePosition(node){
  if (node.kind==='object'){
    var o = state.objects[node.refId];
    if (o){ o.fx = node.x; o.fy = node.y; }
  } else {
    var m = state.mechanisms[node.refId];
    if (m){ m.fx = node.x; m.fy = node.y; }
  }
  persist();
}

function onMouseDown(ev){
  cancelViewAnim();
  var rect = canvasEl.getBoundingClientRect();
  var sx = ev.clientX-rect.left, sy = ev.clientY-rect.top;
  /* Бейдж шагов процесса (наложение) — переход в «Процессы». */
  if (processBadgeClick(sx, sy)) return;
  var w = screenToWorld(sx,sy);
  var node = hitTestNode(w.x,w.y);
  mouseDownPos = {sx:sx, sy:sy}; didDrag = false;
  if (node){
    dragNode = node;
  } else {
    isPanning = true;
    panStart = {sx:sx, sy:sy, offsetX:view.offsetX, offsetY:view.offsetY};
    canvasEl.style.cursor = 'grabbing';
  }
}
function onMouseMove(ev){
  var rect = canvasEl.getBoundingClientRect();
  var sx = ev.clientX-rect.left, sy = ev.clientY-rect.top;
  if (mouseDownPos){
    var moved = Math.hypot(sx-mouseDownPos.sx, sy-mouseDownPos.sy);
    if (moved > 3) didDrag = true;
  }
  if (dragNode){
    if (focusMode) return; /* в фокусе узлы не перетаскиваются — раскладка временная */
    var w = screenToWorld(sx,sy);
    dragNode.x = w.x; dragNode.y = w.y; dragNode.fx = w.x; dragNode.fy = w.y; dragNode.vx=0; dragNode.vy=0;
    requestRender();
    return;
  }
  if (isPanning){
    view.offsetX = panStart.offsetX + (sx-panStart.sx);
    view.offsetY = panStart.offsetY + (sy-panStart.sy);
    requestRender();
    return;
  }
  var wp = screenToWorld(sx,sy);
  var node = hitTestNode(wp.x,wp.y);
  if (focusMode) updateCanvasTooltip(sx, sy);
  else updateGraphTooltip(sx, sy, node, wp);
  var newHoverId = node ? node.id : null;
  if (newHoverId !== hoverId){
    hoverId = newHoverId;
    canvasEl.style.cursor = node ? 'pointer' : (hitTestEdge(wp.x,wp.y) ? 'pointer' : 'grab');
    requestRender();
  }
}
function onMouseUp(ev){
  var rect = canvasEl.getBoundingClientRect();
  var sx = ev.clientX-rect.left, sy = ev.clientY-rect.top;
  var w = screenToWorld(sx,sy);
  if (dragNode){
    if (!didDrag || focusMode){
      if (!didDrag) selectNode(dragNode);
    } else {
      persistNodePosition(dragNode);
      sim.alpha = Math.max(sim.alpha, 0.2);
      requestRender();
    }
    dragNode = null;
  } else if (isPanning){
    if (!didDrag){
      var edge = hitTestEdge(w.x,w.y);
      if (edge) selectEdge(edge); else clearSelection();
    }
    isPanning = false;
    canvasEl.style.cursor = 'grab';
  }
  mouseDownPos = null; didDrag = false;
}
function onDblClick(ev){
  var rect = canvasEl.getBoundingClientRect();
  var w = screenToWorld(ev.clientX-rect.left, ev.clientY-rect.top);
  var node = hitTestNode(w.x, w.y);
  if (node && node.kind === 'mechanism') enterFocus(node.refId);
}
function onWheel(ev){
  ev.preventDefault();
  cancelViewAnim();
  var rect = canvasEl.getBoundingClientRect();
  var sx = ev.clientX-rect.left, sy = ev.clientY-rect.top;
  var before = screenToWorld(sx,sy);
  var factor = Math.exp(-ev.deltaY*0.001);
  view.scale = clampScale(view.scale*factor);
  view.offsetX = sx - before.x*view.scale;
  view.offsetY = sy - before.y*view.scale;
  requestRender();
}

function selectNode(node){
  if (node.kind === 'object'){
    pinnedNodeId = node.id; pinnedMechanismId = null; pinnedEdgeKey = null;
    renderObjectPanel(state.objects[node.refId]);
  } else {
    pinnedMechanismId = node.refId; pinnedNodeId = null; pinnedEdgeKey = null;
    renderMechanismPanel(state.mechanisms[node.refId]);
  }
  syncSidebarActive();
  requestRender();
}
function selectEdge(edge){
  pinnedEdgeKey = edge.key; pinnedNodeId = null; pinnedMechanismId = null;
  renderEdgePanel(edge);
  syncSidebarActive();
  requestRender();
}
function clearSelection(){
  pinnedNodeId = null; pinnedEdgeKey = null; pinnedMechanismId = null;
  showPanel(null);
  /* В «Процессах» пустой панели нет: возвращаемся к карточке шага или процесса. */
  if (currentView === 'process') showProcessDefaultPanel();
  syncSidebarActive();
  requestRender();
}

function switchView(view){
  if (focusMode) exitFocus(true);
  var prev = currentView;
  currentView = view;
  document.body.classList.toggle('view-list', view === 'list');
  document.body.classList.toggle('view-process', view === 'process');
  var main = document.getElementById('main');
  var listView = document.getElementById('list-view');
  document.getElementById('process-view').hidden = view !== 'process';
  if (prev === 'process' && view !== 'process') leaveProcessView();
  if (view === 'process'){
    main.hidden = true;
    listView.hidden = true;
    enterProcessView();
    updateDetailPanelVisibility();
  } else if (view === 'list'){
    main.hidden = true;
    listView.hidden = false;
    /* Ребро в «Списке» не показывается — его карточку закрываем, выбор объекта/механизма сохраняется. */
    if (pinnedEdgeKey) clearSelection();
    renderListView();
    updateDetailPanelVisibility();
    scrollActiveListRowIntoView();
  } else {
    listView.hidden = true;
    main.hidden = false;
    updateDetailPanelVisibility();
    resizeCanvas();
  }
}

