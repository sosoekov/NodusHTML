'use strict';

/* ===================== Ручные контроли =====================
   Коллекция state.controls: {id, name, instruction, toolObjectId, responsibleRoleId,
   moment, momentNote, replacedByMechanismId, status}. Пустая ссылка — ''. Статус — из словаря
   статусов объектов (OBJECT_STATUSES). Автоматический контроль — это механизм, здесь не хранится. */

var CONTROL_MOMENTS = [
  {code:'on_step',  title:'На шаге процесса'},
  {code:'periodic', title:'Периодически'},
  {code:'on_event', title:'По событию'}
];
var DEFAULT_CONTROL_MOMENT = 'on_step';
function controlMomentTitle(code){
  var m = CONTROL_MOMENTS.filter(function(x){ return x.code === code; })[0];
  return m ? m.title : CONTROL_MOMENTS[0].title;
}
/* Щит: сплошной — автоматический контроль (механизм), контурный — ручной. */
var SHIELD_PATH = '<path d="M8 1.5 13.5 3.5v4c0 3.3-2.3 5.9-5.5 7-3.2-1.1-5.5-3.7-5.5-7v-4z"/>';
function shieldIconSVG(solid){ return '<svg class="type-icon shield-icon' + (solid ? ' is-solid' : '') + '" viewBox="0 0 16 16" aria-hidden="true">' + SHIELD_PATH + '</svg>'; }

function allControls(){ return Object.keys(state.controls).map(function(id){ return state.controls[id]; }); }
function controlsByTool(objId){ return allControls().filter(function(c){ return c.toolObjectId === objId; }); }
function controlsReplacedBy(mechId){ return allControls().filter(function(c){ return c.replacedByMechanismId === mechId; }); }
function controlsByResponsible(roleId){ return allControls().filter(function(c){ return c.responsibleRoleId === roleId; }); }

/* Абзац предупреждения при удалении сущности, на которую ссылаются контроли. */
function controlRefsWarningHTML(ctrls, what){
  if (!ctrls.length) return '';
  var n = ctrls.length;
  return '<p>' + escapeHtml(what) + ' в ' + n + ' ' + pluralRu(n,'контроле','контролях','контролях') + ': ' +
    escapeHtml(ctrls.map(function(c){ return c.name; }).join(', ')) + '. Ссылка в ' + pluralRu(n,'нём','них','них') +
    ' останется с пометкой «⚠ Удалено».</p>';
}

function createControl(partial){
  var id = uid('ctrl');
  var c = {
    id:id, name:normalizeLabel((partial && partial.name) || 'Новый контроль'),
    instruction:'', toolObjectId:'', responsibleRoleId:'',
    moment:DEFAULT_CONTROL_MOMENT, momentNote:'', replacedByMechanismId:'',
    status:DEFAULT_OBJECT_STATUS
  };
  state.controls[id] = c;
  persist();
  return c;
}
function deleteControl(id){
  var c = state.controls[id];
  if (!c) return;
  var procRefs = processRefsTo('control', id);
  openModal({
    title:'Удалить контроль?',
    bodyHTML:'<p>Контроль «' + escapeHtml(c.name) + '» будет удалён без возможности восстановления.</p>' + processRefsWarningHTML(procRefs),
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){
        if (procRefs.length) rememberDeleted('ctrl', id, c.name);
        delete state.controls[id];
        persist(); clearSelection();
        if (currentView === 'process') renderProcessView();
        if (currentView === 'list') renderListView();
      }}
    ]
  });
}

/* Подписи ссылок контроля (для таблицы и карточки). Удалённая сущность — «⚠ Удалено: …». */
function controlRefText(id, coll, field){
  if (!id) return '';
  var e = state[coll][id];
  return e ? e[field] : '⚠ Удалено: ' + deletedName(id);
}

/* ----- Карточка контроля ----- */

function controlPanelTemplate(c){
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="card-icon card-icon-control" aria-hidden="true">' + shieldIconSVG(false) + '</span>' +
        '<h2 class="inline-title" tabindex="0" title="Название — нажмите, чтобы изменить">' + escapeHtml(c.name) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges"><span class="status-badge is-default">Ручной контроль</span>' + statusBadgeButtonHTML(c.status, false) + '</div>' +
    '</div>' +
    viewFieldHTML('instruction', 'Инструкция') +
    refFieldHTML('tool', 'Инструмент') +
    refFieldHTML('responsible', 'Ответственный') +
    '<div class="vfield" data-key="moment"><div class="vfield-label">Момент</div>' +
      '<div class="om-add-roles moment-seg" role="radiogroup" aria-label="Момент">' +
        CONTROL_MOMENTS.map(function(m){
          return '<button type="button" class="om-add-role' + (m.code === c.moment ? ' is-on' : '') + '" role="radio" aria-checked="' + (m.code === c.moment) + '" data-moment="' + m.code + '">' + escapeHtml(m.title) + '</button>';
        }).join('') +
      '</div></div>' +
    viewFieldHTML('momentNote', 'Уточнение момента') +
    refFieldHTML('replacedBy', 'Заменится механизмом') +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title">Используется в процессах · ' + controlProcessUses(c.id).length + '</p></div>' +
      '<div class="ctrl-uses"></div>' +
    '</div>'
  );
}
/* «Используется в процессах»: процесс · шаг · реакция; клик — переход к шагу в «Процессах». */
function renderControlUses(panel, c){
  var box = panel.querySelector('.ctrl-uses'), uses = controlProcessUses(c.id);
  if (!uses.length){ box.innerHTML = '<p class="ref-empty">Пока не используется.</p>'; return; }
  box.innerHTML = uses.map(function(u, i){
    return '<button type="button" class="om-link ctrl-use" data-i="' + i + '">' +
      '<span class="om-mech-title"><span class="step-num">' + u.num + '</span><span class="ref-item-title">' + escapeHtml(u.step.name) + '</span></span>' +
      '<span class="om-note">' + escapeHtml(u.proc.name) + ' · ' + escapeHtml(controlReaction(u.reaction).title.toLowerCase()) + '</span></button>';
  }).join('');
  box.querySelectorAll('.ctrl-use').forEach(function(b){
    var u = uses[Number(b.getAttribute('data-i'))];
    b.addEventListener('click', function(){ goToProcessStep(u.proc.id, u.step.id); });
  });
}

