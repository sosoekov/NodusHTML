'use strict';

/* ===================== Панель деталей ===================== */

function showPanel(kind){
  document.getElementById('panel-empty').hidden = !!kind;
  ['object','mechanism','edge','role','control'].forEach(function(k){
    document.getElementById('panel-'+k).hidden = (k!==kind);
  });
  if (pinnedAux && AUX_KINDS[pinnedAux.kind].panel !== kind) pinnedAux = null;
  updateDetailPanelVisibility();
}

/* Правая панель одна на оба режима. В «Графе» видна всегда; в «Списке» — только
   с открытой карточкой объекта или механизма (список при этом сужается). */
function updateDetailPanelVisibility(){
  var hasCard = ['object','mechanism','role','control'].some(function(k){ return !document.getElementById('panel-' + k).hidden; });
  var show = currentView === 'graph' || hasCard;
  document.getElementById('detail-panel').hidden = !show;
  document.getElementById('resize-right').hidden = !show;
}
function bindField(panel, sel, evt, handler){
  var el = panel.querySelector(sel);
  if (!el) return;
  el.addEventListener(evt, function(){ handler(el.value); });
}

/* ===================== Общие части карточек ===================== */

/* Заголовок карточки редактируется по клику: Enter / уход фокуса — сохранить,
   Esc — отменить. Пустое название не сохраняется. validate(v) — необязательная проверка:
   вернула текст ошибки — значение не сохраняется, ошибка показывается под заголовком. */
function bindInlineTitle(panel, getValue, setValue, fieldLabel, validate){
  var h = panel.querySelector('.inline-title');
  var msg = panel.querySelector('.inline-msg');
  var msgTimer = null;
  function showMsg(text){
    msg.textContent = text; msg.hidden = false;
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(function(){ msg.hidden = true; }, 2500);
  }
  function start(){
    if (panel.querySelector('.inline-title-input')) return;
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'field-input inline-title-input';
    input.value = getValue();
    input.setAttribute('aria-label', fieldLabel || 'Название');
    input.placeholder = fieldLabel || 'Название';
    input.title = fieldLabel || 'Название';
    h.hidden = true;
    h.parentNode.insertBefore(input, h.nextSibling);
    input.focus(); input.select();
    var finished = false;
    function finish(save){
      if (finished) return; finished = true;
      var v = input.value.trim(), err;
      if (save && !v) showMsg((fieldLabel || 'Название') + ' не может быть пустым — оставлено прежнее.');
      else if (save && v !== getValue() && validate && (err = validate(v))) showMsg(err + ' Оставлено прежнее.');
      else if (save && v !== getValue()) setValue(v);
      h.textContent = getValue();
      input.remove(); h.hidden = false;
    }
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); finish(true); h.focus(); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); h.focus(); }
    });
    input.addEventListener('blur', function(){ finish(true); });
  }
  h.addEventListener('click', start);
  h.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); start(); } });
  panel.querySelectorAll('.save-indicator').forEach(renderSaveIndicator);
}

/* Всплывающее меню у кнопки/бейджа. items: [{value, label, icon?, color?, current?, danger?, sep?}] */
var popoverMenu = null;
function closePopoverMenu(){
  if (!popoverMenu) return;
  popoverMenu.anchor.setAttribute('aria-expanded', 'false');
  popoverMenu.el.remove();
  document.removeEventListener('mousedown', popoverMenu.outside, true);
  popoverMenu = null;
}
function openPopoverMenu(anchor, items, onPick){
  var reopen = popoverMenu && popoverMenu.anchor === anchor;
  closePopoverMenu();
  if (reopen) return;
  var el = document.createElement('div');
  el.className = 'menu popover-menu';
  el.setAttribute('role', 'menu');
  el.innerHTML = items.map(function(it, i){
    if (it.sep) return '<div class="menu-sep" role="separator"></div>';
    return '<button type="button" role="menuitem" class="menu-item' + (it.danger ? ' menu-item-danger' : '') + (it.current ? ' is-current' : '') + '" data-i="' + i + '"' +
      (it.color ? ' style="--c:' + it.color + '"' : '') + '>' + (it.icon || '') + '<span>' + escapeHtml(it.label) + '</span></button>';
  }).join('');
  document.body.appendChild(el);
  var r = anchor.getBoundingClientRect();
  var left = Math.min(r.left, window.innerWidth - el.offsetWidth - 8);
  var top = r.bottom + 4;
  if (top + el.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - el.offsetHeight - 4);
  el.style.left = Math.max(8, left) + 'px'; el.style.top = top + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  var outside = function(ev){ if (!el.contains(ev.target) && !anchor.contains(ev.target)) closePopoverMenu(); };
  popoverMenu = {el:el, anchor:anchor, outside:outside};
  document.addEventListener('mousedown', outside, true);
  el.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closePopoverMenu(); anchor.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault(); e.stopPropagation();
      var btns = Array.prototype.slice.call(el.querySelectorAll('.menu-item'));
      var i = btns.indexOf(document.activeElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus();
    }
  });
  el.querySelectorAll('.menu-item').forEach(function(b){
    b.addEventListener('click', function(){ var it = items[Number(b.getAttribute('data-i'))]; closePopoverMenu(); onPick(it.value); });
  });
  var first = el.querySelector('.is-current') || el.querySelector('.menu-item');
  if (first) first.focus();
}

var PENCIL_SVG = '<svg class="vfield-pencil" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z"/></svg>';

/* Поле карточки в режиме просмотра: значение текстом; клик — редактирование;
   Enter (в многострочном — Ctrl+Enter) или уход фокуса — сохранить, Esc — отменить. */
function viewFieldHTML(key, label){
  return '<div class="vfield" data-key="' + key + '"><div class="vfield-label">' + escapeHtml(label) + '</div>' +
    '<div class="vfield-value" tabindex="0"></div></div>';
}
function bindViewField(panel, key, opt){
  var wrap = panel.querySelector('.vfield[data-key="' + key + '"]');
  var view = wrap.querySelector('.vfield-value');
  function renderView(){
    var v = opt.get();
    var empty = opt.isEmpty ? opt.isEmpty(v) : !(v || '').trim();
    view.classList.toggle('is-empty', empty);
    view.innerHTML = empty ? '+ ' + escapeHtml(opt.addText) : (opt.format ? opt.format(v) : escapeHtml(v)) + PENCIL_SVG;
    view.title = empty ? '' : 'Нажмите, чтобы изменить';
  }
  function edit(){
    var input = document.createElement(opt.multiline ? 'textarea' : 'input');
    if (!opt.multiline) input.type = 'text';
    input.className = 'field-input vfield-input' + (opt.multiline ? ' vfield-textarea' : '');
    input.value = opt.toText ? opt.toText(opt.get()) : (opt.get() || '');
    if (opt.placeholder) input.placeholder = opt.placeholder;
    input.setAttribute('aria-label', opt.label);
    view.hidden = true;
    wrap.appendChild(input);
    function fit(){
      if (!opt.multiline) return;
      var scroller = panel.closest('#detail-panel') || panel;
      var cap = Math.max(120, scroller.clientHeight * 0.6);
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight + 2, cap) + 'px';
      input.style.overflowY = input.scrollHeight + 2 > cap ? 'auto' : 'hidden';
    }
    input.addEventListener('input', fit);
    fit(); input.focus();
    var done = false;
    function finish(save){
      if (done) return; done = true;
      if (save){
        var nv = opt.fromText ? opt.fromText(input.value) : input.value;
        if (JSON.stringify(nv) !== JSON.stringify(opt.get())) opt.set(nv);
      }
      input.remove(); view.hidden = false; renderView();
    }
    input.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); view.focus(); }
      else if (e.key === 'Enter' && (!opt.multiline || e.ctrlKey || e.metaKey)){ e.preventDefault(); finish(true); view.focus(); }
    });
    input.addEventListener('blur', function(){ finish(true); });
  }
  view.addEventListener('click', edit);
  view.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); edit(); } });
  renderView();
}

