'use strict';

/* ===================== Процессы: данные =====================
   Коллекция state.processes: {id, name, description, subsystem, subsystems[], ownerRoleId,
   startStepId, steps[]}. Подсистемы хранятся как у объекта: subsystems[] + subsystem = первая.
   Шаг: {id, name, description, kind, roleId, next, participants[], controls[]}.
   Порядок шагов задаётся только ссылками startStepId / next; массив steps — неупорядоченное
   хранилище. В этой фазе процессы линейные (решения и ветки — фаза 5). */

var STEP_KINDS = [
  {code:'user_action', title:'Действие пользователя'},
  {code:'auto_action', title:'Автоматическое действие'},
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

/* Шаги в порядке next от startStepId. Шаги, до которых нельзя дойти (в линейном процессе
   их быть не должно), добавляются в конец в порядке массива, чтобы не потеряться. */
function orderedSteps(proc){
  var out = [], seen = {}, cur = proc.startStepId;
  while (cur && !seen[cur]){
    var s = stepById(proc, cur); if (!s) break;
    seen[cur] = true; out.push(s); cur = s.next;
  }
  proc.steps.forEach(function(s){ if (!seen[s.id]) out.push(s); });
  return out;
}
/* Номер шага (1…N) в порядке ленты. */
function stepNumbers(proc){
  var n = {};
  orderedSteps(proc).forEach(function(s, i){ n[s.id] = i + 1; });
  return n;
}
/* Перестроить ссылки линейного процесса по заданному порядку. */
function relinkLinear(proc, list){
  proc.startStepId = list.length ? list[0].id : null;
  list.forEach(function(s, i){ s.next = i < list.length - 1 ? list[i + 1].id : null; });
}
/* Вставить новый шаг после afterId (null — в начало). */
function insertStep(proc, afterId){
  var list = orderedSteps(proc), s = newStep();
  var i = afterId ? list.findIndex(function(x){ return x.id === afterId; }) + 1 : 0;
  proc.steps.push(s);
  list.splice(i, 0, s);
  relinkLinear(proc, list);
  return s;
}
/* Удалить шаг: next предыдущего сшивается с последующим. */
function removeStep(proc, stepId){
  var list = orderedSteps(proc).filter(function(s){ return s.id !== stepId; });
  proc.steps = proc.steps.filter(function(s){ return s.id !== stepId; });
  relinkLinear(proc, list);
}
/* Сдвинуть шаг на позицию влево (-1) или вправо (+1). */
function moveStep(proc, stepId, dir){
  var list = orderedSteps(proc), i = list.findIndex(function(s){ return s.id === stepId; }), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  var t = list[i]; list[i] = list[j]; list[j] = t;
  relinkLinear(proc, list);
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
    if (!(r.proc.id in idx)){ idx[r.proc.id] = byProc.length; byProc.push({proc:r.proc, nums:[], owner:false}); }
    var g = byProc[idx[r.proc.id]];
    if (!r.step) g.owner = true;
    else { var n = stepNumbers(r.proc)[r.step.id]; if (g.nums.indexOf(n) < 0) g.nums.push(n); }
  });
  return '<p>Используется в процессах: ' + byProc.map(function(g){
    var parts = [];
    if (g.nums.length) parts.push((g.nums.length === 1 ? 'шаг ' : 'шаги ') + g.nums.sort(function(a,b){ return a - b; }).join(', '));
    if (g.owner) parts.push('владелец процесса');
    return '«' + escapeHtml(g.proc.name) + '» — ' + parts.join(', ');
  }).join('; ') + '. Ссылка останется с пометкой «⚠ Удалено».</p>';
}
