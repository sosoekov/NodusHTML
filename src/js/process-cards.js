'use strict';

/* ===================== Процессы: карточки в правой панели =====================
   Карточка процесса — когда шаг не выбран; карточка шага — по клику на шаг ленты. */

function processChanged(){ persist(); renderProcessSidebar(); renderRibbon(); }

/* ----- Карточка процесса ----- */

function processPanelTemplate(p){
  var list = orderedSteps(p), nums = stepNumbers(p), kinds = {};
  list.forEach(function(s){ kinds[s.kind] = (kinds[s.kind] || 0) + 1; });
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="card-icon card-icon-process" aria-hidden="true">' + typeIconSVG('bproc') + '</span>' +
        '<h2 class="inline-title" tabindex="0" title="Название процесса — нажмите, чтобы изменить">' + escapeHtml(p.name) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges"><span class="status-badge is-default">Процесс</span></div>' +
    '</div>' +
    viewFieldHTML('description', 'Описание') +
    '<div class="vfield" data-key="psubs"><div class="vfield-label">Подсистема</div><div class="vfield-value" tabindex="0"></div></div>' +
    refFieldHTML('owner', 'Владелец') +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title">Шаги · ' + list.length + '</p></div>' +
      (list.length ? '<p class="proc-kind-counts">' + STEP_KINDS.filter(function(k){ return kinds[k.code]; }).map(function(k){
          return escapeHtml(k.title) + ': ' + kinds[k.code];
        }).join(' · ') + '</p>' +
        '<div class="proc-step-links">' + list.map(function(s){
          return '<button type="button" class="om-link proc-step-link" data-step="' + s.id + '"><span class="step-num">' + nums[s.id] + '</span><span class="ref-item-title">' + escapeHtml(s.name) + '</span></button>';
        }).join('') + '</div>'
        : '<p class="ref-empty">Шагов нет.</p>') +
    '</div>'
  );
}

function renderProcessPanel(p){
  if (!p) return;
  var panel = document.getElementById('panel-process');
  showPanel('process');
  panel.setAttribute('data-id', p.id);
  panel.innerHTML = processPanelTemplate(p);
  bindInlineTitle(panel, function(){ return p.name; }, function(v){ p.name = normalizeLabel(v); processChanged(); }, 'Название процесса');
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){
    openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить процесс', danger:true}], function(){ deleteProcess(p.id); });
  });
  bindViewField(panel, 'description', {label:'Описание', addText:'Добавить описание', multiline:true,
    get:function(){ return p.description || ''; }, set:function(v){ p.description = v; persist(); }});
  bindProcessSubsystems(panel, p);
  bindRefField(panel, 'owner', {label:'Владелец', addText:'Выбрать роль-владельца процесса',
    get:function(){ return p.ownerRoleId || ''; }, set:function(id){ p.ownerRoleId = id; persist(); },
    resolve:function(id){ var r = state.roles[id]; return r ? {label:r.name, iconHTML:typeIconSVG('role')} : null; },
    open:function(id){ selectEntity('role', id); },
    source:roleComboSource,
    createLabel:function(q){ return q && !roleNameError(q) ? '+ Создать роль «' + normalizeLabel(q) + '»' : null; },
    create:function(text){ return createRole({name:text}).id; }});
  panel.querySelectorAll('.proc-step-link').forEach(function(b){
    b.addEventListener('click', function(){ selectStep(b.getAttribute('data-step')); });
  });
}

