'use strict';

/* ===================== Боковой список ===================== */

function refreshTagFilterOptions(){
  var select = document.getElementById('filter-tag');
  var current = select.value;
  var allTags = new Set();
  Object.keys(state.objects).forEach(function(id){
    (state.objects[id].tags||[]).forEach(function(t){ allTags.add(t); });
  });
  var sorted = Array.from(allTags).sort(function(a,b){ return a.localeCompare(b,'ru'); });
  select.innerHTML = '<option value="">Все теги</option>' + sorted.map(function(t){
    return '<option value="'+escapeHtml(t)+'"'+(t===current?' selected':'')+'>'+escapeHtml(t)+'</option>';
  }).join('');
}

/* ===================== Вид «Список» ===================== */

/* Две вкладки, как в левой панели «Графа». У каждой — свой поиск, отборы и сортировка
   (в памяти, на время сессии). Сортировка — внутри группы (тип объекта / категория механизма). */
var listTab = 'objects';
var listSearch = { objects:'', mechanisms:'', roles:'' };
var listFilters = {
  objects:    { type:{}, sub:{}, tag:{} },
  mechanisms: { cat:{},  sub:{}, tag:{} },
  roles:      {}
};
var listSort = { objects:{key:'name', dir:1}, mechanisms:{key:'name', dir:1}, roles:{key:'name', dir:1} };
/* Колонки. hideBelow — ширина таблицы (px), ниже которой колонка скрывается
   (открытая карточка сужает таблицу: сначала уходят «Реквизиты», затем «Теги», затем «Подсистема»). */
var LIST_COLUMNS = {
  objects: [
    {key:'name',   title:'Синоним',               width:'minmax(0,2.2fr)'},
    {key:'code',   title:'Имя в конфигураторе',   width:'minmax(0,2fr)'},
    {key:'sub',    title:'Подсистема',            width:'minmax(0,1.4fr)', hideBelow:860},
    {key:'mechs',  title:'Механизмы',             width:'96px'},
    {key:'attrs',  title:'Реквизиты',             width:'96px', hideBelow:1180},
    {key:'tags',   title:'Теги',                  width:'minmax(0,1.4fr)', hideBelow:1060},
    {key:'status', title:'Статус',                width:'112px'}
  ],
  mechanisms: [
    {key:'name',    title:'Название',   width:'minmax(0,2.2fr)'},
    {key:'cat',     title:'Категория',  width:'minmax(0,1.1fr)'},
    {key:'sources', title:'Источники',  width:'minmax(0,2fr)'},
    {key:'targets', title:'Приёмники',  width:'minmax(0,2fr)'},
    {key:'status',  title:'Статус',     width:'112px'}
  ],
  roles: [
    {key:'name',  title:'Название',                 width:'minmax(0,1.6fr)'},
    {key:'desc',  title:'Описание',                 width:'minmax(0,3fr)'},
    {key:'procs', title:'Используется в процессах', width:'200px'}
  ]
};
var listTableWidth = 0;

function objectIdentifier(o){ var fn = o.fullName || ''; var i = fn.indexOf('.'); return i >= 0 ? fn.slice(i + 1) : fn; }
function objectTypeKey(o){ return typeInfo(o.type) ? o.type : ''; }

/* Роли объекта в каждом механизме — для подсказки у счётчика «Механизмы». */
function objectMechanismRoles(oid){
  var out = [];
  Object.keys(state.mechanisms).forEach(function(mid){
    var m = state.mechanisms[mid], roles = [];
    m.participants.forEach(function(p){
      if (p.objectId !== oid) return;
      var t = roleInfo(p.role).title; if (roles.indexOf(t) < 0) roles.push(t);
    });
    if (roles.length) out.push({mech:m, roles:roles});
  });
  return out.sort(function(a,b){ return a.mech.title.localeCompare(b.mech.title,'ru'); });
}
/* Источники и приёмники механизма — по направлению роли; синонимы без повторов. */
function mechanismSides(m){
  var src = [], dst = [];
  m.participants.forEach(function(p){
    var o = p.objectId && state.objects[p.objectId]; if (!o) return;
    var dir = roleInfo(p.role).direction;
    var arr = dir === 'source' ? src : (dir === 'target' ? dst : null);
    if (arr && arr.indexOf(o.name) < 0) arr.push(o.name);
  });
  return {sources:src, targets:dst};
}
function mechanismParticipantObjects(m){
  var out = [];
  m.participants.forEach(function(p){ var o = p.objectId && state.objects[p.objectId]; if (o && out.indexOf(o) < 0) out.push(o); });
  return out;
}

