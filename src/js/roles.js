'use strict';

/* ===================== Роли (исполнители шагов процессов) =====================
   Коллекция state.roles: {id, name, description}. Не путать с ролями участников механизма
   (PARTICIPANT_ROLES / roleInfo) и с типом объекта 1С «Роль». Название уникально без учёта регистра. */

var pinnedRoleId = null;

function roleNameError(name, exceptId){
  var k = normalizeLabel(name).toLowerCase();
  var dup = Object.keys(state.roles).some(function(id){ return id !== exceptId && state.roles[id].name.toLowerCase() === k; });
  return dup ? 'Роль «' + normalizeLabel(name) + '» уже есть.' : '';
}
/* «Новая роль», «Новая роль 2», … — первое свободное название. */
function uniqueRoleName(base){
  var name = base, i = 2;
  while (roleNameError(name)) name = base + ' ' + (i++);
  return name;
}
function createRole(partial){
  var id = uid('role');
  var r = {id:id, name:uniqueRoleName(normalizeLabel((partial && partial.name) || 'Новая роль')), description:''};
  state.roles[id] = r;
  persist();
  return r;
}
/* Число процессов, в которых используется роль. Процессов пока нет (фаза 3) — всегда 0. */
function roleProcessCount(roleId){ return 0; }

function deleteRole(id){
  var r = state.roles[id];
  if (!r) return;
  openModal({
    title:'Удалить роль?',
    bodyHTML:'<p>Роль «' + escapeHtml(r.name) + '» будет удалена без возможности восстановления.</p>',
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){
        delete state.roles[id];
        persist(); clearSelection();
        if (currentView === 'list') renderListView();
      }}
    ]
  });
}

function rolePanelTemplate(r){
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="card-icon card-icon-role" aria-hidden="true">' + typeIconSVG('role') + '</span>' +
        '<h2 class="inline-title" tabindex="0" title="Название роли — нажмите, чтобы изменить">' + escapeHtml(r.name) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges"><span class="status-badge is-default">Роль в процессах</span></div>' +
    '</div>' +
    viewFieldHTML('description', 'Описание') +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title">Используется в процессах · ' + roleProcessCount(r.id) + '</p></div>' +
      '<p class="ref-empty">Пока не используется.</p>' +
    '</div>'
  );
}

function renderRolePanel(r){
  if (!r) return;
  var panel = document.getElementById('panel-role');
  showPanel('role');
  panel.innerHTML = rolePanelTemplate(r);
  bindInlineTitle(panel, function(){ return r.name; }, function(v){
    r.name = normalizeLabel(v); persist();
    if (currentView === 'list') renderListView();
  }, 'Название роли', function(v){ return roleNameError(v, r.id); });
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){
    openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить роль', danger:true}], function(){ deleteRole(r.id); });
  });
  bindViewField(panel, 'description', {label:'Описание', addText:'Добавить описание', multiline:true,
    get:function(){ return r.description || ''; },
    set:function(v){ r.description = v; persist(); if (currentView === 'list') renderListView(); }});
}
