'use strict';

/* ===================== Контроли в карточке шага =====================
   «+ Контроль» → источник (механизм / ручной) → выбор → цели (по умолчанию — объекты и реквизиты
   шага) → реакция → примечание. Автоматический контроль — ссылка на механизм (категория
   «Проверка» — первой в списке), ручной — на справочник контролей, с созданием нового. */

function stepControlsSectionHTML(){
  return '<div class="panel-section is-tight">' +
    '<div class="panel-section-header"><p class="panel-section-title" id="step-ctrls-title">Контроли</p>' +
      '<button class="btn btn-sm" id="btn-add-step-control" type="button" title="Привязать автоматический или ручной контроль">+ Контроль</button></div>' +
    '<div id="step-add-control"></div>' +
    '<div id="step-ctrls-list"></div>' +
  '</div>';
}

/* Механизмы для автоконтроля: сначала категория «Проверка». */
function controlMechanismSource(q){
  return mechanismComboSource(q).sort(function(a, b){
    var ca = state.mechanisms[a.value].category === 'check' ? 0 : 1, cb = state.mechanisms[b.value].category === 'check' ? 0 : 1;
    return ca - cb || a.label.localeCompare(b.label, 'ru');
  });
}
function manualControlSource(q){
  var k = q.toLowerCase();
  return allControls().filter(isShown)
    .filter(function(c){ return !k || c.name.toLowerCase().indexOf(k) >= 0; })
    .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); })
    .map(function(c){ return {value:c.id, label:c.name, sub:controlMomentTitle(c.moment), iconHTML:shieldIconSVG(false)}; });
}
/* Кандидаты в цели: объекты и реквизиты шага + уже выбранные цели. */
function targetCandidates(s, targets){
  var out = [], seen = {};
  function add(t){ var k = t.entityType + ':' + t.entityId; if (!seen[k]){ seen[k] = true; out.push({entityType:t.entityType, entityId:t.entityId}); } }
  s.participants.forEach(function(p){ if (p.entityType !== 'mechanism') add(p); });
  targets.forEach(add);
  return out;
}
function hasTarget(targets, t){ return targets.some(function(x){ return x.entityType === t.entityType && x.entityId === t.entityId; }); }

/* Редактор целей: флажки по кандидатам + поиск другого объекта или реквизита. targets меняется на месте. */
function buildTargetsEditor(container, s, targets, onChange){
  function render(){
    var cands = targetCandidates(s, targets);
    container.innerHTML = '<div class="sc-target-list">' + (cands.length ? cands.map(function(t, i){
      var info = participantInfo(t);
      return '<label class="multi-select-item sc-target"><input type="checkbox" data-i="' + i + '"' + (hasTarget(targets, t) ? ' checked' : '') + '>' +
        info.iconHTML + '<span class="multi-select-item-text">' + escapeHtml(info.label) + '</span></label>';
    }).join('') : '<p class="ref-empty">У шага нет объектов и реквизитов — найдите цель ниже.</p>') + '</div>' +
      '<div class="sc-target-add"></div>';
    container.querySelectorAll('input[type=checkbox]').forEach(function(cb){
      cb.addEventListener('change', function(){
        var t = cands[Number(cb.getAttribute('data-i'))];
        if (cb.checked){ if (!hasTarget(targets, t)) targets.push(t); }
        else { var i = targets.findIndex(function(x){ return x.entityType === t.entityType && x.entityId === t.entityId; }); if (i >= 0) targets.splice(i, 1); }
        onChange();
      });
    });
    var input = buildCombobox(container.querySelector('.sc-target-add'), {
      placeholder:'Другой объект или реквизит…', ariaLabel:'Добавить цель контроля', autoActive:true, emptyText:'Ничего не найдено',
      source:function(q){ return participantComboSource(q).filter(function(it){ return it.value.indexOf('mechanism:') !== 0; }); },
      onPick:function(it){
        var d = it.value.indexOf(':'), t = {entityType:it.value.slice(0, d), entityId:it.value.slice(d + 1)};
        if (!hasTarget(targets, t)) targets.push(t);
        onChange(); render();
        container.querySelector('.sc-target-add .combo-input').focus();
      }
    });
    return input;
  }
  render();
}

