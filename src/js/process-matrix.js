'use strict';

/* ===================== Матрица процесса =====================
   Столбцы — шаги в порядке раскладки ленты (номера как на ленте), строки — объекты и под ними
   их реквизиты, участвующие в процессе. Ячейка — буквы ролей участия (С И Ч П Х / З И Ч) и «К»,
   если шаг контролирует объект или реквизит. Заголовки закреплены при прокрутке. */

var MATRIX_ROLE_ORDER = { object:['create','update','read','post','close'], attribute:['fill','update','read'] };
var matrixCollapsed = {}; /* id объекта → реквизиты свёрнуты (на время сессии) */
var DELETED_ROW = 'deleted';

/* Строки матрицы: [{key, objId, name, color, dev, broken, cells:{stepId:{roles,ctrl}}, attrs:[…]}] в порядке первого появления. */
function matrixRows(proc, order){
  var groups = {}, list = [];
  function group(objId){
    var k = objId || DELETED_ROW;
    if (!groups[k]){
      var o = objId ? state.objects[objId] : null;
      groups[k] = {key:objId ? entityKey('object', objId) : DELETED_ROW, objId:objId, name:o ? o.name : (objId ? '⚠ Удалено: ' + deletedName(objId) : '⚠ Удалённые реквизиты'),
        color:o ? typeColor(o.type) : THEME.typeUnknown, dev:!!o && isDevStatus(o.status || ''), broken:!o, cells:{}, attrs:[], attrIdx:{}, own:false};
      list.push(groups[k]);
    }
    return groups[k];
  }
  function attrRow(attrId){
    var a = state.attributes[attrId], g = group(a ? a.objectId : null);
    if (!g.attrIdx[attrId]){
      g.attrIdx[attrId] = {key:entityKey('attribute', attrId), name:a ? (a.tabularSection ? a.tabularSection + '.' : '') + a.name : deletedName(attrId),
        title:a ? attributeFullName(a) : deletedName(attrId), broken:!a, dev:g.dev, cells:{}};
      g.attrs.push(g.attrIdx[attrId]);
    }
    return g.attrIdx[attrId];
  }
  function cell(row, stepId){ return row.cells[stepId] || (row.cells[stepId] = {roles:{}, ctrl:false}); }
  order.forEach(function(s){
    s.participants.forEach(function(p){
      if (p.entityType === 'object'){ var g = group(p.entityId); g.own = true; cell(g, s.id).roles[p.role] = true; }
      else if (p.entityType === 'attribute') cell(attrRow(p.entityId), s.id).roles[p.role] = true;
    });
    stepControls(s).forEach(function(c){ c.targets.forEach(function(t){
      if (t.entityType === 'object'){ var g = group(t.entityId); g.own = true; cell(g, s.id).ctrl = true; }
      else cell(attrRow(t.entityId), s.id).ctrl = true;
    }); });
  });
  return list;
}
function matrixCellText(type, c){
  if (!c) return '';
  var letters = MATRIX_ROLE_ORDER[type].filter(function(r){ return c.roles[r]; }).map(function(r){ return participationRole(type, r).letter; });
  if (c.ctrl) letters.push('К');
  return letters.join(' ');
}
/* Шаг «в разработке»: хотя бы один участник или контроль в разработке. */
function stepHasDev(s){
  return s.participants.some(function(p){ return isDevStatus(refStatus(p.entityType, p.entityId)); }) ||
    stepControls(s).some(function(c){ return isDevStatus(refStatus(controlRefType(c), c.sourceId)); });
}