function statusBadgeButtonHTML(code, isMech){
  var def = isMech ? DEFAULT_MECH_STATUS : DEFAULT_OBJECT_STATUS;
  var title = isMech ? mechanismStatusTitle(code) : objectStatusTitle(code);
  return '<button type="button" class="badge-btn status-badge status-' + statusKind(code) + (code === def ? ' is-default' : '') +
    '" aria-haspopup="menu" aria-expanded="false" title="Статус — нажмите, чтобы изменить">' + escapeHtml(title) + '</button>';
}
function bindStatusBadge(panel, entity, isMech){
  var btn = panel.querySelector('.status-badge');
  btn.addEventListener('click', function(){
    var list = isMech ? MECH_STATUSES : OBJECT_STATUSES;
    openPopoverMenu(btn, list.map(function(s){
      return {value:s.code, label:STATUS_TITLES[s.kind], current:s.code === entity.status};
    }), function(code){
      if (code === entity.status) return;
      entity.status = code; persist(); syncGraphModel(); renderSidebar();
      if (currentView === 'list') renderListView();
      var holder = document.createElement('div'); holder.innerHTML = statusBadgeButtonHTML(code, isMech);
      btn.replaceWith(holder.firstChild);
      bindStatusBadge(panel, entity, isMech);
    });
  });
}

function cardMenuButtonHTML(){
  return '<button type="button" class="card-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Действия" title="Действия">⋯</button>';
}

/* ----- Имя в конфигураторе: префикс вида метаданных + идентификатор.
   Хранится по-прежнему одной строкой fullName («Документ.ЗаявкаНаПодборПерсонала»). ----- */
function splitFullName(fullName){
  var s = fullName || '', d = s.indexOf('.');
  return d < 0 ? {prefix:'', id:s} : {prefix:s.slice(0, d), id:s.slice(d + 1)};
}
function fullNamePrefix(obj){
  var t = typeInfo(obj.type);
  return t ? t.name1c : splitFullName(obj.fullName).prefix;
}
function validIdentifier(v){ return !v || (!/[\s.]/.test(v) && !/^\d/.test(v)); }
var IDENTIFIER_RULE = 'Идентификатор — без пробелов и точек и не начинается с цифры.';

function name1cHTML(obj){
  var id = splitFullName(obj.fullName).id, prefix = fullNamePrefix(obj);
  return '<div class="name1c" title="Имя в конфигураторе' + (obj.fullName ? ': ' + escapeHtml(obj.fullName) : '') + '">' +
    (prefix ? '<span class="name1c-prefix">' + escapeHtml(prefix) + '.</span>' : '') +
    '<span class="name1c-id' + (id ? '' : ' is-empty') + '" tabindex="0">' + (id ? escapeHtml(id) : '+ Добавить имя в конфигураторе') + '</span>' +
    (id ? '<button type="button" class="copy-btn" title="Скопировать имя в конфигураторе">Копировать</button><span class="copy-ok" hidden>Скопировано</span>' : '') +
  '</div><p class="field-error" hidden></p>';
}
function copyText(text, done){
  function fallback(){
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); }catch(e){}
    ta.remove(); done();
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
}
function bindName1c(panel, obj){
  var box = panel.querySelector('.name1c'), err = panel.querySelector('.field-error');
  var idEl = box.querySelector('.name1c-id');
  var copy = box.querySelector('.copy-btn');
  if (copy) copy.addEventListener('click', function(){
    copyText(obj.fullName, function(){
      var ok = box.querySelector('.copy-ok'); ok.hidden = false;
      setTimeout(function(){ ok.hidden = true; }, 1200);
    });
  });
  function rerender(errText){
    var holder = document.createElement('div'); holder.innerHTML = name1cHTML(obj);
    box.replaceWith(holder.firstChild); err.replaceWith(holder.firstChild);
    bindName1c(panel, obj);
    if (errText){ var e2 = panel.querySelector('.field-error'); e2.textContent = errText; e2.hidden = false; }
  }
  function edit(){
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'field-input name1c-input';
    input.value = splitFullName(obj.fullName).id;
    input.placeholder = 'Идентификатор'; input.setAttribute('aria-label', 'Имя в конфигураторе: идентификатор');
    idEl.replaceWith(input);
    if (copy){ copy.remove(); var ok = box.querySelector('.copy-ok'); if (ok) ok.remove(); }
    input.focus(); input.select();
    var done = false;
    function commit(){
      var v = input.value.trim();
      if (!validIdentifier(v)){ err.textContent = IDENTIFIER_RULE; err.hidden = false; return false; }
      done = true;
      var prefix = fullNamePrefix(obj);
      var next = v ? (prefix ? prefix + '.' + v : v) : '';
      if (next !== (obj.fullName || '')){ obj.fullName = next; persist(); if (currentView === 'list') renderListView(); }
      rerender();
      return true;
    }
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); commit(); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); done = true; rerender(); }
    });
    input.addEventListener('input', function(){ if (validIdentifier(input.value.trim())) err.hidden = true; });
    /* Уход фокуса с некорректным значением: значение не сохраняется, прежнее возвращается. */
    input.addEventListener('blur', function(){
      if (done) return;
      if (!validIdentifier(input.value.trim())){ done = true; rerender(IDENTIFIER_RULE + ' Значение не сохранено.'); return; }
      commit();
    });
  }
  idEl.addEventListener('click', edit);
  idEl.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); edit(); } });
}

function startInlineTitleEdit(panel){
  var h = panel && panel.querySelector('.inline-title');
  if (h) h.click();
}

/* ----- Подробное описание: просмотр с чипами-ссылками на объекты ----- */

