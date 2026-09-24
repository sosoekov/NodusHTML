'use strict';

/* Левая панель показывает либо объекты, либо механизмы. У каждой вкладки своя
   строка поиска (запоминается при переключении) и свои фильтры. Отбор открытой
   вкладки подсвечивает граф, остальное приглушается. */
var sideTab = 'objects';
var sideSearch = { objects:'', mechanisms:'' };
var graphFilter = null; /* null — отбор не задан; иначе {nodes:Set, edge:function(e)} */

/* Отбор по подсистемам в левой панели (дерево и так сгруппировано по типу). Пусто — все. */
var sideSubFilter = {};

function renderSideSubFilter(){
  var cnt = {};
  Object.keys(state.objects).forEach(function(id){
    var o = state.objects[id]; if (!isShown(o)) return;
    objectSubsystems(o).forEach(function(s){ cnt[s] = (cnt[s]||0) + 1; });
  });
  fillMultiSelect(document.querySelector('[data-ms="side-sub"]'), {
    items: allSubsystems().map(function(s){ return {code:s, title:s, count:cnt[s]||0}; }),
    selected:sideSubFilter, allLabel:'Все подсистемы', manyLabel:'Подсистем', emptyText:'Подсистем пока нет', onChange:renderSidebar});
}

function filteredSideObjects(){
  var q = sideSearch.objects.toLowerCase().trim();
  var tagFilter = document.getElementById('filter-tag').value;
  var subsOn = anyKey(sideSubFilter);
  var list = Object.keys(state.objects).map(function(id){return state.objects[id];})
    .filter(isShown)
    .filter(function(o){
      return !q || o.name.toLowerCase().indexOf(q)>=0 || (o.fullName||'').toLowerCase().indexOf(q)>=0 ||
        (o.tags||[]).join(' ').toLowerCase().indexOf(q)>=0;
    })
    .filter(function(o){ return matchesAny(sideSubFilter, objectSubsystems(o)); })
    .filter(function(o){ return !tagFilter || (o.tags||[]).indexOf(tagFilter)>=0; })
    .sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); });
  return {list:list, active:!!(q || subsOn || tagFilter)};
}

function filteredSideMechanisms(){
  var q = sideSearch.mechanisms.toLowerCase().trim();
  var catFilter = document.getElementById('filter-mechcategory').value;
  var list = Object.keys(state.mechanisms).map(function(id){return state.mechanisms[id];})
    .filter(isShown)
    .filter(function(m){ return !q || m.title.toLowerCase().indexOf(q)>=0; })
    .filter(function(m){ return !catFilter || m.category===catFilter; })
    .sort(function(a,b){ return a.title.localeCompare(b.title,'ru'); });
  return {list:list, active:!!(q || catFilter)};
}

function computeGraphFilter(objs, mechs){
  var nodes = new Set();
  if (sideTab === 'objects'){
    if (!objs.active) return null;
    objs.list.forEach(function(o){ nodes.add('obj:'+o.id); });
    /* Механизмы с отобранным участником (узлы-ромбы в полном режиме) — тоже яркие. */
    Object.keys(state.mechanisms).forEach(function(mid){
      if (state.mechanisms[mid].participants.some(function(p){ return nodes.has('obj:'+p.objectId); })) nodes.add('mech:'+mid);
    });
    return {nodes:nodes, edge:function(e){ return (nodes.has(e.a) && e.a.indexOf('obj:')===0) || (nodes.has(e.b) && e.b.indexOf('obj:')===0); }};
  }
  if (!mechs.active) return null;
  var mechIds = new Set();
  mechs.list.forEach(function(m){
    mechIds.add(m.id); nodes.add('mech:'+m.id);
    m.participants.forEach(function(p){ if (p.objectId && state.objects[p.objectId]) nodes.add('obj:'+p.objectId); });
  });
  return {nodes:nodes, edge:function(e){
    var hit = false; e.mechanismIds.forEach(function(id){ if (mechIds.has(id)) hit = true; }); return hit;
  }};
}

/* Участники с выбранным объектом; есть ли среди них источник и приёмник (по направлению роли). */
function mechanismParticipantInfo(m){
  var parts = m.participants.filter(function(p){ return p.objectId && state.objects[p.objectId]; });
  return {
    count: parts.length,
    hasSource: parts.some(function(p){ return roleInfo(p.role).direction === 'source'; }),
    hasTarget: parts.some(function(p){ return roleInfo(p.role).direction === 'target'; })
  };
}
function objectMechanismCounts(){
  var counts = {};
  Object.keys(state.mechanisms).forEach(function(mid){
    var seen = {};
    state.mechanisms[mid].participants.forEach(function(p){
      if (p.objectId && !seen[p.objectId]){ seen[p.objectId] = true; counts[p.objectId] = (counts[p.objectId]||0) + 1; }
    });
  });
  return counts;
}

