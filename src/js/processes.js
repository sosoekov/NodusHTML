'use strict';

/* ===================== Процессы: данные =====================
   Коллекция state.processes: {id, name, description, subsystem, subsystems[], ownerRoleId,
   startStepId, steps[]}. Подсистемы хранятся как у объекта: subsystems[] + subsystem = первая.
   Шаг: {id, name, description, kind, roleId, next, outcomes?, participants[], controls[]}.
   Порядок шагов задаётся только ссылками startStepId / next / outcomes[].next; массив steps —
   неупорядоченное хранилище. У решения (kind = decision) next не используется: переходы —
   outcomes [{id, label, next}], 2 и больше; next = null — «Завершение процесса».
   Раскладка ленты и номера шагов — process-layout.js. */

var STEP_KINDS = [
  {code:'user_action', title:'Действие пользователя'},
  {code:'auto_action', title:'Автоматическое действие'},
  {code:'decision',    title:'Решение'},
  {code:'event',       title:'Событие'}
];
var DEFAULT_STEP_KIND = 'user_action';
function stepKindTitle(code){
  var k = STEP_KINDS.filter(function(x){ return x.code === code; })[0];
  return k ? k.title : code;
}

/* Роли участия в шаге и их буквы (для чипов ленты и, позже, матрицы). */
var PARTICIPATION_ROLES = {
  object: [
    {code:'create', title:'создаёт',   letter:'С'},
    {code:'update', title:'изменяет',  letter:'И'},
    {code:'read',   title:'читает',    letter:'Ч'},
    {code:'post',   title:'проводит',  letter:'П'},
    {code:'close',  title:'закрывает', letter:'Х'}
  ],
  attribute: [
    {code:'fill',   title:'заполняет', letter:'З'},
    {code:'update', title:'изменяет',  letter:'И'},
    {code:'read',   title:'читает',    letter:'Ч'}
  ],
  mechanism: [
    {code:'run',  title:'запускается',               letter:''},
    {code:'auto', title:'срабатывает автоматически', letter:''}
  ]
};
var PARTICIPANT_TYPES = [
  {code:'mechanism', title:'Механизмы'},
  {code:'object',    title:'Объекты'},
  {code:'attribute', title:'Реквизиты'}
];
function participationRole(entityType, code){
  return (PARTICIPATION_ROLES[entityType] || []).filter(function(r){ return r.code === code; })[0] || {code:code, title:code, letter:'?'};
}

function allProcesses(){ return Object.keys(state.processes).map(function(id){ return state.processes[id]; }); }

function newStep(partial){
  return {
    id:uid('step'), name:(partial && partial.name) || 'Новый шаг', description:'',
    kind:(partial && partial.kind) || DEFAULT_STEP_KIND, roleId:'', next:null,
    participants:[], controls:[]
  };
}
function createProcess(partial){
  var first = newStep();
  var p = {
    id:uid('proc'), name:(partial && partial.name) || 'Новый процесс', description:'',
    subsystem:'', subsystems:[], ownerRoleId:'',
    startStepId:first.id, steps:[first]
  };
  state.processes[p.id] = p;
  persist();
  return p;
}
function stepById(proc, id){ return proc.steps.filter(function(s){ return s.id === id; })[0] || null; }

/* Переходы шага: [{to, outIdx, label}]; у обычного шага один (outIdx = -1), у решения — по исходам. */
function stepEdges(s){
  if (s.kind === 'decision') return (s.outcomes || []).map(function(o, i){ return {to:o.next || null, outIdx:i, label:o.label}; });
  return [{to:s.next || null, outIdx:-1, label:''}];
}
/* «Следующий» шаг: у решения — цель первого исхода. */
function stepSuccessor(s){ var e = stepEdges(s)[0]; return e ? e.to : null; }
function newOutcome(label, next){ return {id:uid('out'), label:label, next:next || null}; }

/* Шаги в порядке чтения ленты (колонка, затем строка); недостижимые — в конце. */
function orderedSteps(proc){
  var L = processLayout(proc);
  return L.order.map(function(id){ return stepById(proc, id); });
}
/* Номера шагов: по колонке, внутри колонки — по строке (4, 4а, 4б); недостижимые — «—». */
function stepNumbers(proc){ return processLayout(proc).numbers; }