function normWord(w){ return w.toLowerCase().replace(/ё/g, 'е'); }
function splitWords(s){ return normWord(s).split(/[^0-9a-zа-я]+/i).filter(Boolean); }
function commonPrefix(a, b){ var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
/* Слова считаются одним, если совпадают или отличаются только окончанием (до 2 букв):
   «Заявки» ~ «Заявка», «Проекта» ~ «Проекты». */
function wordsMatch(a, b){
  if (a === b) return 2;
  var shorter = Math.min(a.length, b.length);
  if (shorter < 4) return 0;
  return commonPrefix(a, b) >= Math.max(3, shorter - 2) && Math.abs(a.length - b.length) <= 2 ? 1 : 0;
}
function findObjectByMention(text){
  var words = splitWords(text);
  if (!words.length) return null;
  var best = null, bestScore = -1;
  Object.keys(state.objects).forEach(function(id){
    var nw = splitWords(state.objects[id].name);
    if (nw.length !== words.length) return;
    var score = 0;
    for (var i = 0; i < nw.length; i++){ var m = wordsMatch(words[i], nw[i]); if (!m) return; score += m; }
    if (score > bestScore){ bestScore = score; best = id; }
  });
  return best;
}
function renderBodyHTML(text){
  var out = '', last = 0, re = /\[([^\[\]\n]{1,160})\]/g, m;
  while ((m = re.exec(text))){
    out += escapeHtml(text.slice(last, m.index));
    var oid = findObjectByMention(m[1]);
    if (oid){
      var o = state.objects[oid];
      out += '<button type="button" class="obj-chip" data-obj="' + oid + '" style="--c:' + typeColor(o.type) + '" title="' + escapeHtml(o.name) + '">' + escapeHtml(m[1]) + '</button>';
    } else {
      out += escapeHtml(m[0]);
    }
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/* Подсветка объекта на графе при наведении на чип / участника (не меняет выделение). */
var graphHint = null; /* {objId, mechId?} | {mechOnly} */
function setGraphHint(hint){
  graphHint = hint;
  requestRender();
}

function openObjectFromCard(panel, objId, isSidebar){
  if (!state.objects[objId]) return;
  setGraphHint(null);
  selectEntity('obj', objId);
}

function bindBodyEditor(panel, isSidebar, getValue, setValue, placeholder){
  var view = panel.querySelector('.body-view');
  var ta = panel.querySelector('.body-edit');
  var editBtn = panel.querySelector('.body-edit-btn');
  function renderView(){
    var v = getValue() || '';
    view.classList.toggle('is-empty', !v.trim());
    view.innerHTML = v.trim() ? renderBodyHTML(v) : escapeHtml(placeholder);
  }
  function autosize(){
    var scroller = panel.closest('#detail-panel') || panel.closest('.modal-body') || panel;
    var cap = Math.max(120, scroller.clientHeight * 0.6);
    ta.style.height = 'auto';
    var hgt = Math.min(ta.scrollHeight + 2, cap);
    ta.style.height = hgt + 'px';
    ta.style.overflowY = ta.scrollHeight + 2 > cap ? 'auto' : 'hidden';
  }
  function edit(){
    view.hidden = true; ta.hidden = false; editBtn.hidden = true;
    ta.value = getValue() || '';
    autosize(); ta.focus();
  }
  view.addEventListener('click', function(e){
    var chip = e.target.closest('.obj-chip');
    if (chip){ openObjectFromCard(panel, chip.getAttribute('data-obj'), isSidebar); return; }
    edit();
  });
  view.addEventListener('mouseover', function(e){
    var chip = e.target.closest('.obj-chip');
    var id = chip ? chip.getAttribute('data-obj') : null;
    if ((graphHint && graphHint.objId) !== id) setGraphHint(id ? {objId:id} : null);
  });
  view.addEventListener('mouseleave', function(){ if (graphHint) setGraphHint(null); });
  editBtn.addEventListener('click', edit);
  ta.addEventListener('input', function(){ setValue(ta.value); autosize(); });
  ta.addEventListener('blur', function(){
    ta.hidden = true; view.hidden = false; editBtn.hidden = false;
    renderView();
  });
  renderView();
}

function objectPanelTemplate(obj){
  var color = typeInfo(obj.type) ? typeColor(obj.type) : THEME.typeUnknown;
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="card-icon" style="--c:' + color + '">' + typeIconSVG(obj.type) + '</span>' +
        '<h2 class="inline-title" tabindex="0" title="Синоним — нажмите, чтобы изменить">' + escapeHtml(obj.name) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges">' +
        '<button type="button" class="badge-btn cat-badge type-badge" style="--cat:' + color + '" aria-haspopup="menu" aria-expanded="false" title="Тип — нажмите, чтобы изменить">' + escapeHtml(typeTitle(obj.type)) + '</button>' +
        statusBadgeButtonHTML(obj.status, false) +
      '</div>' +
      name1cHTML(obj) +
    '</div>' +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title" id="obj-mech-title">Участвует в механизмах</p>' +
        '<button class="btn btn-sm" id="btn-add-to-mech" type="button" title="Добавить объект в механизм" aria-label="Добавить в механизм">+ Добавить</button></div>' +
      '<div id="obj-add-to-mech"></div>' +
      '<div id="obj-mech-list"></div>' +
    '</div>' +
    attributesSectionHTML() +
    '<div id="obj-tool-controls"></div>' +
    viewFieldHTML('description', 'Описание') +
    '<div class="vfield" data-key="subtags"><div class="vfield-label">Подсистема · Теги</div><div class="vfield-value" tabindex="0"></div></div>' +
    '<div class="panel-section is-tight">' +
      '<div class="panel-section-header"><p class="panel-section-title">Вложения</p>' +
        '<button class="btn btn-sm" id="btn-attach-object" type="button">Прикрепить файл</button></div>' +
      '<div id="obj-attachments-list"></div>' +
    '</div>'
  );
}

/* Подсистема и теги: в просмотре — одна строка чипов; по клику — два редактора чипов.
   Каждое добавление/удаление сохраняется сразу; из редактирования выходим, когда фокус
   уходит из блока, или по Esc. */
function bindSubsystemsTags(panel, obj){
  var wrap = panel.querySelector('.vfield[data-key="subtags"]');
  var view = wrap.querySelector('.vfield-value');
  function renderView(){
    var subs = objectSubsystems(obj), tags = obj.tags || [];
    var empty = !subs.length && !tags.length;
    view.classList.toggle('is-empty', empty);
    view.title = empty ? '' : 'Нажмите, чтобы изменить';
    view.innerHTML = empty ? '+ Добавить подсистему или теги' :
      '<div class="chips-view">' +
        subs.map(function(s){ return '<span class="sub-chip" title="Подсистема">' + typeIconSVG('subsystem') + escapeHtml(s) + '</span>'; }).join('') +
        tags.map(function(t){ return '<span class="tag-chip" title="Тег">' + escapeHtml(t) + '</span>'; }).join('') +
      '</div>' + PENCIL_SVG;
  }
  function edit(focusTags){
    view.hidden = true;
    var box = document.createElement('div');
    box.className = 'subtags-edit';
    box.innerHTML = '<div class="chip-edit-group"><div class="chip-edit-label">Подсистемы</div><div class="ce-subs"></div></div>' +
                    '<div class="chip-edit-group"><div class="chip-edit-label">Теги</div><div class="ce-tags"></div></div>';
    wrap.appendChild(box);
    var subsEd = buildChipEditor(box.querySelector('.ce-subs'), {
      label:'Подсистемы', placeholder:'Начните вводить подсистему…', chipClass:'sub-chip', createLabel:'Создать',
      values:function(){ return objectSubsystems(obj); }, suggestions:allSubsystems,
      onChange:function(list){ setObjectSubsystems(obj, list); persist(); renderSidebar(); if (currentView === 'list') renderListView(); }
    });
    var tagsEd = buildChipEditor(box.querySelector('.ce-tags'), {
      label:'Теги', placeholder:'Тег, Enter или запятая', freeCreate:true, createLabel:'Добавить тег',
      values:function(){ return obj.tags || []; }, suggestions:allTags,
      onChange:function(list){ obj.tags = list; persist(); renderSidebar(); if (currentView === 'list') renderListView(); }
    });
    (focusTags ? tagsEd : subsEd).focus();
    function close(){ box.remove(); view.hidden = false; renderView(); }
    box.addEventListener('focusout', function(){
      setTimeout(function(){ if (box.isConnected && !box.contains(document.activeElement)) close(); }, 0);
    });
    box.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){
        var dd = box.querySelector('.combo-dropdown:not([hidden])');
        if (dd) return;
        e.preventDefault(); e.stopPropagation(); close(); view.focus();
      }
    });
  }
  view.addEventListener('click', function(e){ edit(!!(e.target.closest && e.target.closest('.tag-chip'))); });
  view.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); edit(false); } });
  renderView();
}

