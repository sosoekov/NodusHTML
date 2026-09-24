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

/* ----- Ссылочная целостность -----
   Где в процессах используется сущность: [{proc, step|null, what}] (step = null — владелец процесса). */
function processRefsTo(entityType, id){
  var out = [];
  allProcesses().forEach(function(proc){
    if (entityType === 'role' && proc.ownerRoleId === id) out.push({proc:proc, step:null, what:'владелец'});
    orderedSteps(proc).forEach(function(s){
      if (entityType === 'role' ? s.roleId === id : s.participants.some(function(p){ return p.entityType === entityType && p.entityId === id; }))
        out.push({proc:proc, step:s});
    });
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
