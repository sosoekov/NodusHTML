'use strict';

/* ===================== Режим «Процессы»: левая панель и лента =====================
   Выбранный процесс и шаг хранятся в браузере (как ширины панелей) и переживают смену
   режима и перезагрузку. Лента — HTML: карточки шагов слева направо, между ними стрелки
   с «+» для вставки; масштаб — CSS zoom сцены (Ctrl + колесо, кнопки, «Вписать»). */

var PROC_SEL_KEY = 'nodusProcessSelection';
var procSel = (function(){
  try{
    var d = JSON.parse(localStorage.getItem(PROC_SEL_KEY) || 'null');
    if (d && typeof d === 'object') return {processId:d.processId || null, stepId:d.stepId || null};
  }catch(e){}
  return {processId:null, stepId:null};
})();
function saveProcSel(){ try{ localStorage.setItem(PROC_SEL_KEY, JSON.stringify(procSel)); }catch(e){} }

var procSearch = '';
var procSubFilter = {};
var procZoom = 1;
var PROC_ZOOM_MIN = 0.25, PROC_ZOOM_MAX = 1.5, PROC_ZOOM_STEP = 1.2;
/* Шаг, к которому ведёт кнопка «← К шагу», пока открыта карточка участника. */
var procReturn = null;
/* «Только в проме»: приглушить всё «в разработке» и пометить шаги «ручная работа». */
var PROC_ONLY_PROD_KEY = 'nodusProcOnlyProd';
var procOnlyProd = (function(){ try{ return localStorage.getItem(PROC_ONLY_PROD_KEY) === '1'; }catch(e){ return false; } })();
/* Вид центра: «Лента» или «Матрица»; запоминается в браузере. */
var PROC_VIEW_KEY = 'nodusProcView';
var procViewMode = (function(){ try{ return localStorage.getItem(PROC_VIEW_KEY) === 'matrix' ? 'matrix' : 'ribbon'; }catch(e){ return 'ribbon'; } })();
/* Проверки текущего процесса — пересчитываются при каждой отрисовке центра. */
var currentChecks = null;
var READINESS_MARKS = {
  full:{glyph:'●', title:'Все механизмы и автоматические контроли шага — в проме'},
  part:{glyph:'◐', title:'Часть механизмов и автоматических контролей шага — в разработке'},
  none:{glyph:'○', title:'Все механизмы и автоматические контроли шага — в разработке'}
};

var STEP_KIND_ICONS = {
  user_action:'<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/></svg>',
  auto_action:'<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4 5 11M11 5l1.4-1.4"/></svg>',
  event:'<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5 4 9h4l-1 5.5L12 7H8z"/></svg>',
  decision:'<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 14.2 8 8 14.2 1.8 8z"/></svg>'
};

function currentProcess(){ return procSel.processId ? state.processes[procSel.processId] || null : null; }
function currentStep(){ var p = currentProcess(); return p && procSel.stepId ? stepById(p, procSel.stepId) : null; }
function processSubsystems(p){ return objectSubsystems(p); }

/* Выбранный процесс удалён или не задан — берём первый в списке; шаг удалён — сбрасываем. */
function validateProcSel(){
  if (!currentProcess()){
    var list = filteredProcesses();
    var first = list[0] || allProcesses().sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); })[0];
    procSel.processId = first ? first.id : null;
    procSel.stepId = null;
  } else if (procSel.stepId && !currentStep()) procSel.stepId = null;
}

function filteredProcesses(){
  var q = procSearch.toLowerCase().trim();
  return allProcesses()
    .filter(function(p){ return !q || p.name.toLowerCase().indexOf(q) >= 0 || (p.description||'').toLowerCase().indexOf(q) >= 0; })
    .filter(function(p){ return matchesAny(procSubFilter, processSubsystems(p)); })
    .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); });
}

/* ----- Вход / выход из режима ----- */