function renderControlPanel(c){
  if (!c) return;
  var panel = document.getElementById('panel-control');
  showPanel('control');
  panel.innerHTML = controlPanelTemplate(c);
  function changed(){ persist(); if (currentView === 'list') renderListView(); if (currentView === 'process') renderRibbon(); }
  bindInlineTitle(panel, function(){ return c.name; }, function(v){ c.name = normalizeLabel(v); changed(); }, 'Название контроля');
  bindStatusBadge(panel, c, false);
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){
    openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить контроль', danger:true}], function(){ deleteControl(c.id); });
  });
  bindViewField(panel, 'instruction', {label:'Инструкция', addText:'Добавить инструкцию: что сделать и на что смотреть', multiline:true,
    get:function(){ return c.instruction || ''; }, set:function(v){ c.instruction = v; changed(); }});
  bindRefField(panel, 'tool', {label:'Инструмент', addText:'Выбрать инструмент — отчёт, обработку, ЛК…',
    get:function(){ return c.toolObjectId; }, set:function(id){ c.toolObjectId = id; changed(); },
    resolve:function(id){ var o = state.objects[id]; return o ? {label:o.name, iconHTML:'<span class="dot" style="background:' + typeColor(o.type) + '"></span>'} : null; },
    open:function(id){ selectEntity('obj', id); },
    source:objectComboSource});
  bindRefField(panel, 'responsible', {label:'Ответственный', addText:'Выбрать ответственную роль',
    get:function(){ return c.responsibleRoleId; }, set:function(id){ c.responsibleRoleId = id; changed(); },
    resolve:function(id){ var r = state.roles[id]; return r ? {label:r.name, iconHTML:typeIconSVG('role')} : null; },
    open:function(id){ selectEntity('role', id); },
    source:roleComboSource,
    createLabel:function(q){ return q && !roleNameError(q) ? '+ Создать роль «' + normalizeLabel(q) + '»' : null; },
    create:function(text){ return createRole({name:text}).id; }});
  panel.querySelectorAll('.moment-seg .om-add-role').forEach(function(b){
    b.addEventListener('click', function(){
      c.moment = b.getAttribute('data-moment');
      panel.querySelectorAll('.moment-seg .om-add-role').forEach(function(x){
        var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      changed();
    });
  });
  bindViewField(panel, 'momentNote', {label:'Уточнение момента', addText:'Уточнить: «ежедневно», «при закрытии месяца»…',
    get:function(){ return c.momentNote || ''; }, set:function(v){ c.momentNote = normalizeLabel(v); changed(); }});
  renderControlUses(panel, c);
  bindRefField(panel, 'replacedBy', {label:'Заменится механизмом', addText:'Выбрать механизм, который заменит этот контроль',
    get:function(){ return c.replacedByMechanismId; }, set:function(id){ c.replacedByMechanismId = id; changed(); },
    resolve:function(id){ var m = state.mechanisms[id]; return m ? {label:m.title, iconHTML:'<span class="om-diamond" style="--c:' + categoryAccent(m.category) + '"></span>'} : null; },
    open:function(id){ selectEntity('mech', id); },
    source:mechanismComboSource});
}

/* ----- Обратные ссылки в карточках объекта и механизма ----- */

/* Блок со ссылками на контроли; без контролей не показывается. */
function renderControlBackLinks(container, title, ctrls){
  if (!container) return;
  if (!ctrls.length){ container.innerHTML = ''; return; }
  container.innerHTML = '<div class="panel-section is-tight">' +
    '<div class="panel-section-header"><p class="panel-section-title">' + escapeHtml(title) + ' · ' + ctrls.length + '</p></div>' +
    ctrls.slice().sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); }).map(function(c){
      return '<button type="button" class="om-link ctrl-link' + (c.status === 'deprecated' ? ' is-deprecated' : '') + '" data-ctrl="' + c.id + '">' +
        '<span class="om-mech-title">' + shieldIconSVG(false) + '<span class="ref-item-title">' + escapeHtml(c.name) + deprecatedTagHTML(c) + '</span></span>' +
        (c.instruction ? '<span class="om-note">' + escapeHtml(c.instruction.split('\n')[0]) + '</span>' : '') +
      '</button>';
    }).join('') +
  '</div>';
  container.querySelectorAll('.ctrl-link').forEach(function(b){
    b.addEventListener('click', function(){ setGraphHint(null); selectEntity('ctrl', b.getAttribute('data-ctrl')); });
  });
}