/* Кто ссылается на шаг: [{step, outIdx}] (outIdx = -1 — next), start — шаг первый в процессе. */
function incomingRefs(proc, id){
  var out = [];
  proc.steps.forEach(function(x){
    stepEdges(x).forEach(function(e){ if (e.to === id) out.push({step:x, outIdx:e.outIdx, label:e.label}); });
  });
  return out;
}
/* Ссылки на несуществующие шаги → «Завершение процесса». */
function sanitizeProcess(proc){
  var ids = {}; proc.steps.forEach(function(x){ ids[x.id] = true; });
  proc.steps.forEach(function(x){
    if (x.kind === 'decision') (x.outcomes || []).forEach(function(o){ if (o.next && !ids[o.next]) o.next = null; });
    else if (x.next && !ids[x.next]) x.next = null;
  });
  if (proc.startStepId && !ids[proc.startStepId]) proc.startStepId = proc.steps.length ? proc.steps[0].id : null;
}
/* Вставить новый шаг на переход fromId (outIdx — исход решения, -1 — next); fromId = null — в начало. */
function insertOnEdge(proc, fromId, outIdx){
  var s = newStep();
  proc.steps.push(s);
  var from = fromId ? stepById(proc, fromId) : null;
  if (!from){ s.next = proc.startStepId || null; proc.startStepId = s.id; }
  else if (from.kind === 'decision' && from.outcomes[outIdx]){ s.next = from.outcomes[outIdx].next; from.outcomes[outIdx].next = s.id; }
  else { s.next = from.next; from.next = s.id; }
  return s;
}
/* Удалить шаг: все ссылки на него (next, исходы, начало) переводятся на его следующий шаг,
   а если следующего нет — на «Завершение процесса». */
function removeStep(proc, stepId){
  var s = stepById(proc, stepId); if (!s) return;
  var succ = stepSuccessor(s); if (succ === stepId) succ = null;
  proc.steps = proc.steps.filter(function(x){ return x.id !== stepId; });
  function redirect(ref, ownerId){ return ref !== stepId ? ref : (succ === ownerId ? null : succ); }
  proc.steps.forEach(function(x){
    if (x.kind === 'decision') (x.outcomes || []).forEach(function(o){ o.next = redirect(o.next, x.id); });
    else x.next = redirect(x.next, x.id);
  });
  if (proc.startStepId === stepId) proc.startStepId = succ;
  sanitizeProcess(proc);
}
/* Смена вида шага. В решение: next становится первым исходом «Да», второй исход — пустой
   («Завершение процесса»). Из решения: next = цель первого исхода, остальные исходы удаляются. */
function setStepKind(s, code){
  if (code === 'decision' && s.kind !== 'decision'){ s.outcomes = [newOutcome('Да', s.next), newOutcome('Нет', null)]; s.next = null; }
  else if (code !== 'decision' && s.kind === 'decision'){ s.next = stepSuccessor(s); delete s.outcomes; }
  s.kind = code;
}
/* Сдвиг внутри цепочки: шаг и соседний — обычные (не решения), сосед связан только с ним. */
function canMoveRight(proc, s){
  if (!s || s.kind === 'decision' || !s.next) return false;
  var v = stepById(proc, s.next);
  if (!v || v.kind === 'decision' || v.next === s.id) return false;
  var inc = incomingRefs(proc, v.id);
  return inc.length === 1 && inc[0].step === s && proc.startStepId !== v.id;
}
function moveRight(proc, s){
  var v = stepById(proc, s.next), after = v.next;
  proc.steps.forEach(function(x){
    if (x === v) return;
    if (x.kind === 'decision') (x.outcomes || []).forEach(function(o){ if (o.next === s.id) o.next = v.id; });
    else if (x.next === s.id) x.next = v.id;
  });
  if (proc.startStepId === s.id) proc.startStepId = v.id;
  v.next = s.id; s.next = after;
}
function plainPredecessor(proc, s){
  var inc = incomingRefs(proc, s.id);
  return inc.length === 1 && inc[0].outIdx < 0 ? inc[0].step : null;
}
function canMoveLeft(proc, s){ var p = plainPredecessor(proc, s); return !!p && canMoveRight(proc, p); }
function moveStep(proc, stepId, dir){
  var s = stepById(proc, stepId);
  if (dir > 0){ if (!canMoveRight(proc, s)) return false; moveRight(proc, s); }
  else { if (!canMoveLeft(proc, s)) return false; moveRight(proc, plainPredecessor(proc, s)); }
  return true;
}