function enterProcessView(){
  validateProcSel();
  renderProcessSidebar();
  renderRibbon();
  showProcessDefaultPanel();
}
function leaveProcessView(){
  procReturn = null;
  if (!document.getElementById('panel-process').hidden || !document.getElementById('panel-step').hidden) clearSelection();
}
/* Перерисовка после изменения данных извне (правка объекта, удаление, импорт). */
function renderProcessView(){
  if (currentView !== 'process') return;
  var before = procSel.processId + '|' + procSel.stepId;
  validateProcSel();
  renderProcessSidebar();
  renderRibbon();
  var procPanel = document.getElementById('panel-process'), stepPanel = document.getElementById('panel-step');
  var stale = (!procPanel.hidden && procPanel.getAttribute('data-id') !== procSel.processId) ||
              (!stepPanel.hidden && stepPanel.getAttribute('data-id') !== procSel.stepId) ||
              before !== procSel.processId + '|' + procSel.stepId;
  if (stale) showProcessDefaultPanel();
}
function showProcessDefaultPanel(){
  validateProcSel();
  var p = currentProcess(), s = currentStep();
  if (s) renderStepPanel(p, s);
  else if (p) renderProcessPanel(p);
  else showPanel(null);
}
/* Esc в «Процессах»: карточка шага → карточка процесса; карточка участника → обратно (clearSelection). */
function processEscape(){
  if (!document.getElementById('proc-problems').hidden){ toggleProblemsPanel(false); return true; }
  if (!document.getElementById('panel-step').hidden){ deselectStep(); return true; }
  if (!document.getElementById('panel-process').hidden) return true;
  return false;
}

function selectProcess(id){
  procSel = {processId:id, stepId:null}; saveProcSel();
  procReturn = null;
  renderProcessSidebar();
  renderRibbon();
  renderProcessPanel(state.processes[id]);
}
function selectStep(stepId){
  var p = currentProcess(); if (!p) return;
  var s = stepById(p, stepId); if (!s) return;
  procSel.stepId = stepId; saveProcSel();
  procReturn = null;
  markActiveStep();
  renderStepPanel(p, s);
}
function deselectStep(){
  procSel.stepId = null; saveProcSel();
  markActiveStep();
  if (currentProcess()) renderProcessPanel(currentProcess());
}

/* «← К шагу N» над карточкой участника, открытой из шага. */
function updateProcessBackBar(kind){
  var bar = document.getElementById('panel-back');
  var r = procReturn, p = r && state.processes[r.processId], s = p && stepById(p, r.stepId);
  var show = currentView === 'process' && !!s && !!kind && kind !== 'process' && kind !== 'step';
  bar.hidden = !show;
  if (show) bar.querySelector('button').textContent = '← К шагу ' + stepNumbers(p)[s.id] + ' · ' + s.name;
}
function returnToStep(){
  var r = procReturn; procReturn = null;
  if (!r || !state.processes[r.processId]) return;
  if (procSel.processId !== r.processId){ procSel.processId = r.processId; renderProcessSidebar(); renderRibbon(); }
  selectStep(r.stepId);
}
/* Клик по участнику или контролю шага: его карточка в правой панели с возвратом к шагу. */
function openParticipant(p){
  var kind = p.entityType === 'mechanism' ? 'mech' : 'obj';
  var id = p.entityId;
  if (p.entityType === 'attribute'){ var a = state.attributes[id]; if (!a) return; id = a.objectId; }
  if (kind === 'obj' ? !state.objects[id] : !state.mechanisms[id]) return;
  openFromStep(kind, id);
}
function openFromStep(kind, id){
  procReturn = {processId:procSel.processId, stepId:procSel.stepId};
  selectEntity(kind, id);
}
/* Переход к шагу процесса из любого режима (например, из карточки ручного контроля). */
function goToProcessStep(procId, stepId){
  if (!state.processes[procId]) return;
  procSel = {processId:procId, stepId:stepId}; saveProcSel();
  procReturn = null;
  if (currentView !== 'process'){
    document.querySelectorAll('.view-toggle .mode-btn').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-view') === 'process'); });
    switchView('process');
  } else { renderProcessSidebar(); renderRibbon(); selectStep(stepId); }
  var card = document.querySelector('#proc-stage .step-card[data-step="' + stepId + '"]');
  if (card) card.scrollIntoView({block:'nearest', inline:'nearest'});
}

/* ----- Левая панель ----- */