/* Свёрнутые группы списка объектов — удобство интерфейса, хранится отдельно от данных. */
var SIDE_GROUPS_KEY = 'nodusSideGroupsCollapsed';
var sideGroupCollapsed = (function(){
  try{ return JSON.parse(localStorage.getItem(SIDE_GROUPS_KEY) || '{}') || {}; }catch(e){ return {}; }
})();
function saveSideGroupState(){
  try{ localStorage.setItem(SIDE_GROUPS_KEY, JSON.stringify(sideGroupCollapsed)); }catch(e){}
}

/* ===================== Подсистемы и теги =====================
   Подсистем у объекта может быть несколько: опциональное поле subsystems[]; старое поле
   subsystem (строка) сохраняется и равно первой подсистеме — старые данные читаются как [subsystem]. */
function normalizeLabel(s){ return String(s || '').replace(/\s+/g, ' ').trim(); }
function objectSubsystems(o){
  if (Array.isArray(o.subsystems)) return o.subsystems.slice();
  return o.subsystem ? [normalizeLabel(o.subsystem)].filter(Boolean) : [];
}
function setObjectSubsystems(o, list){
  o.subsystems = list.slice();
  o.subsystem = list[0] || '';
}
function allSubsystems(){
  var seen = {}, out = [];
  Object.keys(state.objects).forEach(function(id){
    objectSubsystems(state.objects[id]).forEach(function(s){ var k = s.toLowerCase(); if (!seen[k]){ seen[k] = true; out.push(s); } });
  });
  return out.sort(function(a,b){ return a.localeCompare(b,'ru'); });
}
function allTags(){
  var seen = {}, out = [];
  Object.keys(state.objects).forEach(function(id){
    (state.objects[id].tags || []).forEach(function(t){ var k = t.toLowerCase(); if (!seen[k]){ seen[k] = true; out.push(t); } });
  });
  return out.sort(function(a,b){ return a.localeCompare(b,'ru'); });
}
/* Если значение уже есть (без учёта регистра) — берём существующее написание. */
function canonicalLabel(value, existing){
  var v = normalizeLabel(value), k = v.toLowerCase();
  for (var i = 0; i < existing.length; i++) if (existing[i].toLowerCase() === k) return existing[i];
  return v;
}

/* Редактор чипов с автодополнением.
   opt: {values(), suggestions(), onChange(list), freeCreate, placeholder, chipClass, createLabel}
   freeCreate — Enter или «,» превращают текст в чип (теги); иначе новое значение добавляется
   только явным пунктом «+ Создать „…“» (подсистемы). Backspace в пустом поле удаляет последний чип. */
