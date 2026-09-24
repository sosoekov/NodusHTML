'use strict';

/* ===================== Глобальный поиск =====================
   Подстрока в названии объекта или механизма, без учёта регистра. Выбор результата
   на графе = клик по узлу (для механизма в режиме без механизмов — как клик по нему
   в списке слева); в режиме «Список» — карточка во всплывающем окне. */
var GLOBAL_SEARCH_LIMIT = 30;

function globalSearchMatches(query){
  var q = query.toLowerCase().trim();
  if (!q) return [];
  var res = [];
  Object.keys(state.objects).forEach(function(id){
    var o = state.objects[id];
    if (!isShown(o)) return;
    var i = o.name.toLowerCase().indexOf(q);
    if (i >= 0) res.push({kind:'obj', id:id, title:o.name, sub:typeTitle(o.type), color:typeColor(o.type), pos:i});
  });
  Object.keys(state.mechanisms).forEach(function(id){
    var m = state.mechanisms[id];
    if (!isShown(m)) return;
    var i = m.title.toLowerCase().indexOf(q);
    if (i >= 0) res.push({kind:'mech', id:id, title:m.title, sub:'Механизм · ' + categoryTitle(m.category), color:categoryAccent(m.category), pos:i});
  });
  /* Совпадение с начала названия — выше. */
  res.sort(function(a,b){ return (a.pos===0?0:1) - (b.pos===0?0:1) || a.title.localeCompare(b.title,'ru'); });
  return res.slice(0, GLOBAL_SEARCH_LIMIT);
}

function selectEntity(kind, id){
  if (kind === 'obj'){
    if (!state.objects[id]) return;
    pinnedNodeId = 'obj:'+id; pinnedMechanismId = null; pinnedEdgeKey = null;
    renderObjectPanel(state.objects[id]);
  } else {
    if (!state.mechanisms[id]) return;
    pinnedMechanismId = id; pinnedNodeId = null; pinnedEdgeKey = null;
    renderMechanismPanel(state.mechanisms[id]);
  }
  syncSidebarActive(); requestRender();
  if (currentView === 'list') scrollActiveListRowIntoView();
  else centerOnEntity(kind, id);
}

function bindGlobalSearch(){
  var input = document.getElementById('global-search-input');
  var dropdown = document.getElementById('global-search-dropdown');
  var kbd = document.getElementById('global-search-kbd');
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  kbd.textContent = isMac ? '⌘K' : 'Ctrl+K';
  var results = [], active = 0;

  function setOpen(open){
    dropdown.hidden = !open;
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function highlight(){
    dropdown.querySelectorAll('.gs-item').forEach(function(el, i){
      el.classList.toggle('active', i === active);
      if (i === active) el.scrollIntoView({block:'nearest'});
    });
  }
  function choose(i){
    var r = results[i];
    if (!r) return;
    setOpen(false);
    input.blur();
    selectEntity(r.kind, r.id);
  }
  function update(){
    results = globalSearchMatches(input.value);
    active = 0;
    if (!input.value.trim()){ setOpen(false); return; }
    dropdown.innerHTML = results.length ? results.map(function(r, i){
      return '<button type="button" class="gs-item" role="option" data-i="'+i+'">' +
        '<span class="dot' + (r.kind==='mech' ? ' dot-diamond' : '') + '" style="background:'+r.color+'"></span>' +
        '<span class="gs-item-main"><span class="gs-item-title">'+escapeHtml(r.title)+'</span><span class="gs-item-sub">'+escapeHtml(r.sub)+'</span></span>' +
      '</button>';
    }).join('') : '<p class="gs-empty">Ничего не найдено</p>';
    dropdown.querySelectorAll('.gs-item').forEach(function(el){
      /* mousedown, чтобы выбор сработал раньше, чем поле потеряет фокус */
      el.addEventListener('mousedown', function(e){ e.preventDefault(); choose(Number(el.getAttribute('data-i'))); });
      el.addEventListener('mousemove', function(){ var i = Number(el.getAttribute('data-i')); if (i !== active){ active = i; highlight(); } });
    });
    highlight();
    setOpen(true);
  }
  input.addEventListener('input', update);
  input.addEventListener('focus', function(){ if (input.value.trim()) update(); });
  input.addEventListener('blur', function(){ setOpen(false); });
  input.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      e.stopPropagation();
      if (!dropdown.hidden) setOpen(false); else input.blur();
      return;
    }
    if (dropdown.hidden) return;
    if (e.key === 'ArrowDown'){ e.preventDefault(); if (results.length){ active = (active+1) % results.length; highlight(); } }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); if (results.length){ active = (active-1+results.length) % results.length; highlight(); } }
    else if (e.key === 'Enter'){ e.preventDefault(); choose(active); }
  });
}