/* Подсистема процесса — тот же редактор чипов, что у объекта; подсказки — подсистемы объектов и процессов. */
function processSubsystemSuggestions(){
  var seen = {}, out = [], all = allSubsystems();
  allProcesses().forEach(function(p){ all = all.concat(processSubsystems(p)); });
  all.forEach(function(s){
    var k = s.toLowerCase(); if (!seen[k]){ seen[k] = true; out.push(s); }
  });
  return out.sort(function(a,b){ return a.localeCompare(b,'ru'); });
}
function bindProcessSubsystems(panel, p){
  var wrap = panel.querySelector('.vfield[data-key="psubs"]');
  var view = wrap.querySelector('.vfield-value');
  function renderView(){
    var subs = processSubsystems(p);
    view.classList.toggle('is-empty', !subs.length);
    view.innerHTML = !subs.length ? '+ Добавить подсистему' :
      '<div class="chips-view">' + subs.map(function(s){ return '<span class="sub-chip" title="Подсистема">' + typeIconSVG('subsystem') + escapeHtml(s) + '</span>'; }).join('') + '</div>' + PENCIL_SVG;
  }
  function edit(){
    if (wrap.querySelector('.subtags-edit')) return;
    view.hidden = true;
    var box = document.createElement('div'); box.className = 'subtags-edit';
    wrap.appendChild(box);
    var ed = buildChipEditor(box, {
      label:'Подсистемы', placeholder:'Начните вводить подсистему…', chipClass:'sub-chip', createLabel:'Создать',
      values:function(){ return processSubsystems(p); }, suggestions:processSubsystemSuggestions,
      onChange:function(list){ setObjectSubsystems(p, list); processChanged(); }
    });
    ed.focus();
    function close(){ box.remove(); view.hidden = false; renderView(); }
    box.addEventListener('focusout', function(){ setTimeout(function(){ if (box.isConnected && !box.contains(document.activeElement)) close(); }, 0); });
    box.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !box.querySelector('.combo-dropdown:not([hidden])')){ e.preventDefault(); e.stopPropagation(); close(); view.focus(); }
    });
  }
  view.addEventListener('click', edit);
  view.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); edit(); } });
  renderView();
}

function deleteProcess(id){
  var p = state.processes[id]; if (!p) return;
  openModal({
    title:'Удалить процесс?',
    bodyHTML:'<p>Процесс «' + escapeHtml(p.name) + '» и его ' + p.steps.length + ' ' + pluralRu(p.steps.length,'шаг','шага','шагов') +
      ' будут удалены без возможности восстановления. Объекты, механизмы и реквизиты останутся.</p>',
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){
        delete state.processes[id];
        procSel = {processId:null, stepId:null}; saveProcSel();
        persist(); renderProcessView(); showProcessDefaultPanel();
      }}
    ]
  });
}

/* ----- Карточка шага ----- */

function stepPanelTemplate(p, s){
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="step-num step-num-lg">' + stepNumbers(p)[s.id] + '</span>' +
        '<h2 class="inline-title" tabindex="0" title="Название шага — нажмите, чтобы изменить">' + escapeHtml(s.name) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges">' +
        '<button type="button" class="badge-btn status-badge is-default step-kind-badge" aria-haspopup="menu" aria-expanded="false" title="Вид шага — нажмите, чтобы изменить">' +
          STEP_KIND_ICONS[s.kind] + escapeHtml(stepKindTitle(s.kind)) + '</button>' +
        '<span class="step-proc-name" title="Процесс">' + escapeHtml(p.name) + '</span>' +
      '</div>' +
    '</div>' +
    refFieldHTML('role', s.kind === 'decision' ? 'Кто решает' : 'Роль') +
    (s.kind === 'decision' ? stepOutcomesSectionHTML() : '') +
    viewFieldHTML('description', 'Описание') +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title" id="step-parts-title">Участники</p>' +
        '<button class="btn btn-sm" id="btn-add-participant" type="button" title="Добавить механизм, объект или реквизит">+ Участник</button></div>' +
      '<div id="step-add-participant"></div>' +
      '<div id="step-parts-list"></div>' +
    '</div>' +
    stepControlsSectionHTML()
  );
}

