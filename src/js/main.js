'use strict';

function resizeCanvas(){
  var wrap = document.getElementById('canvas-wrap');
  var rect = wrap.getBoundingClientRect();
  var dpr = window.devicePixelRatio || 1;
  canvasEl.width = Math.round(rect.width*dpr);
  canvasEl.height = Math.round(rect.height*dpr);
  canvasEl.style.width = rect.width+'px';
  canvasEl.style.height = rect.height+'px';
  ctx2d.setTransform(dpr,0,0,dpr,0,0);
  viewportWidth = rect.width; viewportHeight = rect.height;
  if (!viewInitialized){ view.offsetX = rect.width/2; view.offsetY = rect.height/2; viewInitialized = true; }
  requestRender();
}

function attachHandlers(){
  canvasEl.addEventListener('mousedown', onMouseDown);
  canvasEl.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvasEl.addEventListener('wheel', onWheel, {passive:false});
  canvasEl.addEventListener('dblclick', onDblClick);
  canvasEl.addEventListener('mouseleave', hideCanvasTooltip);
  document.getElementById('btn-exit-focus').addEventListener('click', function(){ exitFocus(); });
  bindMinimap();
  window.addEventListener('resize', resizeCanvas);

  /* «Механизмы: узлами» = полный режим (объекты и механизмы), «связями» — только объекты. */
  syncMechModeUI();
  document.querySelectorAll('.mech-mode-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var next = btn.getAttribute('data-mode');
      /* Во время фокуса переключатель выводит из фокуса и возвращает прежний режим. */
      if (focusMode){ exitFocus(true); if (next === currentMode){ syncMechModeUI(); return; } }
      if (next === currentMode) return;
      currentMode = next;
      try{ localStorage.setItem(MECH_MODE_KEY, currentMode); }catch(e){}
      syncMechModeUI();
      clearSelection();
      syncGraphModel();
    });
  });

  document.querySelectorAll('.view-toggle .mode-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.view-toggle .mode-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      switchView(btn.getAttribute('data-view'));
    });
  });

  document.getElementById('list-search').addEventListener('input', function(ev){
    listSearch[listTab] = ev.target.value;
    renderListView();
  });
  document.querySelectorAll('.list-tab').forEach(function(tab){
    tab.addEventListener('click', function(){ setListTab(tab.getAttribute('data-list-tab')); });
  });
  document.addEventListener('mousedown', function(e){
    closeListDropdowns(e.target.closest ? e.target.closest('.multi-select[data-ms]') : null);
  });
  /* «+ Объект» / «+ Механизм»: как в левой панели — сущность создана, карточка открыта,
     курсор в поле названия. Поиск и отборы вкладки сбрасываются, чтобы строка была видна. */
  document.getElementById('btn-list-add').addEventListener('click', function(){
    listSearch[listTab] = '';
    document.getElementById('list-search').value = '';
    var f = listFilters[listTab]; Object.keys(f).forEach(function(k){ f[k] = {}; });
    if (listTab === 'objects'){
      var obj = createObject({name:'Новый объект'});
      renderListView();
      selectEntity('obj', obj.id);
      startInlineTitleEdit(document.getElementById('panel-object'));
    } else if (listTab === 'controls'){
      var ctrl = createControl({name:'Новый контроль'});
      renderListView();
      selectEntity('ctrl', ctrl.id);
      startInlineTitleEdit(document.getElementById('panel-control'));
    } else if (listTab === 'roles'){
      var role = createRole({name:'Новая роль'});
      renderListView();
      selectEntity('role', role.id);
      startInlineTitleEdit(document.getElementById('panel-role'));
    } else {
      var m = createMechanism({title:'Новый механизм'});
      renderListView();
      selectEntity('mech', m.id);
      startInlineTitleEdit(document.getElementById('panel-mechanism'));
    }
  });
  watchListWidth();
  bindMultiSelectToggle(document.querySelector('[data-ms="side-sub"]'));

  setupResizeHandle('resize-left', 'left');
  setupResizeHandle('resize-right', 'right');

  function addObjectFromUI(){
    openQuickCreateObject(function(obj){
      pinnedNodeId='obj:'+obj.id; pinnedMechanismId=null; pinnedEdgeKey=null;
      renderObjectPanel(obj); syncSidebarActive(); requestRender();
    });
  }
  function addMechanismFromUI(){
    var m = createMechanism({title:'Новый механизм'});
    pinnedMechanismId = m.id; pinnedNodeId=null; pinnedEdgeKey=null;
    renderMechanismPanel(m); syncSidebarActive(); requestRender();
  }
  /* «+ Объект» / «+ Механизм»: один клик — сущность создана, карточка справа открыта,
     курсор в поле названия. Поиск и фильтры вкладки сбрасываются, чтобы новая строка
     была видна в списке. */
  function resetSideFilters(){
    sideSearch[sideTab] = '';
    document.getElementById('search-input').value = '';
    if (sideTab === 'objects'){
      sideSubFilter = {};
      document.getElementById('filter-tag').value = '';
    } else {
      document.getElementById('filter-mechcategory').value = '';
    }
  }
  function focusNameField(selector){ startInlineTitleEdit(document.querySelector(selector)); }
  document.getElementById('btn-side-add').addEventListener('click', function(){
    resetSideFilters();
    if (sideTab === 'objects'){
      var obj = createObject({name:'Новый объект'});
      pinnedNodeId='obj:'+obj.id; pinnedMechanismId=null; pinnedEdgeKey=null;
      renderObjectPanel(obj); syncSidebarActive(); requestRender();
      focusNameField('#panel-object');
    } else {
      addMechanismFromUI();
      focusNameField('#panel-mechanism');
    }
  });

  /* Наведение на строку списка подсвечивает узел на графе, как наведение на сам узел.
     Делегирование на контейнер — строки перерисовываются, а контейнер остаётся. */
  var sideList = document.getElementById('object-list');
  sideList.addEventListener('mouseover', function(e){
    var row = e.target.closest('.list-row');
    var next = row ? {kind:row.getAttribute('data-kind'), id:row.getAttribute('data-id')} : null;
    var same = (next && listHover && next.kind === listHover.kind && next.id === listHover.id) || (!next && !listHover);
    if (same) return;
    listHover = next;
    requestRender();
  });
  sideList.addEventListener('mouseleave', function(){
    if (!listHover) return;
    listHover = null;
    requestRender();
  });
  document.getElementById('btn-add-object-empty').addEventListener('click', addObjectFromUI);

  document.querySelectorAll('#sidebar-left .side-tab').forEach(function(tab){
    tab.addEventListener('click', function(){
      var next = tab.getAttribute('data-side');
      if (next === sideTab) return;
      sideTab = next;
      document.querySelectorAll('#sidebar-left .side-tab').forEach(function(t){ t.classList.toggle('active', t === tab); });
      var isObj = sideTab === 'objects';
      document.getElementById('side-filters-objects').hidden = !isObj;
      document.getElementById('side-filters-mechanisms').hidden = isObj;
      var search = document.getElementById('search-input');
      search.value = sideSearch[sideTab];
      search.placeholder = isObj ? 'Поиск объектов…' : 'Поиск механизмов…';
      var addBtn = document.getElementById('btn-side-add');
      addBtn.title = isObj ? 'Создать объект' : 'Создать механизм';
      addBtn.setAttribute('aria-label', addBtn.title);
      renderSidebar();
    });
  });
  document.getElementById('search-input').addEventListener('input', function(ev){
    sideSearch[sideTab] = ev.target.value;
    renderSidebar();
  });
  syncDeprecatedSwitches();
  document.querySelectorAll('.toggle-deprecated').forEach(function(cb){ cb.addEventListener('change', function(ev){
    showDeprecated = ev.target.checked;
    syncDeprecatedSwitches();
    try{ localStorage.setItem(SHOW_DEPRECATED_KEY, showDeprecated ? '1' : '0'); }catch(e){}
    if (focusMode) exitFocus(true);
    syncGraphModel(); renderSidebar();
    if (currentView === 'list') renderListView();
  }); });
  document.getElementById('filter-tag').addEventListener('change', renderSidebar);
  document.getElementById('filter-mechcategory').addEventListener('change', renderSidebar);

  document.getElementById('btn-settings').addEventListener('click', function(){
    openSettingsModal();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', function(){ zoomBy(ZOOM_STEP); });
  document.getElementById('btn-zoom-out').addEventListener('click', function(){ zoomBy(1/ZOOM_STEP); });
  document.getElementById('btn-fit').addEventListener('click', fitToScreen);
  /* Легенда: при первом запуске (нет сохранённого состояния) развёрнута, дальше — как оставил пользователь. */
  var LEGEND_OPEN_KEY = 'nodusLegendOpen';
  (function(){
    var open = true;
    try{ open = localStorage.getItem(LEGEND_OPEN_KEY) !== '0'; }catch(e){}
    document.getElementById('legend-body').hidden = !open;
    document.getElementById('legend-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  })();
  document.getElementById('legend-toggle').addEventListener('click', function(ev){
    var body = document.getElementById('legend-body');
    body.hidden = !body.hidden;
    ev.currentTarget.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
    try{ localStorage.setItem(LEGEND_OPEN_KEY, body.hidden ? '0' : '1'); }catch(e){}
  });
  document.getElementById('btn-relayout').addEventListener('click', function(){
    if (focusMode) exitFocus(true);
    Object.keys(state.objects).forEach(function(id){ state.objects[id].fx=null; state.objects[id].fy=null; });
    Object.keys(state.mechanisms).forEach(function(id){ state.mechanisms[id].fx=null; state.mechanisms[id].fy=null; });
    pendingInitialFit = true;
    var spread = initialSpread(nodeById.size, 200);
    nodeById.forEach(function(n){
      n.fx=null; n.fy=null;
      n.x=(Math.random()-0.5)*2*spread; n.y=(Math.random()-0.5)*2*spread; n.vx=0; n.vy=0;
    });
    sim.alpha = 1;
    persist();
    requestRender();
  });

  function exportData(){
    var data = JSON.stringify(serializeState(), null, 2);
    var blob = new Blob([data], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'object-graph-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', function(){
    document.getElementById('file-import').click();
  });
  document.getElementById('file-import').addEventListener('change', function(ev){
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(){
      var data;
      try { data = JSON.parse(reader.result); }
      catch(e){ alert('Не удалось прочитать файл: это не корректный JSON.'); ev.target.value=''; return; }
      openModal({
        title:'Импортировать данные?',
        bodyHTML:'<p>Текущие данные (' + dataSummary(serializeState()) + ') будут заменены содержимым файла (' + dataSummary(data) + '). Это необратимо.</p>',
        footerButtons:[
          {label:'Отмена', onClick:function(){ return true; }},
          {label:'Импортировать', variant:'danger', onClick:function(){
            applyState(data);
            nodeById.clear();
            persist(); syncGraphModel(); renderSidebar(); updateStats(); clearSelection();
          }}
        ]
      });
      ev.target.value = '';
    };
    reader.readAsText(file);
  });

  /* Очистка: подтверждение вводом слова, логика удаления прежняя. */
  var RESET_CONFIRM_WORD = 'удалить';
  document.getElementById('btn-reset').addEventListener('click', function(){
    var ac = 0;
    Object.keys(state.objects).forEach(function(id){ ac += (state.objects[id].attachments||[]).length; });
    Object.keys(state.mechanisms).forEach(function(id){ ac += (state.mechanisms[id].attachments||[]).length; });
    function confirmed(root){
      var input = root.querySelector('#reset-confirm-input');
      return !!input && input.value.trim().toLowerCase() === RESET_CONFIRM_WORD;
    }
    openModal({
      title:'Очистить все данные?',
      wide:true,
      bodyHTML:
        '<p>Будет удалено: ' + dataSummary(serializeState()) + ' и ' +
          ac + ' ' + pluralRu(ac,'вложение','вложения','вложений') + '. Действие необратимо.</p>' +
        '<p class="confirm-note">Сами файлы вложений в подключённой папке останутся на диске.</p>' +
        '<label class="field-label confirm-input" for="reset-confirm-input">Чтобы подтвердить, введите слово «' + RESET_CONFIRM_WORD + '»</label>' +
        '<input type="text" class="field-input" id="reset-confirm-input" autocomplete="off">',
      footerButtons:[
        {label:'Отмена', onClick:function(){ return true; }},
        {label:'Сначала сделать экспорт', onClick:function(){ exportData(); return false; }},
        {label:'Удалить всё', variant:'danger', onClick:function(root){
          if (!confirmed(root)) return false;
          emptyState(); nodeById.clear();
          persist(); syncGraphModel(); renderSidebar(); updateStats(); clearSelection();
        }}
      ]
    });
    var root = document.getElementById('modal-root');
    var buttons = root.querySelectorAll('.modal-footer .btn');
    var deleteBtn = buttons[buttons.length-1];
    var input = root.querySelector('#reset-confirm-input');
    deleteBtn.disabled = true;
    input.addEventListener('input', function(){ deleteBtn.disabled = !confirmed(root); });
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter' && confirmed(root)) deleteBtn.click(); });
    input.focus();
  });

  /* Меню «⋯» */
  var moreBtn = document.getElementById('btn-more');
  var moreMenu = document.getElementById('more-menu');
  function setMoreMenuOpen(open){
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open){ var first = moreMenu.querySelector('.menu-item'); if (first) first.focus(); }
  }
  moreBtn.addEventListener('click', function(){ setMoreMenuOpen(moreMenu.hidden); });
  moreMenu.querySelectorAll('.menu-item').forEach(function(item){
    item.addEventListener('click', function(){ setMoreMenuOpen(false); });
  });
  moreMenu.addEventListener('keydown', function(e){
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var items = Array.prototype.slice.call(moreMenu.querySelectorAll('.menu-item'));
    var i = items.indexOf(document.activeElement);
    items[(i + (e.key==='ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  });
  document.addEventListener('mousedown', function(e){
    if (!moreMenu.hidden && !moreMenu.parentNode.contains(e.target)) setMoreMenuOpen(false);
  });

  bindGlobalSearch();

  window.addEventListener('keydown', function(e){
    if (currentView === 'list' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && !e.ctrlKey && !e.metaKey &&
        !document.getElementById('detail-panel').hidden && !document.getElementById('modal-root').innerHTML && !isTypingTarget(document.activeElement)){
      e.preventDefault();
      moveListSelection(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')){
      e.preventDefault();
      var gs = document.getElementById('global-search-input');
      gs.focus(); gs.select();
      return;
    }
    if (e.key === 'Escape'){
      if (!document.getElementById('more-menu').hidden){ document.getElementById('more-menu').hidden = true; document.getElementById('btn-more').setAttribute('aria-expanded','false'); document.getElementById('btn-more').focus(); }
      else if (closeListDropdowns()){}
      else if (document.getElementById('modal-root').innerHTML) closeModal();
      else if (focusMode) exitFocus();
      else clearSelection();
    }
  });
}

function init(){
  readTheme();
  canvasEl = document.getElementById('graph-canvas');
  ctx2d = canvasEl.getContext('2d');

  var filterMechCategorySelect = document.getElementById('filter-mechcategory');
  MECH_CATEGORIES.forEach(function(c){
    var opt = document.createElement('option');
    opt.value = c.code; opt.textContent = c.title;
    filterMechCategorySelect.appendChild(opt);
  });

  loadPersisted();
  tryRestoreFolder();
  loadPanelWidths();
  applyPanelWidths();
  attachHandlers();
  resizeCanvas();
  updateStats();
  renderSidebar();
  syncGraphModel();
  requestRender();
}

document.addEventListener('DOMContentLoaded', init);