function scrollActiveListRowIntoView(){
  var row = document.querySelector('#list-view-body .list-view-row.active');
  if (row) row.scrollIntoView({block:'nearest'});
}

/* «Список» с открытой карточкой: ↑/↓ — предыдущая/следующая строка (если фокус не в поле ввода). */
function isTypingTarget(el){
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}
function moveListSelection(step){
  var rows = Array.prototype.slice.call(document.querySelectorAll('#list-view-body .list-view-row'));
  if (!rows.length) return;
  var i = rows.findIndex(function(r){ return r.classList.contains('active'); });
  var next = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + step))];
  selectEntity(next.getAttribute('data-kind')==='object' ? 'obj' : 'mech', next.getAttribute('data-id'));
}

function syncSidebarActive(){
  document.querySelectorAll('.list-row').forEach(function(btn){
    var isActive = (btn.getAttribute('data-kind')==='object' && pinnedNodeId==='obj:'+btn.getAttribute('data-id')) ||
                   (btn.getAttribute('data-kind')==='mechanism' && pinnedMechanismId===btn.getAttribute('data-id'));
    btn.classList.toggle('active', isActive);
    /* Выбранный объект в свёрнутой группе: раскрываем группу (без записи в сохранённое состояние). */
    var items = isActive && btn.closest('.side-group-items');
    if (items && items.hidden){ items.hidden = false; items.previousElementSibling.setAttribute('aria-expanded','true'); }
  });
  document.querySelectorAll('#list-view-body .list-view-row').forEach(function(row){
    var id = row.getAttribute('data-id');
    var on = (row.getAttribute('data-kind')==='object' && pinnedNodeId==='obj:'+id) ||
             (row.getAttribute('data-kind')==='mechanism' && pinnedMechanismId===id);
    row.classList.toggle('active', on);
  });
}

function updateStats(){
  var oc = Object.keys(state.objects).length, mc = Object.keys(state.mechanisms).length;
  document.getElementById('empty-state').style.display = (oc===0 && mc===0) ? 'flex' : 'none';
}

/* ===================== Модальные окна ===================== */

function openModal(opts){
  var root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="modal-backdrop"><div class="modal-box' + (opts.wide ? ' modal-box-md' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-header"><h2>'+escapeHtml(opts.title)+'</h2><button class="modal-close" type="button" aria-label="Закрыть">×</button></div>' +
      '<div class="modal-body">'+opts.bodyHTML+'</div>' +
      '<div class="modal-footer"></div>' +
    '</div></div>';
  var footer = root.querySelector('.modal-footer');
  (opts.footerButtons||[]).forEach(function(btnDef){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (btnDef.variant==='primary' ? 'btn-accent' : (btnDef.variant==='danger' ? 'btn-danger' : ''));
    b.textContent = btnDef.label;
    b.addEventListener('click', function(){
      var res = btnDef.onClick(root);
      if (res !== false) closeModal();
    });
    footer.appendChild(b);
  });
  root.querySelector('.modal-close').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', function(e){
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}
function closeModal(){ document.getElementById('modal-root').innerHTML=''; }


