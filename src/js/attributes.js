'use strict';

/* ===================== Реквизиты объектов =====================
   Коллекция state.attributes: {id, objectId, name, synonym, valueType, tabularSection, description}.
   name — имя в конфигураторе (ключ для будущего импорта из XML-выгрузки); tabularSection —
   имя табличной части, пусто — реквизит шапки. Порядок реквизитов — порядок создания. */

var ATTR_HEADER_TITLE = 'Шапка';

function objectAttributes(objId){
  return Object.keys(state.attributes).map(function(id){ return state.attributes[id]; })
    .filter(function(a){ return a.objectId === objId; });
}
function objectAttributeCounts(){
  var counts = {};
  Object.keys(state.attributes).forEach(function(id){ var o = state.attributes[id].objectId; counts[o] = (counts[o] || 0) + 1; });
  return counts;
}
/* Табличные части объекта — по алфавиту, без учёта регистра. */
function objectTabularSections(objId){
  var seen = {}, out = [];
  objectAttributes(objId).forEach(function(a){
    var ts = a.tabularSection || ''; if (!ts) return;
    var k = ts.toLowerCase(); if (!seen[k]){ seen[k] = true; out.push(ts); }
  });
  return out.sort(function(a,b){ return a.localeCompare(b,'ru'); });
}
/* Полное имя для отображения: «ЗаявкаНаПодборПерсонала.Подразделение» или
   «ЗаявкаНаПодборПерсонала.Кандидаты.ФИО». Без имени в конфигураторе — синоним объекта. */
function attributeFullName(a){
  var o = state.objects[a.objectId];
  var owner = o ? (objectIdentifier(o) || o.name) : '?';
  return owner + '.' + (a.tabularSection ? a.tabularSection + '.' : '') + a.name;
}

/* Имя реквизита: обязательно, правила идентификатора 1С, уникально в пределах объекта и
   табличной части без учёта регистра. Возвращает текст ошибки или ''. */
function attributeNameError(name, objId, ts, exceptId){
  if (!name) return 'Укажите имя реквизита.';
  if (!validIdentifier(name)) return 'Имя — без пробелов и точек и не начинается с цифры.';
  var k = name.toLowerCase(), tk = (ts || '').toLowerCase();
  var dup = objectAttributes(objId).some(function(a){
    return a.id !== exceptId && (a.tabularSection || '').toLowerCase() === tk && a.name.toLowerCase() === k;
  });
  return dup ? 'Реквизит «' + name + '» уже есть ' + (ts ? 'в табличной части «' + ts + '»' : 'в шапке') + '.' : '';
}
function tabularSectionError(ts){
  return validIdentifier(ts) ? '' : 'Табличная часть — без пробелов и точек и не начинается с цифры.';
}

function createAttribute(partial){
  var id = uid('attr');
  var a = {
    id:id, objectId:partial.objectId, name:partial.name,
    synonym:partial.synonym || '', valueType:partial.valueType || '',
    tabularSection:partial.tabularSection || '', description:''
  };
  state.attributes[id] = a;
  persist();
  return a;
}
function attributesChanged(obj, panel){
  persist();
  renderAttributesBlock(obj, panel);
  if (currentView === 'list') renderListView();
}

/* ----- Блок «Реквизиты · N» в карточке объекта ----- */

function attributesSectionHTML(){
  return '<div class="panel-section is-tight">' +
    '<div class="panel-section-header"><p class="panel-section-title" id="obj-attrs-title">Реквизиты</p>' +
      '<button class="btn btn-sm" id="btn-add-attr" type="button" title="Добавить реквизит">+ Добавить</button></div>' +
    '<div id="obj-attrs-list"></div>' +
    '<div id="obj-attr-add"></div>' +
  '</div>';
}

/* Свёрнутые группы (табличные части) — на время сессии; ключ «объект|табличная часть». */
var attrGroupCollapsed = {};