function renderProcessSidebar(){
  var cnt = {};
  allProcesses().forEach(function(p){ processSubsystems(p).forEach(function(s){ cnt[s] = (cnt[s]||0) + 1; }); });
  fillMultiSelect(document.querySelector('[data-ms="proc-sub"]'), {
    items:Object.keys(cnt).sort(function(a,b){ return a.localeCompare(b,'ru'); }).map(function(s){ return {code:s, title:s, count:cnt[s]}; }),
    selected:procSubFilter, allLabel:'Все подсистемы', manyLabel:'Подсистем', emptyText:'Подсистем пока нет', onChange:renderProcessSidebar});
  var list = filteredProcesses();
  var box = document.getElementById('proc-list');
  box.innerHTML = list.length ? list.map(function(p){
    var n = p.steps.length, subs = processSubsystems(p), rd = processReadiness(p);
    return '<button type="button" class="list-row' + (p.id === procSel.processId ? ' active' : '') + '" data-proc="' + p.id + '">' +
      '<span class="list-row-main"><span class="list-row-title">' + escapeHtml(p.name) + '</span>' +
        '<span class="list-row-sub">' + readinessText(rd) + (subs.length ? ' · ' + escapeHtml(subs.join(', ')) : '') + '</span></span>' +
      '<span class="list-row-meta"><span class="list-row-count" title="' + n + ' ' + pluralRu(n,'шаг','шага','шагов') + '">' + n + '</span></span>' +
    '</button>';
  }).join('') : '<p class="ref-empty">' + (allProcesses().length ? 'Ничего не найдено.' : 'Процессов пока нет.') + '</p>';
  box.querySelectorAll('.list-row').forEach(function(b){
    b.addEventListener('click', function(){ selectProcess(b.getAttribute('data-proc')); });
  });
}

/* ----- Лента ----- */