function changeObjectType(obj, code){
  if (!code || code === obj.type) return;
  function apply(){
    var id = splitFullName(obj.fullName).id;
    obj.type = code;
    /* Префикс имени в конфигураторе следует за типом. */
    if (id) obj.fullName = typeInfo(code).name1c + '.' + id;
    persist(); syncGraphModel(); renderSidebar();
    if (currentView === 'list') renderListView();
    renderObjectPanel(obj);
  }
  var n = objectMechanismCounts()[obj.id] || 0;
  if (!n){ apply(); return; }
  openModal({
    title:'Сменить тип объекта?',
    bodyHTML:'<p>«' + escapeHtml(obj.name) + '» участвует в ' + n + ' ' + pluralRu(n,'механизме','механизмах','механизмах') +
      '. Тип изменится с «' + escapeHtml(typeTitle(obj.type)) + '» на «' + escapeHtml(typeTitle(code)) + '».</p>',
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Сменить тип', variant:'primary', onClick:function(){ apply(); }}
    ]
  });
}

function renderObjectPanel(obj, panel){
  if (!obj) return;
  panel = panel || document.getElementById('panel-object');
  showPanel('object');
  panel.innerHTML = objectPanelTemplate(obj);
  bindInlineTitle(panel, function(){ return obj.name; }, function(v){
    obj.name=v; persist(); syncGraphModel(); renderSidebar(); updateStats();
    if (currentView === 'list') renderListView();
  }, 'Синоним');
  var typeBtn = panel.querySelector('.type-badge');
  typeBtn.addEventListener('click', function(){
    openPopoverMenu(typeBtn, OBJECT_TYPES.map(function(t){
      return {value:t.code, label:t.title, icon:typeIconSVG(t.code), color:typeColor(t.code), current:t.code === obj.type};
    }), function(code){ changeObjectType(obj, code); });
  });
  bindStatusBadge(panel, obj, false);
  bindName1c(panel, obj);
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){
    openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить объект', danger:true}], function(){ deleteObject(obj.id); });
  });
  bindViewField(panel, 'description', {label:'Описание', addText:'Добавить описание', multiline:true,
    get:function(){ return obj.description || ''; }, set:function(v){ obj.description = v; persist(); }});
  bindSubsystemsTags(panel, obj);
  panel.querySelector('#btn-attach-object').addEventListener('click', function(){
    attachFilesToEntity('obj', obj.id, function(){ renderAttachmentsList(panel, '#obj-attachments-list', 'obj', obj.id); });
  });
  renderObjectMechList(obj, panel);
  bindAddToMechanism(panel, obj);
  renderAttributesBlock(obj, panel);
  bindAddAttribute(panel, obj);
  renderControlBackLinks(panel.querySelector('#obj-tool-controls'), 'Инструмент для контролей', controlsByTool(obj.id));
  renderAttachmentsList(panel, '#obj-attachments-list', 'obj', obj.id);
}

/* Роли объекта в механизме → группы блока «Участвует в механизмах». Объект с двумя ролями
   в одном механизме попадает в обе группы. */
function participantRolesByObject(mech){
  var order = [], roles = {};
  mech.participants.forEach(function(p){
    if (!p.objectId || !state.objects[p.objectId]) return;
    if (!roles[p.objectId]){ roles[p.objectId] = []; order.push(p.objectId); }
    var title = roleInfo(p.role).title;
    if (roles[p.objectId].indexOf(title) < 0) roles[p.objectId].push(title);
  });
  return {order:order, roles:roles};
}
function objectRoleGroupKey(roleCode){
  var r = roleInfo(roleCode);
  if (r.direction === 'target') return {key:'in', title:'Получает данные из', order:0};
  if (r.direction === 'source') return {key:'out', title:'Передаёт данные в', order:1};
  return {key:'role:' + r.code, title:r.title, order:2};
}
/* Механизмы в карточке по умолчанию свёрнуты. Развёрнутое пользователем помнится, пока открыт
   тот же объект (перерисовки карточки), и сбрасывается при открытии другого объекта. */
var omCollapsed = {}; /* ключ «объект|группа|механизм» → true/false */
var omCollapsedFor = null;

