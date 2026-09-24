'use strict';

/* ===================== Проверки процесса =====================
   Считаются при каждом изменении, по всем путям от начала процесса; возвраты не повторяются —
   пути идут только по прямым переходам раскладки (process-layout.js), поэтому анализ линейный:
   - «заполнен на всех путях до шага» — пересечение по предшественникам (чтение до заполнения);
   - «используется хоть на одном пути после шага» — объединение по последователям.
   Проверки ничего не блокируют. Проблема: {level:'warn'|'info', text, stepId, cellKey?, rowKey?}. */

var CHECK_ICONS = { warn:'⚠', info:'ⓘ' };

function entityKey(type, id){ return type + ':' + id; }

function computeProcessChecks(proc){
  var L = processLayout(proc), byId = {}, problems = [];
  proc.steps.forEach(function(s){ byId[s.id] = s; });
  var reachable = function(id){ return !!proc.startStepId && L.comp[id] === 0; };
  var nums = L.numbers;
  function add(level, text, stepId, extra){
    var p = {level:level, text:text, stepId:stepId || null};
    if (extra) Object.keys(extra).forEach(function(k){ p[k] = extra[k]; });
    problems.push(p);
  }
  function attrName(id){ var a = state.attributes[id]; return a ? attributeDisplayName(a) : deletedName(id); }
  function objName(id){ var o = state.objects[id]; return o ? o.name : deletedName(id); }

  /* Прямые переходы (без возвратов) внутри основного блока. */
  var preds = {}, succs = {};
  proc.steps.forEach(function(s){ preds[s.id] = []; succs[s.id] = []; });
  L.edges.forEach(function(e){
    if (e.kind === 'fwd' && byId[e.to]){ succs[e.from].push(e.to); preds[e.to].push(e.from); }
  });
  var topo = L.order.filter(reachable);   /* колонка = самый длинный путь → порядок колонок топологический */

  /* Роли участия по шагам. */
  var fills = {}, reads = {}, ctrlAttrs = {};
  proc.steps.forEach(function(s){
    fills[s.id] = {}; reads[s.id] = {}; ctrlAttrs[s.id] = {};
    s.participants.forEach(function(p){
      if (p.entityType !== 'attribute') return;
      if (p.role === 'fill') fills[s.id][p.entityId] = true;
      if (p.role === 'read') reads[s.id][p.entityId] = true;
    });
    stepControls(s).forEach(function(c){ c.targets.forEach(function(t){ if (t.entityType === 'attribute') ctrlAttrs[s.id][t.entityId] = true; }); });
  });

  /* 1. Чтение до заполнения: на каком-то пути реквизит читается раньше, чем заполняется. */
  var filledAnywhere = {}, fillStep = {};
  topo.forEach(function(id){ Object.keys(fills[id]).forEach(function(a){ filledAnywhere[a] = true; if (!fillStep[a]) fillStep[a] = id; }); });
  var inFilled = {}, outFilled = {};
  topo.forEach(function(id){
    var inn = null;
    preds[id].filter(reachable).forEach(function(p){
      var o = outFilled[p] || {};
      if (!inn){ inn = {}; Object.keys(o).forEach(function(k){ inn[k] = true; }); }
      else Object.keys(inn).forEach(function(k){ if (!o[k]) delete inn[k]; });
    });
    inFilled[id] = inn || {};
    var out = {}; Object.keys(inFilled[id]).forEach(function(k){ out[k] = true; });
    Object.keys(fills[id]).forEach(function(k){ out[k] = true; });
    outFilled[id] = out;
    Object.keys(reads[id]).forEach(function(a){
      if (filledAnywhere[a] && !inFilled[id][a] && !fills[id][a])
        add('warn', 'Реквизит «' + attrName(a) + '» читается до заполнения (заполняется на шаге ' + nums[fillStep[a]] + ')', id, {cellKey:id + '|' + entityKey('attribute', a)});
    });
  });

  /* 2. Заполнен, но не используется: дальше ни на одном пути не читается и не контролируется. */
  var usedAfter = {};
  topo.slice().reverse().forEach(function(id){
    var u = {};
    succs[id].filter(reachable).forEach(function(v){
      [reads[v], ctrlAttrs[v], usedAfter[v] || {}].forEach(function(set){ Object.keys(set).forEach(function(k){ u[k] = true; }); });
    });
    usedAfter[id] = u;
    Object.keys(fills[id]).forEach(function(a){
      if (!u[a] && !ctrlAttrs[id][a])
        add('warn', 'Реквизит «' + attrName(a) + '» заполняется, но дальше не читается и не контролируется', id, {cellKey:id + '|' + entityKey('attribute', a)});
    });
  });

  /* 3. Изменяется без контроля: объект создаётся или изменяется, но ни один контроль процесса
        не нацелен ни на него, ни на его реквизиты. */
  var controlled = {};
  proc.steps.forEach(function(s){
    stepControls(s).forEach(function(c){ c.targets.forEach(function(t){
      if (t.entityType === 'object') controlled[t.entityId] = true;
      else { var a = state.attributes[t.entityId]; if (a) controlled[a.objectId] = true; }
    }); });
  });
  var modified = {};
  L.order.forEach(function(id){
    byId[id].participants.forEach(function(p){
      if (p.entityType === 'object' && (p.role === 'create' || p.role === 'update') && !modified[p.entityId]) modified[p.entityId] = id;
    });
  });
  Object.keys(modified).forEach(function(o){
    if (!controlled[o]) add('warn', 'Объект «' + objName(o) + '» ' + 'создаётся или изменяется без контроля', modified[o], {rowKey:entityKey('object', o)});
  });

  /* 4. Структура. */
  var canEnd = {};
  var changed = true;
  while (changed){
    changed = false;
    proc.steps.forEach(function(s){
      if (canEnd[s.id]) return;
      if (stepEdges(s).some(function(e){ return !e.to || !byId[e.to] || canEnd[e.to]; })){ canEnd[s.id] = true; changed = true; }
    });
  }
  L.order.forEach(function(id){
    var s = byId[id];
    if (s.kind === 'decision' && (s.outcomes || []).length < 2) add('warn', 'У решения меньше двух исходов', id);
    if (s.kind === 'user_action' && (!s.roleId || !state.roles[s.roleId])) add('warn', s.roleId ? 'Роль шага удалена' : 'У действия пользователя не указана роль', id);
    if (!reachable(id)) add('warn', 'Шаг недостижим от начала процесса', id);
    else if (!canEnd[id]) add('warn', 'Из шага нет пути к завершению процесса (цикл без выхода)', id);
  });

  /* 5. Готовность: шаг опирается на механизм «в разработке», а ручного контроля на шаге нет. */
  L.order.forEach(function(id){
    var s = byId[id];
    if (stepControls(s).some(function(c){ return c.source === 'manual'; })) return;
    var dev = [];
    s.participants.forEach(function(p){ if (p.entityType === 'mechanism' && isDevStatus(refStatus('mechanism', p.entityId))) dev.push(p.entityId); });
    stepControls(s).forEach(function(c){ if (c.source === 'mechanism' && isDevStatus(refStatus('mechanism', c.sourceId))) dev.push(c.sourceId); });
    if (dev.length) add('info', 'Шаг опирается на механизм «' + state.mechanisms[dev[0]].title + '» в разработке' + (dev.length > 1 ? ' (и ещё ' + (dev.length - 1) + ')' : '') + ', ручного контроля нет', id);
  });

  var byStep = {}, byCell = {}, byRow = {};
  problems.forEach(function(p){
    if (p.stepId) (byStep[p.stepId] = byStep[p.stepId] || []).push(p);
    if (p.cellKey) (byCell[p.cellKey] = byCell[p.cellKey] || []).push(p);
    if (p.rowKey) (byRow[p.rowKey] = byRow[p.rowKey] || []).push(p);
  });
  /* Порядок списка — по шагам ленты. */
  problems.sort(function(a, b){ return L.order.indexOf(a.stepId) - L.order.indexOf(b.stepId) || (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1); });
  return {problems:problems, byStep:byStep, byCell:byCell, byRow:byRow, layout:L};
}

/* Значок с подсказкой: ⚠ — есть предупреждения, иначе ⓘ. */
function checksBadgeHTML(list, cls){
  if (!list || !list.length) return '';
  var level = list.some(function(p){ return p.level === 'warn'; }) ? 'warn' : 'info';
  return '<span class="check-badge is-' + level + (cls ? ' ' + cls : '') + '" title="' + escapeHtml(list.map(function(p){ return CHECK_ICONS[p.level] + ' ' + p.text; }).join('\n')) + '">' +
    CHECK_ICONS[level] + (list.length > 1 ? '<span class="check-count">' + list.length + '</span>' : '') + '</span>';
}