/* ----- Участники шага: подписи и ссылки ----- */

function attributeDisplayName(a){
  var o = state.objects[a.objectId];
  return (o ? o.name : '?') + ' · ' + a.name;
}
/* {label, iconHTML, broken} для участника; удалённая сущность — broken с последним названием. */
function participantInfo(p){
  var e;
  if (p.entityType === 'mechanism' && (e = state.mechanisms[p.entityId]))
    return {label:e.title, iconHTML:'<span class="om-diamond" style="--c:' + categoryAccent(e.category) + '"></span>'};
  if (p.entityType === 'object' && (e = state.objects[p.entityId]))
    return {label:e.name, iconHTML:'<span class="dot" style="background:' + typeColor(e.type) + '"></span>'};
  if (p.entityType === 'attribute' && (e = state.attributes[p.entityId])){
    var o = state.objects[e.objectId];
    return {label:attributeDisplayName(e), iconHTML:'<span class="dot" style="background:' + (o ? typeColor(o.type) : THEME.typeUnknown) + '"></span>', title:attributeFullName(e)};
  }
  return {label:'⚠ Удалено: ' + deletedName(p.entityId), iconHTML:'', broken:true};
}

/* ----- Контроли шага -----
   step.controls: [{source:'mechanism'|'manual', sourceId, targets:[{entityType:'object'|'attribute', entityId}],
   reaction, note}]. Автоматический контроль — ссылка на механизм, ручной — на state.controls. */
var CONTROL_REACTIONS = [
  {code:'block',  title:'Блокирует',     letter:'Б'},
  {code:'warn',   title:'Предупреждает', letter:'П'},
  {code:'inform', title:'Информирует',   letter:'И'}
];
function controlReaction(code){ return CONTROL_REACTIONS.filter(function(r){ return r.code === code; })[0] || CONTROL_REACTIONS[2]; }
function stepControls(s){ return s.controls || (s.controls = []); }
function controlRefType(c){ return c.source === 'mechanism' ? 'mechanism' : 'control'; }
/* {label, iconHTML, broken, temp} для контроля шага; temp — механизм, который заменит ручной контроль. */
function stepControlInfo(c){
  var auto = c.source === 'mechanism', e = auto ? state.mechanisms[c.sourceId] : state.controls[c.sourceId];
  var info = {label:e ? (auto ? e.title : e.name) : '⚠ Удалено: ' + deletedName(c.sourceId), iconHTML:shieldIconSVG(auto), broken:!e, auto:auto};
  if (!auto && e && e.replacedByMechanismId) info.temp = controlRefText(e.replacedByMechanismId, 'mechanisms', 'title');
  return info;
}
function targetsText(c){
  return c.targets.map(function(t){ return participantInfo(t).label; }).join(', ');
}
/* Где используется ручной контроль: [{proc, step, num, reaction}]. */
function controlProcessUses(ctrlId){
  var out = [];
  allProcesses().forEach(function(proc){
    var nums = stepNumbers(proc);
    orderedSteps(proc).forEach(function(s){
      stepControls(s).forEach(function(c){
        if (c.source === 'manual' && c.sourceId === ctrlId) out.push({proc:proc, step:s, num:nums[s.id], reaction:c.reaction});
      });
    });
  });
  return out;
}

/* ----- Готовность -----
   «В проме» — статусы из READY_STATUSES (по фазе 0: active — «В продуктиве» и у объектов, и у
   механизмов, и у ручных контролей). Всё прочее, кроме «устаревшего», — «в разработке». */