function stepRoleLineHTML(s){
  var icon = STEP_KIND_ICONS[s.kind] || STEP_KIND_ICONS.user_action, text;
  if (s.roleId) text = state.roles[s.roleId] ? escapeHtml(state.roles[s.roleId].name) : brokenRefHTML(s.roleId);
  else if (s.kind === 'auto_action') text = 'Система';
  else if (s.kind === 'event') text = 'Событие';
  else if (s.kind === 'decision') text = '<span class="is-faint">Решение · роль не указана</span>';
  else text = '<span class="is-faint">Роль не указана</span>';
  return '<div class="step-card-role" title="' + escapeHtml(stepKindTitle(s.kind)) + '">' + icon + '<span>' + text + '</span></div>';
}
function readinessText(rd){ return 'Готово ' + rd.ready + ' из ' + rd.total + ' ' + pluralRu(rd.total,'шага','шагов','шагов'); }
var DEV_TITLE = ' · В разработке';
function stepChipHTML(p){
  var info = participantInfo(p), role = participationRole(p.entityType, p.role), dev = isDevStatus(refStatus(p.entityType, p.entityId));
  return '<span class="step-chip' + (info.broken ? ' is-broken' : '') + (dev ? ' is-dev' : '') + '" title="' + escapeHtml(role.title + ': ' + (info.title || info.label) + (dev ? DEV_TITLE : '')) + '">' +
    (role.letter ? '<span class="step-chip-letter">' + role.letter + '</span>' : '') + info.iconHTML +
    '<span class="step-chip-text">' + escapeHtml(info.label) + '</span></span>';
}
/* Чип контроля: щит (сплошной — автоматический, контурный — ручной), название, буква реакции. */
function stepControlChipHTML(c){
  var info = stepControlInfo(c), r = controlReaction(c.reaction), dev = isDevStatus(refStatus(controlRefType(c), c.sourceId));
  var title = (info.auto ? 'Автоматический контроль: ' : 'Ручной контроль: ') + info.label + ' · ' + r.title +
    (c.targets.length ? ' · цели: ' + targetsText(c) : '') + (info.temp ? ' · временный → ' + info.temp : '') + (dev ? DEV_TITLE : '');
  return '<span class="step-chip ctrl-chip' + (info.broken ? ' is-broken' : '') + (dev ? ' is-dev' : '') + '" title="' + escapeHtml(title) + '">' +
    info.iconHTML + '<span class="step-chip-text">' + escapeHtml(info.label) + '</span>' +
    (info.temp ? '<span class="chip-temp">временный → ' + escapeHtml(info.temp) + '</span>' : '') +
    '<span class="step-chip-letter" title="' + escapeHtml(r.title) + '">' + r.letter + '</span></span>';
}
function stepCardHTML(s, num, unreachable){
  var rd = stepReadiness(s), mark = rd.level && READINESS_MARKS[rd.level];
  var manual = procOnlyProd && isManualWorkStep(s);
  var ctrls = stepControls(s);
  return '<div class="step-card' + (s.id === procSel.stepId ? ' is-active' : '') + (s.kind === 'decision' ? ' is-decision' : '') + (unreachable ? ' is-unreachable' : '') +
      '" data-step="' + s.id + '" tabindex="0"' + (unreachable ? ' title="Шаг недостижим от начала процесса"' : '') + '>' +
    '<div class="step-card-head"><span class="step-num">' + num + '</span>' +
      (mark ? '<span class="step-ready is-' + rd.level + '" title="' + escapeHtml(mark.title) + '">' + mark.glyph + '</span>' : '') +
      (s.kind === 'decision' ? '<span class="step-decision-mark" title="Решение" aria-label="Решение"></span>' : '') +
      '<span class="step-card-name" title="' + escapeHtml(s.name) + '">' + escapeHtml(s.name) + '</span>' +
      (currentChecks ? checksBadgeHTML(currentChecks.byStep[s.id], 'step-check') : '') +
      '<button type="button" class="card-menu-btn step-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с шагом" title="Действия">⋯</button></div>' +
    stepRoleLineHTML(s) +
    (manual ? '<span class="step-manual-badge" title="В проме у шага не осталось ни механизмов, ни контролей">ручная работа</span>' : '') +
    PARTICIPANT_TYPES.map(function(t){
      var parts = s.participants.filter(function(p){ return p.entityType === t.code; });
      if (!parts.length) return '';
      return '<div class="step-chips" data-type="' + t.code + '">' + parts.map(stepChipHTML).join('') + '<span class="step-chip-more" hidden></span></div>';
    }).join('') +
    (ctrls.length ? '<div class="step-chips" data-type="control">' + ctrls.map(stepControlChipHTML).join('') + '<span class="step-chip-more" hidden></span></div>' : '') +
  '</div>';
}
function renderRibbon(){
  var p = currentProcess();
  var head = document.getElementById('proc-head-info'), stage = document.getElementById('proc-stage'), empty = document.getElementById('proc-empty');
  empty.hidden = !!p;
  document.getElementById('proc-main').classList.toggle('is-empty', !p);
  if (!p){
    head.innerHTML = ''; stage.innerHTML = ''; currentChecks = null;
    document.getElementById('proc-problems').hidden = true;
    document.getElementById('proc-empty-title').textContent = allProcesses().length ? 'Выберите процесс слева' : 'Процессов пока нет';
    return;
  }
  var n = p.steps.length;
  currentChecks = computeProcessChecks(p);
  var probs = currentChecks.problems, warns = probs.filter(function(x){ return x.level === 'warn'; }).length;
  head.innerHTML = '<h2 class="proc-title">' + escapeHtml(p.name) + '</h2>' +
    '<span class="proc-meta">' + n + ' ' + pluralRu(n,'шаг','шага','шагов') + ' · ' + readinessText(processReadiness(p)) + '</span>' +
    '<button type="button" class="proc-problems-btn' + (warns ? ' is-warn' : (probs.length ? ' is-info' : ' is-ok')) + '" aria-haspopup="true" aria-expanded="' + !document.getElementById('proc-problems').hidden + '"' +
      (probs.length ? '' : ' disabled') + '>' + (probs.length ? CHECK_ICONS[warns ? 'warn' : 'info'] + ' ' : '') + 'Проблем: ' + probs.length + '</button>';
  var btn = head.querySelector('.proc-problems-btn');
  btn.addEventListener('click', function(){ toggleProblemsPanel(); });
  if (!document.getElementById('proc-problems').hidden) renderProblemsPanel();
  var matrix = procViewMode === 'matrix';
  document.getElementById('proc-main').classList.toggle('is-matrix', matrix);
  document.getElementById('proc-scroll').hidden = matrix;
  document.getElementById('proc-matrix').hidden = !matrix;
  document.querySelectorAll('.proc-view-btn').forEach(function(b){ b.setAttribute('aria-checked', b.getAttribute('data-pview') === procViewMode ? 'true' : 'false'); });
  if (matrix){ renderMatrix(document.getElementById('proc-matrix'), p, currentChecks); return; }
  stage.classList.toggle('only-prod', procOnlyProd);
  renderRibbonLayout(stage, p, currentChecks.layout);
}