function renderAttributesBlock(obj, panel){
  var container = panel.querySelector('#obj-attrs-list');
  if (!container) return;
  var attrs = objectAttributes(obj.id);
  panel.querySelector('#obj-attrs-title').textContent = 'Реквизиты · ' + attrs.length;
  if (!attrs.length){ container.innerHTML = '<p class="ref-empty">Реквизитов пока нет.</p>'; return; }

  var byTs = {}, tsOrder = [];
  attrs.forEach(function(a){
    var ts = a.tabularSection || '';
    var k = ts.toLowerCase();
    if (!byTs[k]){ byTs[k] = {ts:ts, list:[]}; tsOrder.push(k); }
    byTs[k].list.push(a);
  });
  tsOrder.sort(function(a, b){ return (a === '' ? -1 : b === '' ? 1 : byTs[a].ts.localeCompare(byTs[b].ts, 'ru')); });

  container.innerHTML = '<div class="attr-table">' +
    '<div class="attr-head"><span>Имя</span><span>Синоним</span><span>Тип</span><span></span></div>' +
    tsOrder.map(function(k){
      var g = byTs[k], ck = obj.id + '|' + k, collapsed = !!attrGroupCollapsed[ck];
      return '<div class="attr-group">' +
        '<button type="button" class="attr-group-toggle" data-ck="' + escapeHtml(ck) + '" aria-expanded="' + !collapsed + '">' +
          '<span class="attr-group-chevron" aria-hidden="true"></span>' +
          '<span class="attr-group-title">' + (g.ts ? escapeHtml(g.ts) : ATTR_HEADER_TITLE) + '</span>' +
          '<span class="attr-group-count">' + g.list.length + '</span>' +
        '</button>' +
        '<div class="attr-rows"' + (collapsed ? ' hidden' : '') + '>' +
          g.list.map(function(a){
            return '<div class="attr-row" data-id="' + a.id + '">' +
              '<span class="attr-cell is-name" data-field="name" tabindex="0" title="' + escapeHtml(attributeFullName(a)) + '">' + escapeHtml(a.name) + '</span>' +
              '<span class="attr-cell' + (a.synonym ? '' : ' is-empty') + '" data-field="synonym" tabindex="0" title="' + escapeHtml(a.synonym || 'Синоним') + '">' + escapeHtml(a.synonym || '—') + '</span>' +
              '<span class="attr-cell' + (a.valueType ? '' : ' is-empty') + '" data-field="valueType" tabindex="0" title="' + escapeHtml(a.valueType || 'Тип значения') + '">' + escapeHtml(a.valueType || '—') + '</span>' +
              '<button type="button" class="card-menu-btn attr-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с реквизитом" title="Действия">⋯</button>' +
            '</div>' +
            '<p class="field-error attr-row-error" hidden></p>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';

  container.querySelectorAll('.attr-group-toggle').forEach(function(t){
    t.addEventListener('click', function(){
      var open = t.getAttribute('aria-expanded') !== 'true';
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      t.nextElementSibling.hidden = !open;
      attrGroupCollapsed[t.getAttribute('data-ck')] = !open;
    });
  });
  container.querySelectorAll('.attr-row').forEach(function(row){
    var a = state.attributes[row.getAttribute('data-id')];
    row.querySelectorAll('.attr-cell').forEach(function(cell){
      cell.addEventListener('click', function(){ editAttributeCell(obj, panel, a, cell); });
      cell.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); editAttributeCell(obj, panel, a, cell); } });
    });
    var menuBtn = row.querySelector('.attr-menu-btn');
    menuBtn.addEventListener('click', function(){
      openPopoverMenu(menuBtn, [{value:'delete', label:'Удалить реквизит', danger:true}], function(){
        delete state.attributes[a.id];
        attributesChanged(obj, panel);
      });
    });
  });
}

/* Правка ячейки по клику: Enter / уход фокуса — сохранить, Esc — отменить. Некорректное
   имя не сохраняется: по Enter ошибка видна под строкой, по уходу фокуса — возвращается прежнее. */
function editAttributeCell(obj, panel, a, cell){
  var field = cell.getAttribute('data-field');
  var err = cell.parentNode.nextElementSibling;
  var input = document.createElement('input');
  input.type = 'text'; input.className = 'field-input attr-cell-input' + (field === 'name' ? ' is-name' : '');
  input.value = a[field] || '';
  input.setAttribute('aria-label', {name:'Имя', synonym:'Синоним', valueType:'Тип значения'}[field]);
  cell.replaceWith(input);
  input.focus(); input.select();
  var done = false;
  function finish(save, onBlur){
    if (done) return true;
    var v = normalizeLabel(input.value);
    if (save && field === 'name'){
      var e = attributeNameError(v, a.objectId, a.tabularSection, a.id);
      if (e && !onBlur){ err.textContent = e; err.hidden = false; return false; }
      if (e){ done = true; renderAttributesBlock(obj, panel); showRowError(panel, a.id, e + ' Значение не сохранено.'); return true; }
    }
    done = true;
    if (save && v !== (a[field] || '')){ a[field] = v; attributesChanged(obj, panel); }
    else renderAttributesBlock(obj, panel);
    return true;
  }
  input.addEventListener('keydown', function(e){
    if (e.key === 'Enter'){ e.preventDefault(); if (finish(true)) focusAttrCell(panel, a.id, field); }
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); focusAttrCell(panel, a.id, field); }
  });
  input.addEventListener('input', function(){ err.hidden = true; });
  input.addEventListener('blur', function(){ finish(true, true); });
}
function focusAttrCell(panel, id, field){
  var c = panel.querySelector('.attr-row[data-id="' + id + '"] .attr-cell[data-field="' + field + '"]');
  if (c) c.focus();
}
function showRowError(panel, id, text){
  var row = panel.querySelector('.attr-row[data-id="' + id + '"]');
  if (!row) return;
  var err = row.nextElementSibling; err.textContent = text; err.hidden = false;
}