function renderStepPanel(p, s){
  if (!p || !s) return;
  var panel = document.getElementById('panel-step');
  showPanel('step');
  panel.setAttribute('data-id', s.id);
  panel.innerHTML = stepPanelTemplate(p, s);
  function changed(){ persist(); renderRibbon(); }
  bindInlineTitle(panel, function(){ return s.name; }, function(v){ s.name = normalizeLabel(v); changed(); }, 'Название шага');
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){ openStepMenu(menuBtn, s.id); });
  var kindBtn = panel.querySelector('.step-kind-badge');
  kindBtn.addEventListener('click', function(){
    openPopoverMenu(kindBtn, STEP_KINDS.map(function(k){ return {value:k.code, label:k.title, icon:STEP_KIND_ICONS[k.code], current:k.code === s.kind}; }), function(code){
      if (code === s.kind) return;
      function apply(){ setStepKind(s, code); changed(); renderStepPanel(p, s); }
      var lost = s.kind === 'decision' ? (s.outcomes || []).slice(1).filter(function(o){ return o.next; }) : [];
      if (!lost.length){ apply(); return; }
      openModal({
        title:'Сменить вид шага?',
        bodyHTML:'<p>Шаг перестанет быть решением: останется только переход первого исхода «' + escapeHtml(s.outcomes[0].label) + '». ' +
          'Исходы ' + lost.map(function(o){ return '«' + escapeHtml(o.label) + '»'; }).join(', ') + ' будут удалены; шаги их веток останутся, но могут стать недостижимыми.</p>',
        footerButtons:[
          {label:'Отмена', onClick:function(){ return true; }},
          {label:'Сменить вид', variant:'primary', onClick:function(){ apply(); }}
        ]
      });
    });
  });
  bindRefField(panel, 'role', {label:'Роль', addText:s.kind === 'auto_action' ? 'Система — или выбрать роль' : 'Выбрать роль исполнителя',
    get:function(){ return s.roleId || ''; }, set:function(id){ s.roleId = id; changed(); },
    resolve:function(id){ var r = state.roles[id]; return r ? {label:r.name, iconHTML:typeIconSVG('role')} : null; },
    open:function(id){ procReturn = {processId:p.id, stepId:s.id}; selectEntity('role', id); },
    source:roleComboSource,
    createLabel:function(q){ return q && !roleNameError(q) ? '+ Создать роль «' + normalizeLabel(q) + '»' : null; },
    create:function(text){ return createRole({name:text}).id; }});
  bindViewField(panel, 'description', {label:'Описание', addText:'Добавить описание', multiline:true,
    get:function(){ return s.description || ''; }, set:function(v){ s.description = v; persist(); }});
  renderStepParticipants(p, s, panel);
  bindAddParticipant(p, s, panel);
  renderStepControls(p, s, panel);
  if (s.kind === 'decision') renderStepOutcomes(p, s, panel);
  bindAddStepControl(p, s, panel);
}