/* ----- «Проблем: N»: список с переходом к шагу ----- */
function toggleProblemsPanel(open){
  var panel = document.getElementById('proc-problems');
  if (open === undefined) open = panel.hidden;
  panel.hidden = !open;
  var btn = document.querySelector('.proc-problems-btn'); if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderProblemsPanel();
}
function renderProblemsPanel(){
  var panel = document.getElementById('proc-problems'), c = currentChecks;
  if (!c || !c.problems.length){ panel.hidden = true; return; }
  var nums = c.layout.numbers, p = currentProcess();
  panel.innerHTML = '<div class="pp-head">Проблемы процесса · ' + c.problems.length + '</div>' + c.problems.map(function(x, i){
    var s = x.stepId && stepById(p, x.stepId);
    return '<button type="button" class="pp-item is-' + x.level + '" data-i="' + i + '">' +
      '<span class="pp-icon">' + CHECK_ICONS[x.level] + '</span><span class="pp-text">' + escapeHtml(x.text) + '</span>' +
      (s ? '<span class="pp-step"><span class="step-num">' + nums[s.id] + '</span>' + escapeHtml(s.name) + '</span>' : '') + '</button>';
  }).join('');
  panel.querySelectorAll('.pp-item').forEach(function(b){
    b.addEventListener('click', function(){
      var x = c.problems[Number(b.getAttribute('data-i'))];
      toggleProblemsPanel(false);
      if (x.stepId){
        selectStep(x.stepId);
        var el = document.querySelector('#proc-stage .step-card[data-step="' + x.stepId + '"], #proc-matrix .pm-col[data-step="' + x.stepId + '"]');
        if (el) el.scrollIntoView({block:'nearest', inline:'nearest'});
      }
    });
  });
}
/* Группа чипов — одна строка; не поместившиеся прячутся под «+N» (с подсказкой). */
function fitChipLines(){
  document.querySelectorAll('#proc-stage .step-chips').forEach(function(line){
    var chips = Array.prototype.slice.call(line.querySelectorAll('.step-chip'));
    var more = line.querySelector('.step-chip-more');
    chips.forEach(function(c){ c.hidden = false; });
    more.hidden = true;
    var n = 0;
    while (line.scrollWidth > line.clientWidth + 1 && n < chips.length - 1){
      n++; chips[chips.length - n].hidden = true;
      more.hidden = false; more.textContent = '+' + n;
    }
    more.title = chips.slice(chips.length - n).map(function(c){ return c.title; }).join('\n');
  });
}
function markActiveStep(){
  document.querySelectorAll('#proc-stage .step-card').forEach(function(c){ c.classList.toggle('is-active', c.getAttribute('data-step') === procSel.stepId); });
  markActiveMatrixColumn();
}

/* ----- Действия с шагами на ленте ----- */