function renderStepControls(p, s, panel){
  var box = panel.querySelector('#step-ctrls-list'), list = stepControls(s);
  panel.querySelector('#step-ctrls-title').textContent = 'Контроли · ' + list.length;
  if (!list.length){ box.innerHTML = '<p class="ref-empty">Контролей нет.</p>'; return; }
  box.innerHTML = list.map(function(c, i){
    var info = stepControlInfo(c), r = controlReaction(c.reaction);
    return '<div class="sp-item sc-item" data-i="' + i + '">' +
      '<div class="sp-row">' +
        (info.broken ? '<span class="sp-name ref-broken">' + escapeHtml(info.label) + '</span>'
                     : '<button type="button" class="sp-name ref-link" title="' + (info.auto ? 'Автоматический контроль (механизм)' : 'Ручной контроль') + '">' + info.iconHTML + '<span>' + escapeHtml(info.label) + '</span></button>') +
        '<button type="button" class="badge-btn status-badge is-default sc-reaction-btn" aria-haspopup="menu" aria-expanded="false" title="Реакция — нажмите, чтобы изменить">' + r.letter + ' · ' + escapeHtml(r.title.toLowerCase()) + '</button>' +
        '<button type="button" class="card-menu-btn sp-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с контролем" title="Действия">⋯</button>' +
      '</div>' +
      (info.temp ? '<div class="sc-temp">временный → ' + escapeHtml(info.temp) + '</div>' : '') +
      '<div class="sc-targets' + (c.targets.length ? '' : ' is-empty') + '" tabindex="0" title="Цели — нажмите, чтобы изменить">' +
        (c.targets.length ? 'Цели: ' + escapeHtml(targetsText(c)) : '+ цели') + '</div>' +
      '<div class="sp-note' + (c.note ? '' : ' is-empty') + '" tabindex="0" title="Примечание — нажмите, чтобы изменить">' + (c.note ? escapeHtml(c.note) : '+ примечание') + '</div>' +
    '</div>';
  }).join('');

  function changed(){ persist(); renderRibbon(); renderStepControls(p, s, panel); }
  box.querySelectorAll('.sc-item').forEach(function(item){
    var c = list[Number(item.getAttribute('data-i'))];
    var name = item.querySelector('button.sp-name');
    if (name) name.addEventListener('click', function(){ openFromStep(c.source === 'mechanism' ? 'mech' : 'ctrl', c.sourceId); });
    var rBtn = item.querySelector('.sc-reaction-btn');
    rBtn.addEventListener('click', function(){
      openPopoverMenu(rBtn, CONTROL_REACTIONS.map(function(r){ return {value:r.code, label:r.letter + ' · ' + r.title, current:r.code === c.reaction}; }),
        function(code){ if (code !== c.reaction){ c.reaction = code; changed(); } });
    });
    var menu = item.querySelector('.sp-menu');
    menu.addEventListener('click', function(){
      openPopoverMenu(menu, [{value:'remove', label:'Убрать из шага', danger:true}], function(){ list.splice(list.indexOf(c), 1); changed(); });
    });
    var tgt = item.querySelector('.sc-targets');
    function editTargets(){
      var ed = document.createElement('div'); ed.className = 'om-add sc-targets-edit';
      tgt.replaceWith(ed);
      var inner = document.createElement('div'); ed.appendChild(inner);
      var actions = document.createElement('div'); actions.className = 'om-add-actions';
      actions.innerHTML = '<button type="button" class="btn btn-sm btn-accent">Готово</button>';
      ed.appendChild(actions);
      buildTargetsEditor(inner, s, c.targets, function(){ persist(); renderRibbon(); });
      actions.querySelector('button').addEventListener('click', function(){ renderStepControls(p, s, panel); });
      ed.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); e.stopPropagation(); renderStepControls(p, s, panel); } });
    }
    tgt.addEventListener('click', editTargets);
    tgt.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); editTargets(); } });
    var note = item.querySelector('.sp-note');
    function editNote(){
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'field-input sp-note-input'; input.value = c.note || '';
      input.placeholder = 'Примечание'; input.setAttribute('aria-label', 'Примечание');
      note.replaceWith(input); input.focus();
      var done = false;
      function finish(save){
        if (done) return; done = true;
        var v = normalizeLabel(input.value);
        if (save && v !== (c.note || '')){ c.note = v; persist(); }
        renderStepControls(p, s, panel);
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

var DEFAULT_REACTION = { mechanism:'block', manual:'inform' };

function bindAddStepControl(p, s, panel){
  var btn = panel.querySelector('#btn-add-step-control'), host = panel.querySelector('#step-add-control');
  function close(){ host.innerHTML = ''; }
  btn.addEventListener('click', function(){
    if (host.firstChild){ close(); return; }
    var source = 'mechanism', chosen = null, reaction = DEFAULT_REACTION.mechanism, reactionTouched = false;
    var targets = targetCandidates(s, []);
    host.innerHTML = '<div class="om-add sc-add">' +
      '<div><div class="om-add-label">Источник</div><div class="om-add-roles sc-src">' +
        '<button type="button" class="om-add-role is-on" data-src="mechanism">' + shieldIconSVG(true) + ' Механизм</button>' +
        '<button type="button" class="om-add-role" data-src="manual">' + shieldIconSVG(false) + ' Ручной</button></div></div>' +
      '<div><div class="om-add-label sc-pick-label"></div><div class="sc-pick"></div></div>' +
      '<div><div class="om-add-label">Цели — объекты и реквизиты</div><div class="sc-targets-box"></div></div>' +
      '<div><div class="om-add-label">Реакция</div><div class="om-add-roles sc-reactions">' +
        CONTROL_REACTIONS.map(function(r){ return '<button type="button" class="om-add-role" data-reaction="' + r.code + '">' + r.letter + ' · ' + escapeHtml(r.title) + '</button>'; }).join('') +
      '</div></div>' +
      '<div><div class="om-add-label">Примечание (необязательно)</div><input type="text" class="field-input sc-note" autocomplete="off"></div>' +
      '<div class="om-add-actions"><button type="button" class="btn btn-sm sc-cancel">Отмена</button><button type="button" class="btn btn-sm btn-accent sc-ok" disabled>Добавить</button></div>' +
    '</div>';
    var ok = host.querySelector('.sc-ok');
    function syncReaction(){
      host.querySelectorAll('.sc-reactions .om-add-role').forEach(function(b){ b.classList.toggle('is-on', b.getAttribute('data-reaction') === reaction); });
    }
    function buildPicker(){
      chosen = null; ok.disabled = true;
      host.querySelector('.sc-pick-label').textContent = source === 'mechanism' ? 'Механизм (категория «Проверка» — первой)' : 'Ручной контроль из справочника';
      var input = buildCombobox(host.querySelector('.sc-pick'), {
        placeholder:source === 'mechanism' ? 'Начните вводить название механизма…' : 'Начните вводить название контроля…',
        ariaLabel:source === 'mechanism' ? 'Механизм-контроль' : 'Ручной контроль', autoActive:true,
        emptyText:source === 'mechanism' ? 'Механизмы не найдены' : 'Контролей пока нет — введите название, чтобы создать',
        source:source === 'mechanism' ? controlMechanismSource : manualControlSource,
        createLabel:source === 'manual' ? function(q){
          if (!q) return null;
          var k = normalizeLabel(q).toLowerCase();
          return allControls().some(function(c){ return c.name.toLowerCase() === k; }) ? null : '+ Создать контроль «' + normalizeLabel(q) + '»';
        } : null,
        onPick:function(it){
          chosen = it.create ? {createName:normalizeLabel(it.value)} : {id:it.value};
          input.value = it.create ? normalizeLabel(it.value) : it.label;
          ok.disabled = false;
        }
      });
      input.addEventListener('input', function(){ chosen = null; ok.disabled = true; });
      return input;
    }
    host.querySelectorAll('.sc-src .om-add-role').forEach(function(b){
      b.addEventListener('click', function(){
        source = b.getAttribute('data-src');
        host.querySelectorAll('.sc-src .om-add-role').forEach(function(x){ x.classList.toggle('is-on', x === b); });
        if (!reactionTouched){ reaction = DEFAULT_REACTION[source]; syncReaction(); }
        buildPicker().focus();
      });
    });
    host.querySelectorAll('.sc-reactions .om-add-role').forEach(function(b){
      b.addEventListener('click', function(){ reaction = b.getAttribute('data-reaction'); reactionTouched = true; syncReaction(); });
    });
    buildTargetsEditor(host.querySelector('.sc-targets-box'), s, targets, function(){});
    syncReaction();
    host.querySelector('.sc-cancel').addEventListener('click', function(){ close(); btn.focus(); });
    host.querySelector('.sc-add').addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
    });
    ok.addEventListener('click', function(){
      if (!chosen) return;
      var created = null, id = chosen.id;
      if (chosen.createName){ created = createControl({name:chosen.createName}); id = created.id; }
      stepControls(s).push({source:source, sourceId:id, targets:targets.slice(), reaction:reaction, note:normalizeLabel(host.querySelector('.sc-note').value)});
      persist(); renderRibbon(); renderStepControls(p, s, panel); close();
      /* Новый ручной контроль — сразу открыть для заполнения (с возвратом к шагу). */
      if (created) openFromStep('ctrl', created.id);
      else btn.focus();
    });
    buildPicker().focus();
  });
}