/* Значения ячеек: text — показ и сортировка; пустая строка — пустая ячейка (в сортировке всегда в конце). */
function listObjectValues(o, mechRoles, attrCount){
  var subs = objectSubsystems(o), tags = o.tags || [];
  var st = o.status || DEFAULT_OBJECT_STATUS;
  return {
    name: o.name,
    code: objectIdentifier(o),
    sub: subs.join(', '),
    mechs: mechRoles.length,
    attrs: attrCount || 0,
    tags: tags.join(', '),
    status: st === DEFAULT_OBJECT_STATUS ? '' : objectStatusTitle(st),
    statusKind: statusKind(st)
  };
}
function listMechanismValues(m){
  var sides = mechanismSides(m), st = m.status || DEFAULT_MECH_STATUS;
  return {
    name: m.title,
    cat: categoryTitle(m.category),
    sources: sides.sources, targets: sides.targets,
    sourcesText: sides.sources.join(', '), targetsText: sides.targets.join(', '),
    status: st === DEFAULT_MECH_STATUS ? '' : mechanismStatusTitle(st),
    statusKind: statusKind(st)
  };
}

function listRoleValues(r){
  return { name:r.name, desc:r.description || '', procs:roleProcessCount(r.id) };
}

function listSortValue(v, key){
  if (key === 'sources') return v.sourcesText;
  if (key === 'targets') return v.targetsText;
  return v[key];
}
function listCompare(a, b, key, dir){
  var x = listSortValue(a.v, key), y = listSortValue(b.v, key);
  var r;
  if (typeof x === 'number') r = (x - y) * dir;
  else {
    if (!x && y) return 1;          /* пустые значения — в конце в обе стороны */
    if (x && !y) return -1;
    r = String(x).localeCompare(String(y), 'ru', {numeric:true}) * dir;
  }
  return r || a.v.name.localeCompare(b.v.name, 'ru');
}

function anyKey(sel){ return Object.keys(sel).length > 0; }
function matchesAny(sel, values){ return !anyKey(sel) || values.some(function(v){ return sel[v]; }); }

function listFilteredObjects(){
  var q = listSearch.objects.toLowerCase().trim(), f = listFilters.objects;
  return Object.keys(state.objects).map(function(id){ return state.objects[id]; })
    .filter(isShown)
    .filter(function(o){
      return !q || o.name.toLowerCase().indexOf(q)>=0 || (o.fullName||'').toLowerCase().indexOf(q)>=0 ||
        (o.tags||[]).join(' ').toLowerCase().indexOf(q)>=0 || (o.description||'').toLowerCase().indexOf(q)>=0;
    })
    .filter(function(o){ return !anyKey(f.type) || f.type[objectTypeKey(o)]; })
    .filter(function(o){ return matchesAny(f.sub, objectSubsystems(o)); })
    .filter(function(o){ return matchesAny(f.tag, o.tags || []); });
}
function listFilteredRoles(){
  var q = listSearch.roles.toLowerCase().trim();
  return Object.keys(state.roles).map(function(id){ return state.roles[id]; })
    .filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) >= 0 || (r.description||'').toLowerCase().indexOf(q) >= 0; });
}
/* У механизма нет своих подсистем и тегов — отбор по ним идёт по объектам-участникам. */
function listFilteredMechanisms(){
  var q = listSearch.mechanisms.toLowerCase().trim(), f = listFilters.mechanisms;
  return Object.keys(state.mechanisms).map(function(id){ return state.mechanisms[id]; })
    .filter(isShown)
    .filter(function(m){
      return !q || m.title.toLowerCase().indexOf(q)>=0 || (m.summary||'').toLowerCase().indexOf(q)>=0 || (m.body||'').toLowerCase().indexOf(q)>=0;
    })
    .filter(function(m){ return !anyKey(f.cat) || f.cat[m.category]; })
    .filter(function(m){
      if (!anyKey(f.sub) && !anyKey(f.tag)) return true;
      var objs = mechanismParticipantObjects(m);
      var subs = [], tags = [];
      objs.forEach(function(o){ subs = subs.concat(objectSubsystems(o)); tags = tags.concat(o.tags || []); });
      return matchesAny(f.sub, subs) && matchesAny(f.tag, tags);
    });
}