/* «+» на переходе: новый шаг встаёт на этот переход (в ветку исхода — для решения). */
function addStepOnEdge(fromId, outIdx){
  var p = currentProcess(); if (!p) return;
  var s = insertOnEdge(p, fromId || null, outIdx);
  persist(); renderRibbon(); renderProcessSidebar();
  selectStep(s.id);
  var card = document.querySelector('#proc-stage .step-card[data-step="' + s.id + '"]');
  if (card) card.scrollIntoView({block:'nearest', inline:'nearest'});
  startInlineTitleEdit(document.getElementById('panel-step'));
}
function deleteStepUI(stepId){
  var p = currentProcess(), s = p && stepById(p, stepId); if (!s) return;
  var n = s.participants.length, k = stepControls(s).length, with_ = [];
  if (n) with_.push(n + ' ' + pluralRu(n,'участником','участниками','участниками'));
  if (k) with_.push(k + ' ' + pluralRu(k,'контролем','контролями','контролями'));
  /* Ссылки на шаг (next и исходы других шагов) переводятся на его следующий шаг или на завершение. */
  var nums = stepNumbers(p), inc = incomingRefs(p, stepId).filter(function(r){ return r.step.id !== stepId; });
  var succ = stepSuccessor(s), succStep = succ && succ !== stepId ? stepById(p, succ) : null;
  var incHTML = inc.length > 1 || inc.some(function(r){ return r.outIdx >= 0; }) ?
    '<p>На шаг ведут: ' + inc.map(function(r){
      return nums[r.step.id] + ' «' + escapeHtml(r.step.name) + '»' + (r.outIdx >= 0 ? ' (исход «' + escapeHtml(r.label) + '»)' : '');
    }).join('; ') + '. Эти переходы будут вести ' +
    (succStep ? 'на шаг ' + nums[succStep.id] + ' «' + escapeHtml(succStep.name) + '»' : 'на «Завершение процесса»') + '.</p>' : '';
  openModal({
    title:'Удалить шаг?',
    bodyHTML:'<p>Шаг ' + nums[s.id] + ' «' + escapeHtml(s.name) + '» будет удалён' +
      (with_.length ? ' вместе с ' + with_.join(' и ') : '') + '. Соседние шаги соединятся.</p>' + incHTML,
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){
        removeStep(p, stepId);
        if (procSel.stepId === stepId){ procSel.stepId = null; saveProcSel(); }
        persist(); renderRibbon(); renderProcessSidebar(); showProcessDefaultPanel();
      }}
    ]
  });
}
function moveStepUI(stepId, dir){
  var p = currentProcess(); if (!p || !moveStep(p, stepId, dir)) return;
  persist(); renderRibbon();
  if (procSel.stepId && !document.getElementById('panel-step').hidden) renderStepPanel(p, currentStep());
  else if (!document.getElementById('panel-process').hidden) renderProcessPanel(p);
}
function openStepMenu(btn, stepId){
  var p = currentProcess(), s = stepById(p, stepId);
  var items = [];
  if (canMoveLeft(p, s)) items.push({value:'left', label:'Сдвинуть влево'});
  if (canMoveRight(p, s)) items.push({value:'right', label:'Сдвинуть вправо'});
  if (items.length) items.push({sep:true});
  items.push({value:'delete', label:'Удалить шаг', danger:true});
  openPopoverMenu(btn, items, function(v){
    if (v === 'left') moveStepUI(stepId, -1);
    else if (v === 'right') moveStepUI(stepId, 1);
    else if (v === 'delete') deleteStepUI(stepId);
  });
}

/* ----- Масштаб ----- */

function setProcZoom(z, anchorX, anchorY){
  var sc = document.getElementById('proc-scroll'), stage = document.getElementById('proc-stage');
  z = Math.min(PROC_ZOOM_MAX, Math.max(PROC_ZOOM_MIN, z));
  if (anchorX == null){ anchorX = sc.clientWidth / 2; anchorY = sc.clientHeight / 2; }
  var cx = (sc.scrollLeft + anchorX) / procZoom, cy = (sc.scrollTop + anchorY) / procZoom;
  procZoom = z;
  stage.style.zoom = z;
  sc.scrollLeft = cx * z - anchorX;
  sc.scrollTop = cy * z - anchorY;
}
/* «Вписать»: вся лента помещается в видимую область (не крупнее 100%). */
function fitProcessRibbon(){
  var sc = document.getElementById('proc-scroll'), stage = document.getElementById('proc-stage');
  stage.style.zoom = 1;
  var w = stage.scrollWidth, h = stage.scrollHeight;
  procZoom = Math.min(PROC_ZOOM_MAX, Math.max(PROC_ZOOM_MIN, Math.min(1, sc.clientWidth / w, sc.clientHeight / h)));
  stage.style.zoom = procZoom;
  sc.scrollLeft = 0; sc.scrollTop = 0;
}