function renderObjectMechList(obj, panel){
  if (omCollapsedFor !== obj.id){ omCollapsed = {}; omCollapsedFor = obj.id; }
  var container = panel.querySelector('#obj-mech-list');
  if (!container) return;
  var groups = {}, mechIds = {};
  Object.keys(state.mechanisms).forEach(function(mid){
    var m = state.mechanisms[mid];
    m.participants.forEach(function(p){
      if (p.objectId !== obj.id) return;
      var g = objectRoleGroupKey(p.role);
      var grp = groups[g.key] || (groups[g.key] = {title:g.title, order:g.order, items:{} , list:[]});
      if (!grp.items[mid]){ grp.items[mid] = {mech:m, notes:[]}; grp.list.push(mid); }
      if (p.note && grp.items[mid].notes.indexOf(p.note) < 0) grp.items[mid].notes.push(p.note);
      mechIds[mid] = true;
    });
  });
  var total = Object.keys(mechIds).length;
  var titleEl = panel.querySelector('#obj-mech-title');
  if (titleEl) titleEl.textContent = 'Участвует в механизмах · ' + total;
  if (!total){ container.innerHTML = '<p class="ref-empty">Пока не участвует ни в одном механизме.</p>'; return; }

  var ordered = Object.keys(groups).map(function(k){ return {key:k, g:groups[k]}; })
    .sort(function(a,b){ return a.g.order - b.g.order || a.g.title.localeCompare(b.g.title,'ru'); });
  container.innerHTML = ordered.map(function(x){
    var g = x.g;
    return '<div class="om-group"><p class="om-group-title">' + escapeHtml(g.title) + '</p>' +
      g.list.map(function(mid){
        var it = g.items[mid], m = it.mech;
        var ck = obj.id + '|' + x.key + '|' + mid;
        var collapsed = (ck in omCollapsed) ? omCollapsed[ck] : true;
        var parts = participantRolesByObject(m);
        var notesByObj = {};
        m.participants.forEach(function(p){ if (p.objectId && p.note) (notesByObj[p.objectId] = notesByObj[p.objectId] || []).push(p.note); });
        var others = parts.order.filter(function(id){ return id !== obj.id; });
        var sub = others.length ? others.map(function(id){
          var o = state.objects[id];
          return '<button type="button" class="om-link om-part' + (o.status === 'deprecated' ? ' is-deprecated' : '') + '" data-obj="' + id + '">' +
            '<span class="om-part-title"><span class="dot" style="background:' + typeColor(o.type) + '"></span><span class="ref-item-title">' + escapeHtml(o.name) + deprecatedTagHTML(o) + '</span></span>' +
            '<span class="om-part-meta">' + escapeHtml(typeTitle(o.type)) + ' · ' + escapeHtml(parts.roles[id].join(', ')) + '</span>' +
            (notesByObj[id] ? '<span class="om-part-note">' + escapeHtml(notesByObj[id].join('; ')) + '</span>' : '') +
          '</button>';
        }).join('') : '<p class="om-empty-parts">Других участников нет</p>';
        return '<div class="om-mech' + (m.status === 'deprecated' ? ' is-deprecated' : '') + '">' +
          '<div class="om-mech-row">' +
            '<button type="button" class="om-toggle" data-ck="' + escapeHtml(ck) + '" aria-expanded="' + (!collapsed) + '" aria-label="Свернуть или развернуть участников"></button>' +
            '<button type="button" class="om-link om-mech-link" data-mech="' + mid + '">' +
              '<span class="om-mech-title"><span class="om-diamond" style="--c:' + categoryAccent(m.category) + '"></span><span class="ref-item-title">' + escapeHtml(m.title) + deprecatedTagHTML(m) + '</span></span>' +
              (it.notes.length ? '<span class="om-note">' + escapeHtml(it.notes.join('; ')) + '</span>' : '') +
            '</button>' +
          '</div>' +
          '<div class="om-parts"' + (collapsed ? ' hidden' : '') + '>' + sub + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
  }).join('');

  container.querySelectorAll('.om-toggle').forEach(function(t){
    t.addEventListener('click', function(){
      var open = t.getAttribute('aria-expanded') !== 'true';
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.closest('.om-mech').querySelector('.om-parts').hidden = !open;
      omCollapsed[t.getAttribute('data-ck')] = !open;
    });
  });
  container.querySelectorAll('.om-mech-link').forEach(function(btn){
    var mid = btn.getAttribute('data-mech');
    btn.addEventListener('click', function(){ setGraphHint(null); selectEntity('mech', mid); });
    btn.addEventListener('mouseenter', function(){ setGraphHint({mechOnly:mid}); });
    btn.addEventListener('mouseleave', function(){ setGraphHint(null); });
  });
  container.querySelectorAll('.om-part').forEach(function(btn){
    var oid = btn.getAttribute('data-obj');
    btn.addEventListener('click', function(){ setGraphHint(null); selectEntity('obj', oid); });
    btn.addEventListener('mouseenter', function(){ setGraphHint({objId:oid}); });
    btn.addEventListener('mouseleave', function(){ setGraphHint(null); });
  });
}

/* «+ Добавить в механизм»: выбор механизма → роль → необязательное описание → участник добавлен. */
function buildMechanismPicker(container, onPick){
  var input = buildCombobox(container, {
    placeholder:'Начните вводить название механизма…', autoActive:true, emptyText:'Механизмы не найдены',
    source:function(q){ return mechanismComboSource(q).slice(0, 10); },
    onPick:function(it){ input.value = state.mechanisms[it.value].title; onPick(state.mechanisms[it.value]); }
  });
  return input;
}

/* Источники пунктов для buildCombobox. */
function objectComboSource(q){
  var k = q.toLowerCase();
  return Object.keys(state.objects).map(function(id){ return state.objects[id]; })
    .filter(function(o){ return !k || o.name.toLowerCase().indexOf(k) >= 0; })
    .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); })
    .map(function(o){ return {value:o.id, label:o.name, sub:typeTitle(o.type), iconHTML:'<span class="dot" style="background:' + typeColor(o.type) + '"></span>'}; });
}
function mechanismComboSource(q){
  var k = q.toLowerCase();
  return Object.keys(state.mechanisms).map(function(id){ return state.mechanisms[id]; })
    .filter(isShown)
    .filter(function(m){ return !k || m.title.toLowerCase().indexOf(k) >= 0; })
    .sort(function(a,b){ return a.title.localeCompare(b.title,'ru'); })
    .map(function(m){ return {value:m.id, label:m.title, sub:categoryTitle(m.category), iconHTML:'<span class="om-diamond" style="--c:' + categoryAccent(m.category) + '"></span>'}; });
}

function bindAddToMechanism(panel, obj){
  var btn = panel.querySelector('#btn-add-to-mech'), host = panel.querySelector('#obj-add-to-mech');
  btn.addEventListener('click', function(){
    if (host.firstChild){ host.innerHTML = ''; return; }
    var chosen = null, role = 'target';
    host.innerHTML = '<div class="om-add">' +
      '<div><div class="om-add-label">Механизм</div><div class="om-add-picker"></div></div>' +
      '<div><div class="om-add-label">Роль объекта</div><div class="om-add-roles">' +
        PARTICIPANT_ROLES.map(function(r){ return '<button type="button" class="om-add-role' + (r.code === role ? ' is-on' : '') + '" data-role="' + r.code + '">' + escapeHtml(r.title) + '</button>'; }).join('') +
      '</div></div>' +
      '<div><div class="om-add-label">Что передаётся (необязательно)</div><input type="text" class="field-input om-add-note" placeholder="Например: «Забирает к-во дней»"></div>' +
      '<div class="om-add-actions"><button type="button" class="btn btn-sm om-add-cancel">Отмена</button><button type="button" class="btn btn-sm btn-accent om-add-ok" disabled>Добавить</button></div>' +
    '</div>';
    var ok = host.querySelector('.om-add-ok');
    var input = buildMechanismPicker(host.querySelector('.om-add-picker'), function(m){ chosen = m; ok.disabled = false; host.querySelector('.om-add-note').focus(); });
    input.addEventListener('input', function(){ chosen = null; ok.disabled = true; });
    host.querySelectorAll('.om-add-role').forEach(function(b){
      b.addEventListener('click', function(){
        role = b.getAttribute('data-role');
        host.querySelectorAll('.om-add-role').forEach(function(x){ x.classList.toggle('is-on', x === b); });
      });
    });
    host.querySelector('.om-add-cancel').addEventListener('click', function(){ host.innerHTML = ''; });
    host.querySelector('.om-add-note').addEventListener('keydown', function(e){ if (e.key === 'Enter' && !ok.disabled){ e.preventDefault(); ok.click(); } });
    ok.addEventListener('click', function(){
      if (!chosen) return;
      chosen.participants.push({objectId:obj.id, role:role, note:normalizeLabel(host.querySelector('.om-add-note').value)});
      persist(); syncGraphModel(); renderSidebar(); updateStats();
      if (currentView === 'list') renderListView();
      host.innerHTML = '';
      renderObjectMechList(obj, panel);
    });
    host.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); host.innerHTML = ''; btn.focus(); } });
    input.focus();
  });
}