/* Участники шага, сгруппированные: Механизмы / Объекты / Реквизиты. */
function renderStepParticipants(p, s, panel){
  var box = panel.querySelector('#step-parts-list');
  panel.querySelector('#step-parts-title').textContent = 'Участники · ' + s.participants.length;
  if (!s.participants.length){ box.innerHTML = '<p class="ref-empty">Участников пока нет.</p>'; return; }
  box.innerHTML = PARTICIPANT_TYPES.map(function(t){
    var rows = [];
    s.participants.forEach(function(pt, i){
      if (pt.entityType !== t.code) return;
      var info = participantInfo(pt), role = participationRole(pt.entityType, pt.role);
      rows.push('<div class="sp-item" data-i="' + i + '">' +
        '<div class="sp-row">' +
          (info.broken ? '<span class="sp-name ref-broken">' + escapeHtml(info.label) + '</span>'
                       : '<button type="button" class="sp-name ref-link" title="' + escapeHtml(info.title || 'Открыть карточку') + '">' + info.iconHTML + '<span>' + escapeHtml(info.label) + '</span></button>') +
          '<button type="button" class="badge-btn status-badge is-default sp-role" aria-haspopup="menu" aria-expanded="false" title="Роль участия — нажмите, чтобы изменить">' +
            (role.letter ? role.letter + ' · ' : '') + escapeHtml(role.title) + '</button>' +
          '<button type="button" class="card-menu-btn sp-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с участником" title="Действия">⋯</button>' +
        '</div>' +
        '<div class="sp-note' + (pt.note ? '' : ' is-empty') + '" tabindex="0" title="Примечание — нажмите, чтобы изменить">' + (pt.note ? escapeHtml(pt.note) : '+ примечание') + '</div>' +
      '</div>');
    });
    return rows.length ? '<div class="sp-group"><p class="om-group-title">' + escapeHtml(t.title) + '</p>' + rows.join('') + '</div>' : '';
  }).join('');

  function changed(){ persist(); renderRibbon(); renderStepParticipants(p, s, panel); }
  box.querySelectorAll('.sp-item').forEach(function(item){
    var pt = s.participants[Number(item.getAttribute('data-i'))];
    var name = item.querySelector('button.sp-name');
    if (name) name.addEventListener('click', function(){ openParticipant(pt); });
    var roleBtn = item.querySelector('.sp-role');
    roleBtn.addEventListener('click', function(){
      openPopoverMenu(roleBtn, PARTICIPATION_ROLES[pt.entityType].map(function(r){
        return {value:r.code, label:(r.letter ? r.letter + ' · ' : '') + r.title, current:r.code === pt.role};
      }), function(code){ if (code !== pt.role){ pt.role = code; changed(); } });
    });
    var menu = item.querySelector('.sp-menu');
    menu.addEventListener('click', function(){
      openPopoverMenu(menu, [{value:'remove', label:'Убрать из шага', danger:true}], function(){
        s.participants.splice(s.participants.indexOf(pt), 1); changed();
      });
    });
    var note = item.querySelector('.sp-note');
    function editNote(){
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'field-input sp-note-input'; input.value = pt.note || '';
      input.placeholder = 'Примечание'; input.setAttribute('aria-label', 'Примечание');
      note.replaceWith(input); input.focus();
      var done = false;
      function finish(save){
        if (done) return; done = true;
        var v = normalizeLabel(input.value);
        if (save && v !== (pt.note || '')){ pt.note = v; persist(); }
        renderStepParticipants(p, s, panel);
      }
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
        else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', function(){ finish(true); });
    }
    note.addEventListener('click', editNote);
    note.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); editNote(); } });
  });
}

/* ----- Добавление участника: «+ Участник» → поиск → выбор → роль участия (≤ 4 клика) ----- */

var PARTICIPANT_PICK_LIMIT = 6;