function renderMatrix(container, proc, checks){
  var L = checks.layout, byId = {};
  proc.steps.forEach(function(s){ byId[s.id] = s; });
  var order = L.order.map(function(id){ return byId[id]; });
  var rows = matrixRows(proc, order);
  if (!order.length || !rows.length){
    container.innerHTML = '<p class="ref-empty pm-empty">' + (order.length ? 'В шагах процесса пока нет объектов и реквизитов.' : 'В процессе нет шагов.') + '</p>';
    return;
  }
  function cellsHTML(row, type){
    return order.map(function(s){
      var c = row.cells[s.id], text = matrixCellText(type, c), probs = checks.byCell[s.id + '|' + row.key];
      return '<td class="pm-cell' + (c && c.ctrl ? ' has-ctrl' : '') + (s.id === procSel.stepId ? ' is-active' : '') + '" data-step="' + s.id + '"' +
        (text ? ' title="' + escapeHtml(L.numbers[s.id] + ' · ' + s.name + ': ' + text) + '"' : '') + '>' +
        '<span class="pm-letters">' + escapeHtml(text) + '</span>' + checksBadgeHTML(probs) + '</td>';
    }).join('');
  }
  var head = '<tr><th class="pm-corner">Объект · реквизит</th>' + order.map(function(s){
    var stepProbs = (checks.byStep[s.id] || []).filter(function(p){ return !p.cellKey && !p.rowKey; });
    return '<th class="pm-col' + (stepHasDev(s) ? ' is-dev' : '') + (s.id === procSel.stepId ? ' is-active' : '') + '" data-step="' + s.id + '" title="' + escapeHtml(L.numbers[s.id] + ' · ' + s.name + (stepHasDev(s) ? ' · есть участники в разработке' : '')) + '">' +
      '<span class="pm-col-top"><span class="step-num">' + L.numbers[s.id] + '</span>' + checksBadgeHTML(stepProbs) + '</span>' +
      '<span class="pm-col-name">' + escapeHtml(s.name) + '</span></th>';
  }).join('') + '</tr>';
  var body = rows.map(function(g){
    var collapsed = g.objId && matrixCollapsed[g.objId];
    return '<tr class="pm-obj" data-row="' + escapeHtml(g.key) + '">' +
      '<th class="pm-row-head' + (g.dev ? ' is-dev' : '') + (g.broken ? ' is-broken' : '') + '" title="' + escapeHtml(g.name + (g.dev ? ' · в разработке' : '')) + '">' +
        '<span class="pm-row-inner">' +
          (g.attrs.length ? '<button type="button" class="pm-toggle" data-obj="' + escapeHtml(g.objId || DELETED_ROW) + '" aria-expanded="' + !collapsed + '" aria-label="Свернуть или развернуть реквизиты"></button>' : '<span class="pm-toggle-space"></span>') +
          '<span class="dot" style="background:' + g.color + '"></span><span class="pm-row-name">' + escapeHtml(g.name) + '</span>' +
          checksBadgeHTML(checks.byRow[g.key]) +
        '</span></th>' + cellsHTML(g, 'object') + '</tr>' +
      g.attrs.map(function(a){
        return '<tr class="pm-attr" data-parent="' + escapeHtml(g.objId || DELETED_ROW) + '"' + (collapsed ? ' hidden' : '') + '>' +
          '<th class="pm-row-head is-attr' + (a.dev ? ' is-dev' : '') + (a.broken ? ' is-broken' : '') + '" title="' + escapeHtml(a.title) + '"><span class="pm-row-inner"><span class="pm-row-name">' +
            (a.broken ? '⚠ Удалено: ' : '') + escapeHtml(a.name) + '</span>' + checksBadgeHTML(checks.byRow[a.key]) + '</span></th>' +
          cellsHTML(a, 'attribute') + '</tr>';
      }).join('');
  }).join('');
  container.innerHTML = '<table class="pm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';

  container.querySelectorAll('.pm-toggle').forEach(function(t){
    t.addEventListener('click', function(e){
      e.stopPropagation();
      var id = t.getAttribute('data-obj'), open = t.getAttribute('aria-expanded') !== 'true';
      matrixCollapsed[id] = !open;
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
      container.querySelectorAll('.pm-attr[data-parent="' + id + '"]').forEach(function(r){ r.hidden = !open; });
    });
  });
  /* Клик по ячейке или заголовку столбца — карточка шага. */
  container.querySelectorAll('.pm-cell, .pm-col').forEach(function(el){
    el.addEventListener('click', function(){ selectStep(el.getAttribute('data-step')); });
  });
}
function markActiveMatrixColumn(){
  document.querySelectorAll('#proc-matrix [data-step]').forEach(function(el){ el.classList.toggle('is-active', el.getAttribute('data-step') === procSel.stepId); });
}