var READY_STATUSES = ['active'];
function isReadyStatus(st){ return READY_STATUSES.indexOf(st) >= 0; }
function isDevStatus(st){ return st !== null && !isReadyStatus(st) && st !== 'deprecated'; }
/* Статус по ссылке; у реквизита — статус его объекта; удалённая сущность — null. */
function refStatus(entityType, id){
  var e = null;
  if (entityType === 'mechanism') e = state.mechanisms[id];
  else if (entityType === 'object') e = state.objects[id];
  else if (entityType === 'attribute'){ var a = state.attributes[id]; e = a ? state.objects[a.objectId] : null; }
  else if (entityType === 'control') e = state.controls[id];
  return e ? (e.status || '') : null;
}
/* Индикатор шага: по механизмам-участникам и автоматическим контролям.
   level: 'full' ● — все в проме; 'part' ◐ — часть в разработке; 'none' ○ — все в разработке; null — их нет. */
function stepReadiness(s){
  var seen = {}, total = 0, dev = 0;
  function add(id){
    if (seen[id]) return; seen[id] = true;
    var st = refStatus('mechanism', id); if (st === null) return;
    total++; if (isDevStatus(st)) dev++;
  }
  s.participants.forEach(function(p){ if (p.entityType === 'mechanism') add(p.entityId); });
  stepControls(s).forEach(function(c){ if (c.source === 'mechanism') add(c.sourceId); });
  return {total:total, dev:dev, level:!total ? null : (!dev ? 'full' : (dev === total ? 'none' : 'part'))};
}
/* Шаг готов, если ни один его механизм и автоконтроль не в разработке (шаг без них — ручной, тоже готов). */
function isStepReady(s){ var l = stepReadiness(s).level; return l === null || l === 'full'; }
function processReadiness(proc){ return {ready:proc.steps.filter(isStepReady).length, total:proc.steps.length}; }
/* «Только в проме»: у шага были механизмы или контроли, но в проме не осталось ни одного. */
function isManualWorkStep(s){
  var had = 0, left = 0;
  function count(type, id){ var st = refStatus(type, id); if (st === null) return; had++; if (isReadyStatus(st)) left++; }
  s.participants.forEach(function(p){ if (p.entityType === 'mechanism') count('mechanism', p.entityId); });
  stepControls(s).forEach(function(c){ count(controlRefType(c), c.sourceId); });
  return had > 0 && left === 0;
}

/* ----- Ссылочная целостность -----
   Где в процессах используется сущность: [{proc, step|null}] (step = null — владелец процесса).
   Учитываются участники, роль шага, источники и цели контролей шага. */
function stepRefersTo(s, entityType, id){
  if (entityType === 'role') return s.roleId === id;
  if (s.participants.some(function(p){ return p.entityType === entityType && p.entityId === id; })) return true;
  return stepControls(s).some(function(c){
    if (c.sourceId === id && controlRefType(c) === entityType) return true;
    return c.targets.some(function(t){ return t.entityType === entityType && t.entityId === id; });
  });
}
function processRefsTo(entityType, id){
  var out = [];
  allProcesses().forEach(function(proc){
    if (entityType === 'role' && proc.ownerRoleId === id) out.push({proc:proc, step:null});
    orderedSteps(proc).forEach(function(s){ if (stepRefersTo(s, entityType, id)) out.push({proc:proc, step:s}); });
  });
  return out;
}
/* Абзац предупреждения при удалении: «Используется в процессах: «Подбор персонала» — шаги 1, 6». */
function processRefsWarningHTML(refs){
  if (!refs.length) return '';
  var byProc = [], idx = {};
  refs.forEach(function(r){
    if (!(r.proc.id in idx)){ idx[r.proc.id] = byProc.length; byProc.push({proc:r.proc, ids:[], owner:false}); }
    var g = byProc[idx[r.proc.id]];
    if (!r.step) g.owner = true;
    else if (g.ids.indexOf(r.step.id) < 0) g.ids.push(r.step.id);
  });
  return '<p>Используется в процессах: ' + byProc.map(function(g){
    var parts = [], L = processLayout(g.proc);
    var nums = g.ids.sort(function(a, b){ return L.order.indexOf(a) - L.order.indexOf(b); }).map(function(id){ return L.numbers[id]; });
    if (nums.length) parts.push((nums.length === 1 ? 'шаг ' : 'шаги ') + nums.join(', '));
    if (g.owner) parts.push('владелец процесса');
    return '«' + escapeHtml(g.proc.name) + '» — ' + parts.join(', ');
  }).join('; ') + '. Ссылка останется с пометкой «⚠ Удалено».</p>';
}