/* Объект по тексту: точное совпадение синонима или имени в конфигураторе, иначе единственное вхождение. */
function resolveObjectByText(text){
  var k = normalizeLabel(text).toLowerCase(); if (!k) return null;
  var objs = Object.keys(state.objects).map(function(id){ return state.objects[id]; });
  var exact = objs.filter(function(o){ return o.name.toLowerCase() === k || objectIdentifier(o).toLowerCase() === k; });
  if (exact.length === 1) return exact[0];
  var part = objs.filter(function(o){ return o.name.toLowerCase().indexOf(k) >= 0 || objectIdentifier(o).toLowerCase().indexOf(k) >= 0; });
  return part.length === 1 ? part[0] : null;
}
/* «Объект.Реквизит» → {objText, name}; без точки — только имя. */
function splitAttrQuery(q){
  var d = q.lastIndexOf('.');
  return d > 0 ? {objText:q.slice(0, d), name:normalizeLabel(q.slice(d + 1))} : {objText:'', name:normalizeLabel(q)};
}
function participantComboSource(q){
  var k = q.toLowerCase(), out = [];
  var sq = splitAttrQuery(k), dotted = !!sq.objText;
  if (!dotted){
    mechanismComboSource(q).slice(0, PARTICIPANT_PICK_LIMIT).forEach(function(it){ out.push({value:'mechanism:' + it.value, label:it.label, sub:'Механизм · ' + it.sub, iconHTML:it.iconHTML}); });
    Object.keys(state.objects).map(function(id){ return state.objects[id]; })
      .filter(function(o){ return !k || o.name.toLowerCase().indexOf(k) >= 0 || (o.fullName || '').toLowerCase().indexOf(k) >= 0; })
      .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); }).slice(0, PARTICIPANT_PICK_LIMIT)
      .forEach(function(o){ out.push({value:'object:' + o.id, label:o.name, sub:typeTitle(o.type), iconHTML:'<span class="dot" style="background:' + typeColor(o.type) + '"></span>'}); });
  }
  Object.keys(state.attributes).map(function(id){ return state.attributes[id]; })
    .filter(function(a){
      var o = state.objects[a.objectId]; if (!o) return false;
      var an = a.name.toLowerCase(), syn = (a.synonym || '').toLowerCase();
      if (dotted) return (o.name.toLowerCase().indexOf(sq.objText) >= 0 || objectIdentifier(o).toLowerCase().indexOf(sq.objText) >= 0) &&
        (an.indexOf(sq.name.toLowerCase()) >= 0 || syn.indexOf(sq.name.toLowerCase()) >= 0);
      return !k || an.indexOf(k) >= 0 || syn.indexOf(k) >= 0 || attributeFullName(a).toLowerCase().indexOf(k) >= 0;
    })
    .sort(function(a,b){ return attributeDisplayName(a).localeCompare(attributeDisplayName(b),'ru'); }).slice(0, PARTICIPANT_PICK_LIMIT)
    .forEach(function(a){
      var o = state.objects[a.objectId];
      out.push({value:'attribute:' + a.id, label:attributeDisplayName(a), sub:'Реквизит' + (a.tabularSection ? ' · ' + a.tabularSection : ''),
        iconHTML:'<span class="dot" style="background:' + typeColor(o.type) + '"></span>'});
    });
  return out;
}
function attributeCreateLabel(q){
  var sq = splitAttrQuery(q);
  if (!sq.name) return null;
  var o = sq.objText ? resolveObjectByText(sq.objText) : null;
  return '+ Создать реквизит «' + sq.name + '» у объекта ' + (o ? '«' + o.name + '»' : '…');
}