function buildObjectCombobox(container, selectedId, onChange, reopenAfterCreate){
  var selectedObj = selectedId ? state.objects[selectedId] : null;
  container.innerHTML =
    '<div class="combo">' +
      '<input type="text" class="field-input combo-input" autocomplete="off" placeholder="Начните вводить название…" value="' + escapeHtml(selectedObj ? selectedObj.name : '') + '">' +
      '<div class="combo-dropdown" hidden></div>' +
    '</div>';
  var input = container.querySelector('.combo-input');
  var dropdown = container.querySelector('.combo-dropdown');
  var currentId = selectedId || '';

  function renderDropdown(query){
    var q = query.trim().toLowerCase();
    var matches = Object.keys(state.objects).map(function(id){ return state.objects[id]; })
      .filter(function(o){ return !q || o.name.toLowerCase().indexOf(q) >= 0; })
      .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); })
      .slice(0, 8);
    var html = matches.map(function(o){
      return '<div class="combo-item" data-id="'+o.id+'">' +
        '<span class="dot" style="background:'+typeColor(o.type)+'"></span>' +
        '<span class="combo-item-text">'+escapeHtml(o.name)+'</span>' +
        '<span class="combo-item-type">'+escapeHtml(typeTitle(o.type))+'</span>' +
      '</div>';
    }).join('');
    if (q) html += '<div class="combo-item combo-item-create" data-create="1">+ Создать «'+escapeHtml(query.trim())+'»</div>';
    if (!html) html = '<div class="combo-empty">Начните вводить название объекта.</div>';
    dropdown.innerHTML = html;
    dropdown.hidden = false;
    dropdown.querySelectorAll('.combo-item[data-id]').forEach(function(item){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var id = item.getAttribute('data-id');
        currentId = id;
        input.value = state.objects[id].name;
        dropdown.hidden = true;
        onChange(id);
      });
    });
    var createItem = dropdown.querySelector('.combo-item-create');
    if (createItem){
      createItem.addEventListener('mousedown', function(e){
        e.preventDefault();
        var typedName = input.value.trim();
        dropdown.hidden = true;
        openQuickCreateObject(function(newObj){
          currentId = newObj.id;
          input.value = newObj.name;
          onChange(newObj.id);
          if (reopenAfterCreate) setTimeout(reopenAfterCreate, 0);
        }, typedName);
      });
    }
  }

  input.addEventListener('focus', function(){ renderDropdown(input.value); });
  input.addEventListener('input', function(){ renderDropdown(input.value); });
  input.addEventListener('blur', function(){
    setTimeout(function(){
      dropdown.hidden = true;
      var obj = currentId ? state.objects[currentId] : null;
      input.value = obj ? obj.name : '';
    }, 150);
  });
  input.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){ dropdown.hidden = true; input.blur(); }
  });
}

/* Комбобокс с автодополнением — общий для новых полей выбора (табличная часть реквизита,
   далее роли, контроли, шаги).
   opt: {value, placeholder, ariaLabel,
         source(q) → [{value, label, sub?, iconHTML?}] — пункты для введённого текста,
         createLabel(q) → строка пункта «+ Создать „…“» или null,
         onPick(item) — выбран пункт (item.create — выбран пункт создания, item.value = текст)}
   ↑/↓ выбирают пункт, Enter применяет выбранный. Пока пункт не выбран стрелками, Enter
   не перехватывается — форма вокруг может сохранить введённый текст. Esc закрывает список.
   autoActive — первый пункт выбран сразу (Enter берёт его); emptyText — текст пустого списка. */
function buildCombobox(container, opt){
  container.innerHTML = '<div class="combo"><input type="text" class="field-input combo-input" autocomplete="off"><div class="combo-dropdown" hidden></div></div>';
  var input = container.querySelector('.combo-input'), dropdown = container.querySelector('.combo-dropdown');
  input.value = opt.value || '';
  if (opt.placeholder) input.placeholder = opt.placeholder;
  if (opt.ariaLabel) input.setAttribute('aria-label', opt.ariaLabel);
  var items = [], active = -1;
  function render(){
    var q = input.value.trim();
    items = opt.source(q).slice();
    var cl = opt.createLabel ? opt.createLabel(q) : null;
    if (cl) items.push({value:q, label:cl, create:true});
    active = opt.autoActive && items.length ? 0 : -1;
    if (!items.length){
      if (opt.emptyText){ dropdown.innerHTML = '<div class="combo-empty">' + escapeHtml(opt.emptyText) + '</div>'; dropdown.hidden = false; }
      else dropdown.hidden = true;
      return;
    }
    dropdown.innerHTML = items.map(function(it, i){
      return '<div class="combo-item' + (it.create ? ' combo-item-create' : '') + '" data-i="' + i + '">' + (it.iconHTML || '') +
        '<span class="combo-item-text">' + escapeHtml(it.label) + '</span>' +
        (it.sub ? '<span class="combo-item-type">' + escapeHtml(it.sub) + '</span>' : '') + '</div>';
    }).join('');
    dropdown.hidden = false;
    hl();
    dropdown.querySelectorAll('.combo-item').forEach(function(el){
      el.addEventListener('mousedown', function(e){ e.preventDefault(); choose(Number(el.getAttribute('data-i'))); });
    });
  }
  function hl(){ dropdown.querySelectorAll('.combo-item').forEach(function(el, i){ el.classList.toggle('is-active', i === active); }); }
  function choose(i){ var it = items[i]; if (!it) return; dropdown.hidden = true; active = -1; opt.onPick(it); }
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', function(){ setTimeout(function(){ dropdown.hidden = true; }, 150); });
  input.addEventListener('keydown', function(e){
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      if (dropdown.hidden) render();
      if (!items.length) return;
      e.preventDefault();
      active = e.key === 'ArrowDown' ? (active + 1) % items.length : (active <= 0 ? items.length - 1 : active - 1);
      hl();
    } else if (e.key === 'Enter' && !dropdown.hidden && active >= 0){
      e.preventDefault(); e.stopPropagation(); choose(active);
    } else if (e.key === 'Escape' && !dropdown.hidden){
      e.preventDefault(); e.stopPropagation(); dropdown.hidden = true;
    } else if (e.key === 'Tab'){
      dropdown.hidden = true;
    }
  });
  return input;
}

/* Поле-ссылка карточки: в просмотре — ссылка на сущность (клик открывает её карточку),
   «⚠ Удалено: …» для удалённой или «+ …» для пустой; клик по полю вне ссылки или по
   карандашу — выбор в комбобоксе. Esc или уход фокуса — без изменений.
   opt: {label, addText, get() → id, set(id), resolve(id) → {label, iconHTML} | null,
         open(id), source(q), createLabel(q)?, create(text) → id} */