function buildChipEditor(container, opt){
  var list = opt.values().slice();
  container.innerHTML = '<div class="chip-editor"><input type="text" class="chip-input" autocomplete="off"><div class="combo-dropdown" hidden></div></div>';
  var editor = container.querySelector('.chip-editor');
  var input = editor.querySelector('.chip-input');
  var dropdown = editor.querySelector('.combo-dropdown');
  input.placeholder = opt.placeholder || '';
  input.setAttribute('aria-label', opt.label || '');
  var items = [], active = -1;

  function has(v){ var k = v.toLowerCase(); return list.some(function(x){ return x.toLowerCase() === k; }); }
  function commit(){ opt.onChange(list.slice()); }
  function add(value){
    var v = canonicalLabel(value, opt.suggestions());
    if (!v || has(v)) return false;
    list.push(v); commit(); renderChips(); return true;
  }
  function renderChips(){
    editor.querySelectorAll('.chip-wrap').forEach(function(c){ c.remove(); });
    list.forEach(function(v, i){
      var chip = document.createElement('span');
      chip.className = 'chip-wrap ' + (opt.chipClass || 'tag-chip');
      chip.innerHTML = escapeHtml(v) + '<button type="button" class="chip-x" aria-label="Убрать «' + escapeHtml(v) + '»" tabindex="-1">×</button>';
      chip.querySelector('.chip-x').addEventListener('mousedown', function(e){ e.preventDefault(); });
      chip.querySelector('.chip-x').addEventListener('click', function(){ list.splice(i, 1); commit(); renderChips(); input.focus(); renderDropdown(); });
      editor.insertBefore(chip, input);
    });
  }
  function renderDropdown(){
    var q = normalizeLabel(input.value).toLowerCase();
    var sugg = opt.suggestions().filter(function(s){ return !has(s) && (!q || s.toLowerCase().indexOf(q) >= 0); }).slice(0, 8);
    items = sugg.map(function(s){ return {value:s}; });
    var exact = q && opt.suggestions().some(function(s){ return s.toLowerCase() === q; });
    if (q && !exact && !has(input.value)) items.push({value:normalizeLabel(input.value), create:true});
    active = items.length ? 0 : -1;
    if (!items.length){ dropdown.hidden = true; return; }
    dropdown.innerHTML = items.map(function(it, i){
      return '<div class="combo-item' + (it.create ? ' combo-item-create' : '') + (i === active ? ' is-active' : '') + '" data-i="' + i + '">' +
        (it.create ? '+ ' + (opt.createLabel || 'Создать') + ' „' + escapeHtml(it.value) + '“' : '<span class="combo-item-text">' + escapeHtml(it.value) + '</span>') + '</div>';
    }).join('');
    dropdown.hidden = false;
    dropdown.querySelectorAll('.combo-item').forEach(function(el){
      el.addEventListener('mousedown', function(e){ e.preventDefault(); pick(Number(el.getAttribute('data-i'))); });
    });
  }
  function highlight(){ dropdown.querySelectorAll('.combo-item').forEach(function(el, i){ el.classList.toggle('is-active', i === active); }); }
  function pick(i){ var it = items[i]; if (!it) return; add(it.value); input.value = ''; renderDropdown(); input.focus(); }

  input.addEventListener('input', function(){
    if (opt.freeCreate && input.value.indexOf(',') >= 0){
      var parts = input.value.split(','), rest = parts.pop();
      parts.forEach(function(p){ add(p); });
      input.value = rest;
    }
    renderDropdown();
  });
  input.addEventListener('focus', renderDropdown);
  input.addEventListener('keydown', function(e){
    if (e.key === 'ArrowDown' && items.length){ e.preventDefault(); active = (active + 1) % items.length; highlight(); }
    else if (e.key === 'ArrowUp' && items.length){ e.preventDefault(); active = (active - 1 + items.length) % items.length; highlight(); }
    else if (e.key === 'Enter'){
      e.preventDefault();
      /* Выделенная подсказка — всегда в приоритете (так «подбор персонала» выберет существующее). */
      if (active >= 0 && items[active]) pick(active);
      else if (opt.freeCreate && normalizeLabel(input.value)){ add(input.value); input.value = ''; renderDropdown(); }
    }
    else if (e.key === 'Backspace' && !input.value && list.length){ list.pop(); commit(); renderChips(); renderDropdown(); }
    else if (e.key === 'Escape' && !dropdown.hidden){ e.preventDefault(); e.stopPropagation(); dropdown.hidden = true; }
  });
  input.addEventListener('blur', function(){
    dropdown.hidden = true;
    if (opt.freeCreate && normalizeLabel(input.value)){ add(input.value); input.value = ''; }
  });
  editor.addEventListener('mousedown', function(e){ if (e.target === editor){ e.preventDefault(); input.focus(); } });
  renderChips();
  return {focus:function(){ input.focus(); }};
}