function openQuickCreateObject(onCreated, prefillName){
  var typeOptions = OBJECT_TYPES.map(function(t){ return '<option value="'+t.code+'">'+escapeHtml(t.title)+'</option>'; }).join('');
  openModal({
    title:'Новый объект',
    bodyHTML:
      '<label class="field-label">Название</label>' +
      '<input type="text" id="qc-name" class="field-input" style="margin-bottom:12px;" value="'+escapeHtml(prefillName||'')+'">' +
      '<label class="field-label">Тип</label>' +
      '<select id="qc-type" class="field-input">'+typeOptions+'</select>',
    footerButtons:[
      {label:'Отмена', onClick:function(){ return true; }},
      {label:'Создать', variant:'primary', onClick:function(root){
        var nameEl = root.querySelector('#qc-name');
        var name = nameEl.value.trim();
        var type = root.querySelector('#qc-type').value;
        if (!name){ nameEl.focus(); return false; }
        var obj = createObject({name:name, type:type});
        onCreated(obj);
      }}
    ]
  });
  setTimeout(function(){ var el = document.getElementById('qc-name'); if (el){ el.focus(); el.select(); } }, 0);
}

function openSettingsModal(){
  var originInfo = location.protocol === 'file:' ? location.pathname : location.href;
  var folderBlockHTML;
  if (!folderSupported){
    folderBlockHTML =
      '<p style="margin-top:10px;">Автосохранение в папку недоступно в этом браузере — эта возможность есть только в Chrome и Edge. ' +
      'Используйте кнопки «Экспорт» и «Импорт» в шапке — они работают в любом браузере.</p>';
  } else if (autoSaveStatus === 'connected'){
    folderBlockHTML =
      '<p style="margin-top:10px;">Подключена папка: <code>' + escapeHtml(folderHandle ? folderHandle.name : '') + '</code>. ' +
      'Файл <code>object-graph-data.json</code> в ней обновляется при каждом изменении, в дополнение к сохранению в браузере.</p>' +
      '<p id="settings-last-save" class="settings-meta"></p>' +
      '<button class="btn btn-danger-ghost btn-sm" id="btn-disconnect-folder" type="button" style="margin-top:8px;">Отключить папку</button>';
  } else if (autoSaveStatus === 'needs-permission'){
    folderBlockHTML =
      '<p style="margin-top:10px;">Ранее была подключена папка <code>' + escapeHtml(folderHandle ? folderHandle.name : '') + '</code>, ' +
      'но браузер просит подтвердить доступ заново — это обычное поведение после перезапуска браузера.</p>' +
      '<button class="btn btn-accent btn-sm" id="btn-reconnect-folder" type="button" style="margin-top:8px;">Подтвердить доступ</button>';
  } else {
    folderBlockHTML =
      '<p style="margin-top:10px;">Папка не подключена — данные сохраняются только в этом браузере.</p>' +
      '<button class="btn btn-accent btn-sm" id="btn-connect-folder" type="button" style="margin-top:8px;">Выбрать папку для автосохранения</button>';
  }

  openModal({
    title:'Настройки хранения',
    bodyHTML:
      '<p>Сейчас данные хранятся в <strong>localStorage браузера</strong>, привязаны к этому файлу:<br>' +
      '<code style="display:inline-block; margin-top:4px; word-break:break-all;">' + escapeHtml(originInfo) + '</code></p>' +
      '<p style="margin-top:8px;">Если переместить или переименовать HTML-файл, браузер может посчитать это другим источником и не найти прежние данные — на этот случай держите под рукой экспорт JSON.</p>' +
      folderBlockHTML,
    footerButtons:[
      {label:'Закрыть', onClick:function(){ return true; }}
    ]
  });

  var connectBtn = document.getElementById('btn-connect-folder');
  if (connectBtn) connectBtn.addEventListener('click', function(){ connectFolder(); });
  var reconnectBtn = document.getElementById('btn-reconnect-folder');
  if (reconnectBtn) reconnectBtn.addEventListener('click', function(){ reconnectFolderPermission(); });
  var disconnectBtn = document.getElementById('btn-disconnect-folder');
  if (disconnectBtn) disconnectBtn.addEventListener('click', function(){ disconnectFolder(); closeModal(); });

  updateSettingsSaveStatus();
}
function updateSettingsSaveStatus(){
  var el = document.getElementById('settings-last-save');
  if (!el) return;
  el.textContent = lastFolderSaveAt ? ('Последнее сохранение в файл: ' + lastFolderSaveAt.toLocaleTimeString()) : 'Ещё не сохранялось в этой сессии.';
}