function bindAddParticipant(p, s, panel){
  var btn = panel.querySelector('#btn-add-participant'), host = panel.querySelector('#step-add-participant');
  function close(){ host.innerHTML = ''; }
  function added(){ persist(); renderRibbon(); renderStepParticipants(p, s, panel); close(); btn.focus(); }
  btn.addEventListener('click', function(){
    if (host.firstChild){ close(); return; }
    host.innerHTML = '<div class="om-add sp-add">' +
      '<div class="sp-add-step1"><div class="om-add-label">Механизм, объект или реквизит</div><div class="sp-add-picker"></div></div>' +
      '<div class="sp-add-object" hidden><div class="om-add-label sp-add-object-label"></div><div class="sp-add-object-picker"></div></div>' +
      '<div class="sp-add-roles" hidden><div class="om-add-label sp-add-chosen"></div><div class="om-add-roles"></div></div>' +
      '<p class="field-error sp-add-error" hidden></p>' +
      '<div class="om-add-actions"><button type="button" class="btn btn-sm sp-add-cancel">Отмена</button></div>' +
    '</div>';
    var err = host.querySelector('.sp-add-error');
    function showError(text){ err.textContent = text; err.hidden = !text; }

    /* Шаг 2: роль участия — один клик добавляет участника. */
    function chooseEntity(type, id){
      var info = participantInfo({entityType:type, entityId:id});
      host.querySelector('.sp-add-step1').hidden = true;
      host.querySelector('.sp-add-object').hidden = true;
      var box = host.querySelector('.sp-add-roles'); box.hidden = false;
      host.querySelector('.sp-add-chosen').innerHTML = 'Роль участия: <b>' + escapeHtml(info.label) + '</b>';
      var roles = box.querySelector('.om-add-roles');
      roles.innerHTML = PARTICIPATION_ROLES[type].map(function(r){
        return '<button type="button" class="om-add-role" data-role="' + r.code + '">' + (r.letter ? r.letter + ' · ' : '') + escapeHtml(r.title) + '</button>';
      }).join('');
      roles.querySelectorAll('.om-add-role').forEach(function(b){
        b.addEventListener('click', function(){
          var role = b.getAttribute('data-role');
          var dup = s.participants.some(function(x){ return x.entityType === type && x.entityId === id && x.role === role; });
          if (!dup) s.participants.push({entityType:type, entityId:id, role:role, note:''});
          added();
        });
      });
      roles.querySelector('.om-add-role').focus();
    }
    /* Создание реквизита прямо из поиска: «Заявка.НовыйРеквизит» или имя + выбор объекта. */
    function createAttrFor(o, name){
      var e = attributeNameError(name, o.id, '');
      if (e){ showError(e); return; }
      var a = createAttribute({objectId:o.id, name:name});
      chooseEntity('attribute', a.id);
    }
    function startCreateAttr(text){
      var sq = splitAttrQuery(text), o = sq.objText ? resolveObjectByText(sq.objText) : null;
      if (!validIdentifier(sq.name)){ showError('Имя реквизита — без пробелов и точек и не начинается с цифры.'); return; }
      if (o){ createAttrFor(o, sq.name); return; }
      showError(sq.objText ? 'Объект «' + sq.objText + '» не найден — выберите его.' : '');
      var ob = host.querySelector('.sp-add-object'); ob.hidden = false;
      host.querySelector('.sp-add-object-label').textContent = 'У какого объекта создать реквизит «' + sq.name + '»';
      var oi = buildCombobox(host.querySelector('.sp-add-object-picker'), {
        placeholder:'Начните вводить название объекта…', autoActive:true, emptyText:'Объекты не найдены',
        source:function(q){ return objectComboSource(q).slice(0, 10); },
        onPick:function(it){ createAttrFor(state.objects[it.value], sq.name); }
      });
      oi.focus();
    }
    var input = buildCombobox(host.querySelector('.sp-add-picker'), {
      placeholder:'«Заявка», «Заявка.ПлановаяДата», механизм…', ariaLabel:'Участник шага', autoActive:true, emptyText:'Ничего не найдено',
      source:participantComboSource,
      createLabel:attributeCreateLabel,
      onPick:function(it){
        showError('');
        if (it.create){ startCreateAttr(it.value); return; }
        var d = it.value.indexOf(':');
        chooseEntity(it.value.slice(0, d), it.value.slice(d + 1));
      }
    });
    input.addEventListener('input', function(){ showError(''); host.querySelector('.sp-add-object').hidden = true; });
    host.querySelector('.sp-add-cancel').addEventListener('click', function(){ close(); btn.focus(); });
    host.querySelector('.sp-add').addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
    });
    input.focus();
  });
}

/* ----- Исходы решения ----- */