function renderSidebar(){
  refreshTagFilterOptions();
  renderSideSubFilter();
  var objs = filteredSideObjects(), mechs = filteredSideMechanisms();
  document.getElementById('side-count-objects').textContent = objs.list.length;
  document.getElementById('side-count-mechanisms').textContent = mechs.list.length;
  graphFilter = computeGraphFilter(objs, mechs);
  requestRender();

  var container = document.getElementById('object-list');
  if (sideTab === 'objects'){
    var mechCount = objectMechanismCounts();
    function objectRow(o){
      var mc = mechCount[o.id] || 0;
      var st = o.status || DEFAULT_OBJECT_STATUS;
      var badge = st === DEFAULT_OBJECT_STATUS ? '' :
        '<span class="list-row-sub"><span class="status-badge status-'+statusKind(st)+'">'+escapeHtml(objectStatusTitle(st))+'</span></span>';
      var tip = 'Участвует в '+mc+' '+pluralRu(mc,'механизме','механизмах','механизмах');
      return '<button class="list-row'+(st === 'deprecated' ? ' is-deprecated' : '')+'" data-kind="object" data-id="'+o.id+'" type="button">' +
        '<span class="dot" style="background:'+typeColor(o.type)+'"></span>' +
        '<span class="list-row-main"><span class="list-row-title">'+escapeHtml(o.name)+'</span>' + badge + '</span>' +
        '<span class="list-row-meta"><span class="list-row-count'+(mc ? '' : ' is-zero')+'" title="'+tip+'" aria-label="'+tip+'"><span class="lv-diamond" aria-hidden="true"></span>'+mc+'</span></span>' +
      '</button>';
    }
    /* Группы по типу, как в дереве конфигуратора; пустые не показываются.
       При активном поиске/отборе группы с совпадениями раскрыты принудительно. */
    var byType = {};
    objs.list.forEach(function(o){ var k = typeInfo(o.type) ? o.type : ''; (byType[k] = byType[k] || []).push(o); });
    var groups = OBJECT_TYPES.filter(function(t){ return byType[t.code]; })
      .map(function(t){ return {code:t.code, title:t.plural, color:typeColor(t.code), items:byType[t.code]}; });
    if (byType['']) groups.push({code:'', title:UNKNOWN_TYPE_TITLE, color:THEME.typeUnknown, items:byType['']});
    container.innerHTML = groups.length ? groups.map(function(g){
      var open = objs.active || !sideGroupCollapsed[g.code || '_unknown'];
      return '<div class="side-group">' +
        '<button type="button" class="side-group-header" data-group="' + (g.code || '_unknown') + '" aria-expanded="' + open + '" style="--c:' + g.color + '">' +
          '<span class="side-group-chevron" aria-hidden="true"></span>' + typeIconSVG(g.code) +
          '<span class="side-group-title">' + escapeHtml(g.title) + '</span>' +
          '<span class="side-group-count">' + g.items.length + '</span>' +
        '</button>' +
        '<div class="side-group-items"' + (open ? '' : ' hidden') + '>' + g.items.map(objectRow).join('') + '</div>' +
      '</div>';
    }).join('') : '<p class="ref-empty">Ничего не найдено.</p>';
    container.querySelectorAll('.side-group-header').forEach(function(hd){
      hd.addEventListener('click', function(){
        var code = hd.getAttribute('data-group');
        var nowOpen = hd.getAttribute('aria-expanded') !== 'true';
        hd.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        hd.nextElementSibling.hidden = !nowOpen;
        if (nowOpen) delete sideGroupCollapsed[code]; else sideGroupCollapsed[code] = true;
        saveSideGroupState();
      });
    });
  } else {
    container.innerHTML = mechs.list.length ? mechs.list.map(function(m){
      var info = mechanismParticipantInfo(m);
      var warn = !info.hasSource && !info.hasTarget ? 'Нет источника и приёмника' : (!info.hasSource ? 'Нет источника' : (!info.hasTarget ? 'Нет приёмника' : ''));
      var noSummary = !(m.summary||'').trim();
      return '<button class="list-row" data-kind="mechanism" data-id="'+m.id+'" type="button">' +
        '<span class="dot dot-diamond" style="background:'+categoryAccent(m.category)+'"></span>' +
        '<span class="list-row-main"><span class="list-row-title">'+escapeHtml(m.title)+'</span>' +
          '<span class="list-row-sub"><span class="cat-badge" style="--cat:'+categoryAccent(m.category)+'">'+escapeHtml(categoryTitle(m.category))+'</span>' +
          (noSummary ? '<span class="no-summary" title="Краткое описание пустое — подсказка на графе не покажется">без описания</span>' : '') +
        '</span></span>' +
        '<span class="list-row-meta">' +
          (warn ? '<span class="list-row-warn" title="'+warn+'" aria-label="'+warn+'">⚠</span>' : '') +
          '<span class="list-row-count" title="Участников: '+info.count+'">'+info.count+'</span>' +
        '</span>' +
      '</button>';
    }).join('') : '<p class="ref-empty">Ничего не найдено.</p>';
  }

  container.querySelectorAll('.list-row').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = btn.getAttribute('data-id');
      if (btn.getAttribute('data-kind')==='object'){
        pinnedNodeId = 'obj:'+id; pinnedMechanismId=null; pinnedEdgeKey=null;
        renderObjectPanel(state.objects[id]);
      } else {
        pinnedMechanismId = id; pinnedNodeId=null; pinnedEdgeKey=null;
        renderMechanismPanel(state.mechanisms[id]);
      }
      syncSidebarActive(); requestRender();
      centerOnEntity(btn.getAttribute('data-kind')==='object' ? 'obj' : 'mech', id);
    });
  });
  syncSidebarActive();
  if (currentView === 'list') renderListView();
  if (currentView === 'process') renderProcessView();
}