function refFieldHTML(key, label){ return viewFieldHTML(key, label); }
function bindRefField(panel, key, opt){
  var wrap = panel.querySelector('.vfield[data-key="' + key + '"]');
  var view = wrap.querySelector('.vfield-value');
  function renderView(){
    var id = opt.get(), r = id ? opt.resolve(id) : null;
    view.classList.toggle('is-empty', !id);
    view.title = id ? 'Нажмите, чтобы изменить' : '';
    view.innerHTML = !id ? '+ ' + escapeHtml(opt.addText) :
      (r ? '<button type="button" class="ref-link" title="Открыть карточку">' + (r.iconHTML || '') + '<span>' + escapeHtml(r.label) + '</span></button>' : brokenRefHTML(id)) + PENCIL_SVG;
  }
  function edit(){
    if (wrap.querySelector('.ref-edit')) return;
    var box = document.createElement('div'); box.className = 'ref-edit';
    wrap.appendChild(box); view.hidden = true;
    var closed = false;
    function close(){ if (closed) return; closed = true; box.remove(); view.hidden = false; renderView(); }
    var input = buildCombobox(box, {
      placeholder:'Начните вводить…', ariaLabel:opt.label, autoActive:true, emptyText:'Ничего не найдено',
      source:function(q){
        var list = opt.source(q);
        if (!q && opt.get()) list.unshift({value:'', label:'Не указан', sub:'очистить'});
        return list;
      },
      createLabel:opt.createLabel,
      onPick:function(it){
        var id = it.create ? opt.create(it.value) : it.value;
        if (id !== opt.get()) opt.set(id);
        close(); view.focus();
      }
    });
    /* Первый Esc закрывает выпадающий список (комбобокс помечает событие defaultPrevented), второй — редактирование. */
    input.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !e.defaultPrevented){ e.preventDefault(); e.stopPropagation(); close(); view.focus(); } });
    box.addEventListener('focusout', function(){ setTimeout(function(){ if (!box.contains(document.activeElement)) close(); }, 0); });
    input.focus();
  }
  view.addEventListener('click', function(e){
    if (e.target.closest('.ref-link')){ opt.open(opt.get()); return; }
    edit();
  });
  view.addEventListener('keydown', function(e){ if (e.key === 'Enter' && !e.target.closest('.ref-link')){ e.preventDefault(); edit(); } });
  renderView();
}


function mechanismPanelTemplate(mech){
  var color = categoryAccent(mech.category);
  return (
    '<div class="card-head">' +
      '<div class="card-head-row">' +
        '<span class="card-icon card-icon-mech" style="--c:' + color + '" aria-hidden="true"></span>' +
        '<h2 class="inline-title" tabindex="0" title="Название — нажмите, чтобы изменить">' + escapeHtml(mech.title) + '</h2>' +
        '<span class="save-indicator" aria-live="polite"></span>' + cardMenuButtonHTML() +
      '</div>' +
      '<p class="inline-msg" hidden></p>' +
      '<div class="card-head-badges">' +
        '<button type="button" class="badge-btn cat-badge category-badge" style="--cat:' + color + '" aria-haspopup="menu" aria-expanded="false" title="Категория — нажмите, чтобы изменить">' + escapeHtml(categoryTitle(mech.category)) + '</button>' +
        statusBadgeButtonHTML(mech.status, true) +
      '</div>' +
    '</div>' +
    viewFieldHTML('summary', 'Краткое описание (подсказка на графе)') +
    '<div class="vfield">' +
      '<div class="field-label-row"><span class="vfield-label">Подробное описание</span><button type="button" class="link-btn body-edit-btn">Редактировать</button></div>' +
      '<div class="body-view" tabindex="0"></div>' +
      '<textarea class="field-input body-edit" id="f-body" hidden aria-label="Подробное описание"></textarea>' +
    '</div>' +
    '<div class="panel-section">' +
      '<p class="panel-section-title">Участники</p>' +
      '<div id="participants-list"></div>' +
    '</div>' +
    '<div id="mech-replaces-controls"></div>' +
    '<div class="panel-section">' +
      '<div class="panel-section-header"><p class="panel-section-title">Вложения</p>' +
        '<button class="btn btn-sm" id="btn-attach-mechanism" type="button">Прикрепить файл</button></div>' +
      '<div id="mech-attachments-list"></div>' +
    '</div>'
  );
}

function renderMechanismPanel(mech, panel){
  if (!mech) return;
  panel = panel || document.getElementById('panel-mechanism');
  showPanel('mechanism');
  panel.innerHTML = mechanismPanelTemplate(mech);
  var actions = document.createElement('div');
  actions.className = 'card-actions';
  actions.innerHTML = '<button type="button" class="btn btn-sm card-focus-btn" data-mech="' + mech.id + '" title="Разложить участников: источники слева, приёмники справа">Фокус</button>';
  panel.querySelector('.card-head').appendChild(actions);
  actions.querySelector('.card-focus-btn').addEventListener('click', function(){ enterFocus(mech.id); });
  updateFocusUI();
  bindInlineTitle(panel, function(){ return mech.title; }, function(v){
    mech.title=v; persist(); syncGraphModel(); renderSidebar();
    if (currentView === 'list') renderListView();
  }, 'Название');
  var catBtn = panel.querySelector('.category-badge');
  catBtn.addEventListener('click', function(){
    openPopoverMenu(catBtn, MECH_CATEGORIES.map(function(c){
      return {value:c.code, label:c.title, icon:'<span class="cat-dot" style="--c:' + categoryAccent(c.code) + '"></span>', current:c.code === mech.category};
    }), function(code){
      if (code === mech.category) return;
      mech.category = code; persist(); syncGraphModel(); renderSidebar();
      if (currentView === 'list') renderListView();
      renderMechanismPanel(mech);
    });
  });
  bindStatusBadge(panel, mech, true);
  var menuBtn = panel.querySelector('.card-menu-btn');
  menuBtn.addEventListener('click', function(){
    openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить механизм', danger:true}], function(){ deleteMechanism(mech.id); });
  });
  bindViewField(panel, 'summary', {label:'Краткое описание', addText:'Добавить краткое описание',
    placeholder:'Одна фраза: что делает механизм. Показывается при наведении на граф',
    get:function(){ return mech.summary || ''; }, set:function(v){ mech.summary = v.trim(); persist(); renderSidebar(); }});
  bindBodyEditor(panel, true, function(){ return mech.body; }, function(v){ mech.body=v; persist(); }, 'Нет описания. Нажмите, чтобы добавить.');
  panel.querySelector('#btn-attach-mechanism').addEventListener('click', function(){
    attachFilesToEntity('mech', mech.id, function(){ renderAttachmentsList(panel, '#mech-attachments-list', 'mech', mech.id); });
  });
  renderParticipantsList(mech, panel);
  renderControlBackLinks(panel.querySelector('#mech-replaces-controls'), 'Заменит ручные контроли', controlsReplacedBy(mech.id));
  renderAttachmentsList(panel, '#mech-attachments-list', 'mech', mech.id);
}

/* ----- Участники механизма, сгруппированные по направлению роли ----- */
var ROLE_GROUPS = [
  {dir:'source', title:'Источники', add:'+ источник', baseRole:'source'},
  {dir:'target', title:'Приёмники', add:'+ приёмник', baseRole:'target'},
  {dir:'neutral', title:'Прочие', add:null, baseRole:null}
];
var BASE_ROLE_ACTIONS = { source:'Сделать источником', target:'Сделать приёмником' };