/* Выпадающий множественный отбор (тот же вид, что у отбора типов в левой панели). */
function multiSelectHTML(id, label){
  return '<div class="multi-select" data-ms="' + id + '">' +
    '<button class="select-sm multi-select-btn" type="button" aria-haspopup="true" aria-expanded="false">' + escapeHtml(label) + '</button>' +
    '<div class="multi-select-dropdown" hidden></div></div>';
}
function fillMultiSelect(root, opts){
  var sel = opts.selected, dropdown = root.querySelector('.multi-select-dropdown'), btn = root.querySelector('.multi-select-btn');
  var scrollTop = dropdown.scrollTop;
  dropdown.innerHTML = (opts.items.length ? opts.items.map(function(it){
    return '<label class="multi-select-item"' + (it.color ? ' style="--c:' + it.color + '"' : '') + '>' +
      '<input type="checkbox" value="' + escapeHtml(it.code) + '"' + (sel[it.code] ? ' checked' : '') + '>' +
      (it.iconHTML || '') +
      '<span class="multi-select-item-text">' + escapeHtml(it.title) + '</span>' +
      (it.count != null ? '<span class="multi-select-item-count">' + it.count + '</span>' : '') +
    '</label>';
  }).join('') : '<div class="multi-select-item"><span class="multi-select-item-text">' + escapeHtml(opts.emptyText) + '</span></div>') +
    '<div class="multi-select-sep"></div>' +
    '<button type="button" class="multi-select-reset"' + (anyKey(sel) ? '' : ' disabled') + '>Сбросить отбор</button>';
  dropdown.scrollTop = scrollTop;
  dropdown.querySelectorAll('input[type=checkbox]').forEach(function(cb){
    cb.addEventListener('change', function(){
      if (cb.checked) sel[cb.value] = true; else delete sel[cb.value];
      opts.onChange();
    });
  });
  dropdown.querySelector('.multi-select-reset').addEventListener('click', function(){
    Object.keys(sel).forEach(function(k){ delete sel[k]; }); opts.onChange();
  });
  var titles = opts.items.filter(function(it){ return sel[it.code]; }).map(function(it){ return it.title; });
  btn.textContent = !titles.length ? opts.allLabel : (titles.length === 1 ? titles[0] : opts.manyLabel + ': ' + titles.length);
  btn.title = titles.join(', ');
  btn.classList.toggle('has-value', titles.length > 0);
}
function bindMultiSelectToggle(ms){
  ms.querySelector('.multi-select-btn').addEventListener('click', function(){
    var dd = ms.querySelector('.multi-select-dropdown');
    var open = dd.hidden;
    closeListDropdowns(ms);
    dd.hidden = !open; this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
function closeListDropdowns(except){
  var any = false;
  document.querySelectorAll('.multi-select[data-ms]').forEach(function(ms){
    if (ms === except) return;
    var dd = ms.querySelector('.multi-select-dropdown');
    if (!dd.hidden) any = true;
    dd.hidden = true; ms.querySelector('.multi-select-btn').setAttribute('aria-expanded','false');
  });
  return any;
}

var listFiltersTab = null;
function renderListFilters(){
  var box = document.getElementById('list-filters');
  var isObj = listTab === 'objects', f = listFilters[listTab];
  /* У ролей нет отборов и устаревших — только поиск. */
  document.querySelector('.list-view-toolbar .deprecated-switch').hidden = listTab === 'roles';
  if (listTab === 'roles'){ box.innerHTML = ''; listFiltersTab = listTab; return; }
  if (listFiltersTab !== listTab){
    box.innerHTML = (isObj ? multiSelectHTML('type', 'Все типы') : multiSelectHTML('cat', 'Все категории')) +
      multiSelectHTML('sub', 'Все подсистемы') + multiSelectHTML('tag', 'Все теги');
    box.querySelectorAll('.multi-select').forEach(bindMultiSelectToggle);
    listFiltersTab = listTab;
  }
  var shownObjects = Object.keys(state.objects).map(function(id){ return state.objects[id]; }).filter(isShown);
  var cnt = {type:{}, sub:{}, tag:{}};
  shownObjects.forEach(function(o){
    var k = objectTypeKey(o); cnt.type[k] = (cnt.type[k]||0) + 1;
    objectSubsystems(o).forEach(function(s){ cnt.sub[s] = (cnt.sub[s]||0) + 1; });
    (o.tags||[]).forEach(function(t){ cnt.tag[t] = (cnt.tag[t]||0) + 1; });
  });
  if (isObj){
    var typeItems = OBJECT_TYPES.filter(function(t){ return cnt.type[t.code] || f.type[t.code]; })
      .map(function(t){ return {code:t.code, title:t.plural, color:typeColor(t.code), iconHTML:typeIconSVG(t.code), count:cnt.type[t.code]||0}; });
    if (cnt.type[''] || f.type['']) typeItems.push({code:'', title:UNKNOWN_TYPE_TITLE, color:THEME.typeUnknown, iconHTML:typeIconSVG(''), count:cnt.type['']||0});
    fillMultiSelect(box.querySelector('[data-ms="type"]'), {items:typeItems, selected:f.type, allLabel:'Все типы', manyLabel:'Типов', emptyText:'Объектов нет', onChange:renderListView});
  } else {
    var catCnt = {};
    Object.keys(state.mechanisms).forEach(function(id){ var m = state.mechanisms[id]; if (isShown(m)) catCnt[m.category] = (catCnt[m.category]||0) + 1; });
    var catItems = MECH_CATEGORIES.filter(function(c){ return catCnt[c.code] || f.cat[c.code]; })
      .map(function(c){ return {code:c.code, title:c.title, iconHTML:'<span class="dot dot-diamond" style="background:' + categoryAccent(c.code) + '"></span>', count:catCnt[c.code]||0}; });
    fillMultiSelect(box.querySelector('[data-ms="cat"]'), {items:catItems, selected:f.cat, allLabel:'Все категории', manyLabel:'Категорий', emptyText:'Механизмов нет', onChange:renderListView});
  }
  /* Счётчики подсистем и тегов — по объектам: у механизмов отбор идёт через участников. */
  fillMultiSelect(box.querySelector('[data-ms="sub"]'), {
    items: allSubsystems().map(function(s){ return {code:s, title:s, count:cnt.sub[s]||0}; }),
    selected:f.sub, allLabel:'Все подсистемы', manyLabel:'Подсистем', emptyText:'Подсистем пока нет', onChange:renderListView});
  fillMultiSelect(box.querySelector('[data-ms="tag"]'), {
    items: allTags().map(function(t){ return {code:t, title:t, count:cnt.tag[t]||0}; }),
    selected:f.tag, allLabel:'Все теги', manyLabel:'Тегов', emptyText:'Тегов пока нет', onChange:renderListView});
}

function visibleListColumns(){
  return LIST_COLUMNS[listTab].filter(function(c){ return !c.hideBelow || !listTableWidth || listTableWidth >= c.hideBelow; });
}

function listCellHTML(col, v, entity){
  var title = '';
  switch (col.key){
    case 'name':
      if (listTab !== 'mechanisms') return '<span class="lv-cell is-name" title="' + escapeHtml(v.name) + '"><span class="lv-text">' + escapeHtml(v.name) + '</span></span>';
      return '<span class="lv-cell is-name" title="' + escapeHtml(v.name) + '"><span class="dot" style="background:' + categoryAccent(entity.category) + '"></span><span class="lv-text">' + escapeHtml(v.name) + '</span></span>';
    case 'code':
      return '<span class="lv-cell is-code" title="' + escapeHtml(entity.fullName || '') + '">' + escapeHtml(v.code) + '</span>';
    case 'attrs':
      return '<span class="lv-cell is-count' + (v.attrs ? '' : ' is-zero') + '" title="' + escapeHtml(v.attrs ? v.attrs + ' ' + pluralRu(v.attrs,'реквизит','реквизита','реквизитов') : 'Реквизитов нет') + '">' + v.attrs + '</span>';
    case 'procs':
      return '<span class="lv-cell is-count' + (v.procs ? '' : ' is-zero') + '">' + v.procs + '</span>';
    case 'mechs':
      title = v.mechRoles.length ? v.mechRoles.map(function(r){ return r.mech.title + ' — ' + r.roles.join(', '); }).join('\n') : 'Не участвует в механизмах';
      return '<span class="lv-cell is-count' + (v.mechs ? '' : ' is-zero') + '" title="' + escapeHtml(title) + '"><span class="lv-diamond"></span>' + v.mechs + '</span>';
    case 'sources': case 'targets':
      var arr = v[col.key], shown = arr.slice(0, 3), rest = arr.length - shown.length;
      return '<span class="lv-cell is-list" title="' + escapeHtml(arr.join('\n')) + '"><span class="lv-text">' + escapeHtml(shown.join(', ')) + '</span>' +
        (rest > 0 ? '<span class="lv-more">+' + rest + '</span>' : '') + '</span>';
    case 'status':
      return '<span class="lv-cell">' + (v.status ? '<span class="status-badge status-' + v.statusKind + '">' + escapeHtml(v.status) + '</span>' : '') + '</span>';
    default:
      return '<span class="lv-cell" title="' + escapeHtml(v[col.key]) + '">' + escapeHtml(v[col.key]) + '</span>';
  }
}

function renderListView(){
  var objs = listFilteredObjects(), mechs = listFilteredMechanisms(), roles = listFilteredRoles();
  document.getElementById('list-count-objects').textContent = objs.length;
  document.getElementById('list-count-mechanisms').textContent = mechs.length;
  document.getElementById('list-count-roles').textContent = roles.length;
  renderListFilters();

  var isObj = listTab === 'objects', cols = visibleListColumns(), sort = listSort[listTab];
  var template = cols.map(function(c){ return c.width; }).join(' ');
  var rows, groups = [];
  if (isObj){
    var attrCounts = objectAttributeCounts();
    rows = objs.map(function(o){ var mr = objectMechanismRoles(o.id); var v = listObjectValues(o, mr, attrCounts[o.id]); v.mechRoles = mr; return {e:o, v:v}; });
    var byType = {};
    rows.forEach(function(r){ var k = objectTypeKey(r.e); (byType[k] = byType[k] || []).push(r); });
    OBJECT_TYPES.forEach(function(t){ if (byType[t.code]) groups.push({title:t.plural, head:'<span style="--c:' + typeColor(t.code) + '">' + typeIconSVG(t.code) + '</span>', rows:byType[t.code]}); });
    if (byType['']) groups.push({title:UNKNOWN_TYPE_TITLE, head:'<span style="--c:' + THEME.typeUnknown + '">' + typeIconSVG('') + '</span>', rows:byType['']});
  } else if (listTab === 'roles'){
    /* Роли не группируются — одна группа без заголовка. */
    groups.push({title:null, rows:roles.map(function(r){ return {e:r, v:listRoleValues(r)}; })});
    if (!roles.length) groups = [];
  } else {
    rows = mechs.map(function(m){ return {e:m, v:listMechanismValues(m)}; });
    var byCat = {};
    rows.forEach(function(r){ (byCat[r.e.category] = byCat[r.e.category] || []).push(r); });
    MECH_CATEGORIES.forEach(function(c){ if (byCat[c.code]) groups.push({title:c.title, head:'<span class="dot dot-diamond" style="background:' + categoryAccent(c.code) + '"></span>', rows:byCat[c.code]}); });
  }
  groups.forEach(function(g){ g.rows.sort(function(a, b){ return listCompare(a, b, sort.key, sort.dir); }); });

  var head = '<div class="lv-head" role="row">' + cols.map(function(c){
    var on = sort.key === c.key;
    return '<button type="button" class="lv-sort' + (on ? ' is-sorted' : '') + '" data-sort="' + c.key + '" role="columnheader" aria-sort="' + (on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' +
      escapeHtml(c.title) + (on ? '<span class="lv-sort-arrow" aria-hidden="true">' + (sort.dir > 0 ? '↑' : '↓') + '</span>' : '') + '</button>';
  }).join('') + '</div>';
  var kind = {objects:'object', mechanisms:'mechanism', roles:'role'}[listTab];
  var html = groups.length ? head + groups.map(function(g){
    return '<div class="list-view-group">' + (g.title ? '<p class="lv-group-title">' + g.head + escapeHtml(g.title) + ' · ' + g.rows.length + '</p>' : '') +
      g.rows.map(function(r){
        return '<button class="list-view-row lv-row' + (r.e.status === 'deprecated' ? ' is-deprecated' : '') + '" data-kind="' + kind + '" data-id="' + r.e.id + '" type="button">' +
          cols.map(function(c){ return listCellHTML(c, r.v, r.e); }).join('') + '</button>';
      }).join('') + '</div>';
  }).join('') : '<p class="ref-empty" style="margin-top:18px">Ничего не найдено.</p>';

  var body = document.getElementById('list-view-body');
  body.style.setProperty('--lv-cols', template);
  body.innerHTML = html;
  syncSidebarActive();
  body.querySelectorAll('.lv-sort').forEach(function(b){
    b.addEventListener('click', function(){
      var key = b.getAttribute('data-sort');
      if (sort.key === key) sort.dir = -sort.dir; else { sort.key = key; sort.dir = 1; }
      renderListView();
    });
  });
  body.querySelectorAll('.list-view-row').forEach(function(row){
    row.addEventListener('click', function(){
      selectEntity(LIST_ROW_ENTITY[row.getAttribute('data-kind')], row.getAttribute('data-id'));
    });
  });
}
/* data-kind строки списка → вид сущности для selectEntity. */
var LIST_ROW_ENTITY = {object:'obj', mechanism:'mech', role:'role'};

function setListTab(tab){
  if (tab === listTab) return;
  listTab = tab;
  document.querySelectorAll('.list-tab').forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-list-tab') === tab); });
  document.getElementById('list-search').value = listSearch[tab];
  document.getElementById('list-search').placeholder = tab === 'roles' ? 'Название или описание' : 'Имя, синоним или описание';
  document.getElementById('btn-list-add').textContent = {objects:'+ Объект', mechanisms:'+ Механизм', roles:'+ Роль'}[tab];
  closeListDropdowns();
  renderListView();
}

/* Ширина таблицы решает, какие колонки видны (перерисовка — только при смене набора). */
function watchListWidth(){
  var body = document.getElementById('list-view-body');
  function update(){
    var w = body.clientWidth - 40; /* внутренние отступы тела списка */
    if (w <= 0) return;
    var before = visibleListColumns().length;
    listTableWidth = w;
    if (visibleListColumns().length !== before) renderListView();
  }
  if (window.ResizeObserver) new ResizeObserver(update).observe(body);
  else window.addEventListener('resize', update);
}