function stepOutcomesSectionHTML(){
  return '<div class="panel-section is-tight">' +
    '<div class="panel-section-header"><p class="panel-section-title" id="step-outs-title">Исходы</p>' +
      '<button class="btn btn-sm" id="btn-add-outcome" type="button">+ Исход</button></div>' +
    '<div id="step-outs-list"></div>' +
  '</div>';
}
function outcomeTargetText(p, o){
  if (!o.next) return 'Завершение процесса';
  var t = stepById(p, o.next);
  return t ? '→ ' + stepNumbers(p)[t.id] + ' ' + t.name : 'Завершение процесса';
}
/* Исход: подпись (правка по клику), цель — новая ветка / существующий шаг / завершение. Минимум 2 исхода. */
function renderStepOutcomes(p, s, panel){
  var box = panel.querySelector('#step-outs-list'), outs = s.outcomes || (s.outcomes = []);
  panel.querySelector('#step-outs-title').textContent = 'Исходы · ' + outs.length;
  box.innerHTML = outs.map(function(o, i){
    return '<div class="sp-item so-item" data-i="' + i + '">' +
      '<div class="sp-row">' +
        '<span class="so-label" tabindex="0" title="Подпись исхода — нажмите, чтобы изменить">' + escapeHtml(o.label || 'Исход ' + (i + 1)) + '</span>' +
        '<button type="button" class="badge-btn status-badge is-default so-target" aria-haspopup="menu" aria-expanded="false" title="Куда ведёт исход — нажмите, чтобы изменить">' + escapeHtml(outcomeTargetText(p, o)) + '</button>' +
        (outs.length > 2 ? '<button type="button" class="card-menu-btn sp-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с исходом" title="Действия">⋯</button>' : '') +
      '</div>' +
      '<div class="so-pick" hidden></div>' +
    '</div>';
  }).join('');
  function changed(){ persist(); renderRibbon(); renderProcessSidebar(); renderStepOutcomes(p, s, panel); }
  panel.querySelector('#btn-add-outcome').onclick = function(){ outs.push(newOutcome('Исход ' + (outs.length + 1), null)); changed(); };
  box.querySelectorAll('.so-item').forEach(function(item){
    var o = outs[Number(item.getAttribute('data-i'))];
    var label = item.querySelector('.so-label');
    function editLabel(){
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'field-input so-label-input'; input.value = o.label || '';
      input.setAttribute('aria-label', 'Подпись исхода');
      label.replaceWith(input); input.focus(); input.select();
      var done = false;
      function finish(save){
        if (done) return; done = true;
        var v = normalizeLabel(input.value);
        if (save && v && v !== o.label){ o.label = v; persist(); renderRibbon(); }
        renderStepOutcomes(p, s, panel);
      }
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
        else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', function(){ finish(true); });
    }
    label.addEventListener('click', editLabel);
    label.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); editLabel(); } });
    var tBtn = item.querySelector('.so-target');
    tBtn.addEventListener('click', function(){
      openPopoverMenu(tBtn, [
        {value:'new', label:'Новая ветка'},
        {value:'existing', label:'К существующему шагу…', current:!!o.next},
        {value:'end', label:'Завершение процесса', current:!o.next}
      ], function(v){
        if (v === 'new'){ var ns = newStep(); p.steps.push(ns); o.next = ns.id; changed(); }
        else if (v === 'end'){ o.next = null; changed(); }
        else if (v === 'existing'){
          var pick = item.querySelector('.so-pick'); pick.hidden = false;
          var input = buildCombobox(pick, {
            placeholder:'Номер или название шага…', ariaLabel:'Шаг, к которому ведёт исход', autoActive:true, emptyText:'Шаги не найдены',
            source:function(q){
              var k = q.toLowerCase(), nums = stepNumbers(p);
              return orderedSteps(p).filter(function(x){ return x.id !== s.id; })
                .filter(function(x){ return !k || x.name.toLowerCase().indexOf(k) >= 0 || String(nums[x.id]).indexOf(k) === 0; })
                .map(function(x){ return {value:x.id, label:nums[x.id] + ' · ' + x.name, sub:stepKindTitle(x.kind)}; });
            },
            onPick:function(it){ o.next = it.value; changed(); }
          });
          input.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); e.stopPropagation(); renderStepOutcomes(p, s, panel); } });
          input.addEventListener('blur', function(){ setTimeout(function(){ if (pick.isConnected && !pick.contains(document.activeElement)) renderStepOutcomes(p, s, panel); }, 200); });
          input.focus();
        }
      });
    });
    var menu = item.querySelector('.sp-menu');
    if (menu) menu.addEventListener('click', function(){
      openPopoverMenu(menu, [{value:'remove', label:'Удалить исход', danger:true}], function(){
        if (outs.length <= 2) return;
        outs.splice(outs.indexOf(o), 1); changed();
      });
    });
  });
}