/* ----- Обработчики (один раз при старте) ----- */

function bindProcessView(){
  var search = document.getElementById('proc-search');
  search.addEventListener('input', function(){ procSearch = search.value; renderProcessSidebar(); });
  bindMultiSelectToggle(document.querySelector('[data-ms="proc-sub"]'));
  document.getElementById('btn-proc-add').addEventListener('click', function(){
    procSearch = ''; search.value = '';
    Object.keys(procSubFilter).forEach(function(k){ delete procSubFilter[k]; });
    var p = createProcess();
    selectProcess(p.id);
    startInlineTitleEdit(document.getElementById('panel-process'));
  });
  document.getElementById('btn-proc-empty-add').addEventListener('click', function(){ document.getElementById('btn-proc-add').click(); });
  document.getElementById('panel-back').querySelector('button').addEventListener('click', returnToStep);

  var stage = document.getElementById('proc-stage'), sc = document.getElementById('proc-scroll');
  stage.addEventListener('click', function(e){
    var add = e.target.closest('.step-add, .step-add-first');
    if (add){ addStepOnEdge(add.getAttribute('data-from'), Number(add.getAttribute('data-out'))); return; }
    var menu = e.target.closest('.step-menu-btn');
    if (menu){ openStepMenu(menu, menu.closest('.step-card').getAttribute('data-step')); return; }
    var card = e.target.closest('.step-card');
    if (card){ selectStep(card.getAttribute('data-step')); return; }
  });
  stage.addEventListener('keydown', function(e){
    var card = e.target.classList && e.target.classList.contains('step-card') ? e.target : null;
    if (card && e.key === 'Enter'){ e.preventDefault(); selectStep(card.getAttribute('data-step')); }
  });
  /* Клик по пустому месту ленты — снять выбор шага (карточка процесса). */
  sc.addEventListener('click', function(e){
    if (!e.target.closest('.step-card, .step-add, .step-add-first, .step-term') && procSel.stepId) deselectStep();
  });
  sc.addEventListener('wheel', function(e){
    if (e.ctrlKey || e.metaKey){
      e.preventDefault();
      var r = sc.getBoundingClientRect();
      setProcZoom(procZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    } else if (sc.scrollHeight <= sc.clientHeight && Math.abs(e.deltaY) > Math.abs(e.deltaX)){
      /* Лента горизонтальная: без вертикальной прокрутки колесо листает вбок. */
      e.preventDefault();
      sc.scrollLeft += e.deltaY;
    }
  }, {passive:false});
  document.getElementById('btn-proc-zoom-in').addEventListener('click', function(){ setProcZoom(procZoom * PROC_ZOOM_STEP); });
  document.getElementById('btn-proc-zoom-out').addEventListener('click', function(){ setProcZoom(procZoom / PROC_ZOOM_STEP); });
  document.getElementById('btn-proc-fit').addEventListener('click', fitProcessRibbon);
  document.querySelectorAll('.proc-view-btn').forEach(function(b){
    b.addEventListener('click', function(){
      procViewMode = b.getAttribute('data-pview');
      try{ localStorage.setItem(PROC_VIEW_KEY, procViewMode); }catch(e){}
      renderRibbon();
    });
  });
  document.addEventListener('mousedown', function(e){
    var panel = document.getElementById('proc-problems');
    if (!panel.hidden && !panel.contains(e.target) && !e.target.closest('.proc-problems-btn')) toggleProblemsPanel(false);
  });
  var onlyProd = document.getElementById('proc-only-prod');
  onlyProd.checked = procOnlyProd;
  onlyProd.addEventListener('change', function(){
    procOnlyProd = onlyProd.checked;
    try{ localStorage.setItem(PROC_ONLY_PROD_KEY, procOnlyProd ? '1' : '0'); }catch(e){}
    renderRibbon();
  });
  if (window.ResizeObserver) new ResizeObserver(function(){ if (currentView === 'process') fitChipLines(); }).observe(sc);
}