function participantCardHTML(p, idx){
  var o = p.objectId ? state.objects[p.objectId] : null;
  var role = roleInfo(p.role);
  var isBase = (role.code === 'source' || role.code === 'target');
  var roleLabel = isBase ? '' : '<span class="pcard-role">' + escapeHtml(role.title) + (p.note ? ' · ' : '') + '</span>';
  var tag = o ? (typeShort(o.type) || '•') : '?';
  var menu = PARTICIPANT_ROLES.filter(function(r){ return r.code !== p.role; }).map(function(r){
    return '<button type="button" class="menu-item" data-role="' + r.code + '">' + escapeHtml(BASE_ROLE_ACTIONS[r.code] || ('Роль: ' + r.title)) + '</button>';
  }).join('') + '<div class="menu-sep" role="separator"></div><button type="button" class="menu-item menu-item-danger" data-remove="1">Удалить из механизма</button>';
  return '<div class="pcard' + (o && o.status === 'deprecated' ? ' is-deprecated' : '') + '" data-idx="' + idx + '">' +
    '<span class="type-chip" style="--c:' + (o ? typeColor(o.type) : THEME.typeUnknown) + '" title="' + escapeHtml(o ? typeTitle(o.type) : 'Объект не выбран') + '">' + escapeHtml(tag) + '</span>' +
    '<div class="pcard-main">' +
      (o ? '<button type="button" class="pcard-name" title="Перейти к объекту">' + escapeHtml(o.name) + deprecatedTagHTML(o) + '</button>'
         : '<div class="pcard-combo"></div>') +
      '<div class="pcard-sub' + (p.note ? '' : ' is-empty') + '" tabindex="0" title="Нажмите, чтобы изменить описание">' + roleLabel +
        (p.note ? escapeHtml(p.note) : (isBase ? 'Описать передачу…' : '')) + '</div>' +
    '</div>' +
    '<div class="pcard-menu-wrap">' +
      '<button type="button" class="pcard-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с участником">⋯</button>' +
      '<div class="menu pcard-menu" role="menu" hidden>' + menu + '</div>' +
    '</div>' +
  '</div>';
}

function renderParticipantsList(mech, panel){
  var container = panel.querySelector('#participants-list');
  if (!container) return;
  var isSidebar = (panel.id === 'panel-mechanism');
  function rerender(){ renderParticipantsList(mech, panel); }
  function changed(){ persist(); syncGraphModel(); renderSidebar(); updateStats(); }

  container.innerHTML = ROLE_GROUPS.map(function(g){
    var items = [];
    mech.participants.forEach(function(p, idx){ if (roleInfo(p.role).direction === g.dir) items.push(participantCardHTML(p, idx)); });
    if (g.dir === 'neutral' && !items.length) return '';
    return '<div class="role-block" data-dir="' + g.dir + '">' +
      '<div class="role-block-header"><p class="role-block-title">' + g.title + ' · ' + items.length + '</p>' +
        (g.add ? '<button type="button" class="btn btn-sm role-add-btn" data-role="' + g.baseRole + '">' + g.add + '</button>' : '') +
      '</div>' +
      '<div class="role-items">' + (items.join('') || '<p class="role-block-empty">Пока нет</p>') + '</div>' +
    '</div>';
  }).join('');

  /* Добавление: комбобокс поиска объекта прямо в блоке; выбранный объект становится участником. */
  container.querySelectorAll('.role-add-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var block = btn.closest('.role-block');
      if (block.querySelector('.role-add')) return;
      var slot = document.createElement('div');
      slot.className = 'role-add';
      var itemsEl = block.querySelector('.role-items');
      itemsEl.insertBefore(slot, itemsEl.firstChild);
      var empty = itemsEl.querySelector('.role-block-empty'); if (empty) empty.hidden = true;
      var role = btn.getAttribute('data-role');
      buildObjectCombobox(slot, '', function(newId){
        mech.participants.push({objectId:newId, role:role, note:''});
        changed(); rerender();
      }, null);
      var input = slot.querySelector('.combo-input');
      input.addEventListener('blur', function(){ setTimeout(function(){ if (slot.isConnected && !input.matches(':focus')) rerender(); }, 200); });
      input.focus();
    });
  });

  container.querySelectorAll('.pcard').forEach(function(card){
    var idx = Number(card.getAttribute('data-idx'));
    var p = mech.participants[idx];

    var nameBtn = card.querySelector('.pcard-name');
    if (nameBtn) nameBtn.addEventListener('click', function(){ openObjectFromCard(panel, p.objectId, isSidebar); });
    var comboSlot = card.querySelector('.pcard-combo');
    if (comboSlot) buildObjectCombobox(comboSlot, '', function(newId){ p.objectId = newId; changed(); rerender(); },
      null);

    /* Описание передачи — правка по клику. */
    var sub = card.querySelector('.pcard-sub');
    function editNote(){
      var input = document.createElement('input');
      input.type = 'text'; input.className = 'field-input pcard-note-input';
      input.value = p.note || ''; input.placeholder = 'Что передаётся';
      sub.replaceWith(input); input.focus();
      var done = false;
      function finish(save){
        if (done) return; done = true;
        if (save && input.value !== (p.note||'')){ p.note = input.value; persist(); }
        rerender();
      }
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){ e.preventDefault(); finish(true); }
        else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', function(){ finish(true); });
    }
    sub.addEventListener('click', editNote);
    sub.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); editNote(); } });

    /* Меню «⋯»: смена роли, удаление. */
    var menuBtn = card.querySelector('.pcard-menu-btn'), menu = card.querySelector('.pcard-menu');
    function setMenu(open){
      menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open){
        var close = function(ev){ if (!card.querySelector('.pcard-menu-wrap').contains(ev.target)){ setMenu(false); document.removeEventListener('mousedown', close); } };
        document.addEventListener('mousedown', close);
      }
    }
    menuBtn.addEventListener('click', function(){ setMenu(menu.hidden); });
    menu.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ e.stopPropagation(); setMenu(false); menuBtn.focus(); } });
    menu.querySelectorAll('.menu-item[data-role]').forEach(function(item){
      item.addEventListener('click', function(){ p.role = item.getAttribute('data-role'); changed(); rerender(); });
    });
    menu.querySelector('[data-remove]').addEventListener('click', function(){
      mech.participants.splice(idx, 1); setGraphHint(null); changed(); rerender();
    });

    /* Наведение на участника подсвечивает его ребро на графе. */
    card.addEventListener('mouseenter', function(){ if (p.objectId) setGraphHint({objId:p.objectId, mechId:mech.id}); });
    card.addEventListener('mouseleave', function(){ setGraphHint(null); });
  });
}


function renderEdgePanel(edge){
  showPanel('edge');
  var mechs = Array.from(edge.mechanismIds).map(function(id){return state.mechanisms[id];}).filter(Boolean);
  var panel = document.getElementById('panel-edge');
  panel.innerHTML =
    '<div class="panel-header">' +
      '<p class="panel-eyebrow">Связь</p>' +
      '<h2>' + escapeHtml(labelOfRef(edge.a)) + ' — ' + escapeHtml(labelOfRef(edge.b)) + '</h2>' +
    '</div>' +
    '<p class="panel-hint">Эти объекты связаны через ' + mechs.length + ' ' + pluralRu(mechs.length,'механизм','механизма','механизмов') + ':</p>' +
    '<div class="mech-ref-list">' +
      mechs.map(function(m){
        return '<button class="mech-ref-item" data-mech="'+m.id+'" type="button">' +
          '<span class="mech-ref-title"><span class="dot" style="background:'+categoryAccent(m.category)+'"></span>'+escapeHtml(m.title)+'</span>' +
          '<span class="mech-ref-summary">'+escapeHtml(m.summary||'Без краткого описания')+'</span>' +
        '</button>';
      }).join('') +
    '</div>';
  panel.querySelectorAll('.mech-ref-item').forEach(function(btn){
    btn.addEventListener('click', function(){
      pinnedMechanismId = btn.getAttribute('data-mech'); pinnedEdgeKey=null; pinnedNodeId=null;
      renderMechanismPanel(state.mechanisms[pinnedMechanismId]);
      syncSidebarActive(); requestRender();
    });
  });
}