/* «+ Добавить»: строка ввода внизу блока. Tab — по полям, Enter — сохранить и открыть
   следующую пустую строку (табличная часть сохраняется), Esc — закрыть. */
function bindAddAttribute(panel, obj){
  var btn = panel.querySelector('#btn-add-attr'), host = panel.querySelector('#obj-attr-add');
  btn.addEventListener('click', function(){
    if (host.firstChild){ host.innerHTML = ''; return; }
    host.innerHTML = '<div class="om-add attr-add">' +
      '<div class="attr-add-grid">' +
        '<div><input type="text" class="field-input attr-add-name" placeholder="Имя *" aria-label="Имя реквизита" autocomplete="off"><p class="field-error attr-add-name-err" hidden></p></div>' +
        '<div><input type="text" class="field-input attr-add-syn" placeholder="Синоним" aria-label="Синоним" autocomplete="off"></div>' +
        '<div><input type="text" class="field-input attr-add-type" placeholder="Тип значения" aria-label="Тип значения" autocomplete="off"></div>' +
        '<div><div class="attr-add-ts"></div><p class="field-error attr-add-ts-err" hidden></p></div>' +
      '</div>' +
      '<p class="attr-add-hint">Enter — сохранить и ввести следующий · Esc — закрыть</p>' +
    '</div>';
    var nameIn = host.querySelector('.attr-add-name'), synIn = host.querySelector('.attr-add-syn'), typeIn = host.querySelector('.attr-add-type');
    var nameErr = host.querySelector('.attr-add-name-err'), tsErr = host.querySelector('.attr-add-ts-err');
    var tsIn = buildCombobox(host.querySelector('.attr-add-ts'), {
      placeholder:'Табличная часть: ' + ATTR_HEADER_TITLE, ariaLabel:'Табличная часть (пусто — шапка)',
      source:function(q){
        var k = q.toLowerCase();
        var list = objectTabularSections(obj.id).filter(function(ts){ return !k || ts.toLowerCase().indexOf(k) >= 0; })
          .map(function(ts){ return {value:ts, label:ts, sub:'табличная часть'}; });
        if (!q) list.unshift({value:'', label:ATTR_HEADER_TITLE, sub:'реквизиты шапки'});
        return list;
      },
      createLabel:function(q){
        if (!q) return null;
        var k = q.toLowerCase();
        return objectTabularSections(obj.id).some(function(ts){ return ts.toLowerCase() === k; }) ? null : '+ Создать табличную часть «' + q + '»';
      },
      onPick:function(it){ tsIn.value = it.value; tsErr.hidden = true; }
    });
    function save(){
      var name = normalizeLabel(nameIn.value);
      var ts = canonicalLabel(tsIn.value, objectTabularSections(obj.id));
      var te = tabularSectionError(ts);
      tsErr.textContent = te; tsErr.hidden = !te;
      var ne = attributeNameError(name, obj.id, ts);
      nameErr.textContent = ne; nameErr.hidden = !ne;
      if (ne){ nameIn.focus(); return; }
      if (te){ tsIn.focus(); return; }
      createAttribute({objectId:obj.id, name:name, synonym:normalizeLabel(synIn.value), valueType:normalizeLabel(typeIn.value), tabularSection:ts});
      tsIn.value = ts;
      nameIn.value = ''; synIn.value = ''; typeIn.value = '';
      attributesChanged(obj, panel);
      nameIn.focus();
    }
    host.querySelector('.attr-add').addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); save(); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); host.innerHTML = ''; btn.focus(); }
    });
    nameIn.addEventListener('input', function(){ nameErr.hidden = true; });
    tsIn.addEventListener('input', function(){ tsErr.hidden = true; });
    nameIn.focus();
  });
}
