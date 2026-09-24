'use strict';

/* ===================== Процессы в остальном Nodus =====================
   Наложение процесса на граф, обратные блоки в карточках объекта, механизма и роли,
   счётчики «Процессы» в «Списке», процессы и шаги в поиске Ctrl+K. */

/* ----- Где используется сущность ----- */

function processesByName(){ return allProcesses().sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); }); }

/* Объект: роли участия его самого и его реквизитов, «К» — контроли, нацеленные на него или реквизит.
   [{proc, steps:[{step, num, text}]}] */
function objectProcessUses(objId){
  var attrs = {}; objectAttributes(objId).forEach(function(a){ attrs[a.id] = true; });
  var out = [];
  processesByName().forEach(function(proc){
    var nums = stepNumbers(proc), rows = [];
    orderedSteps(proc).forEach(function(s){
      var objRoles = {}, attrRoles = {}, ctrl = false;
      s.participants.forEach(function(p){
        if (p.entityType === 'object' && p.entityId === objId) objRoles[p.role] = true;
        if (p.entityType === 'attribute' && attrs[p.entityId]) attrRoles[p.role] = true;
      });
      stepControls(s).forEach(function(c){ c.targets.forEach(function(t){
        if ((t.entityType === 'object' && t.entityId === objId) || (t.entityType === 'attribute' && attrs[t.entityId])) ctrl = true;
      }); });
      var letters = [];
      MATRIX_ROLE_ORDER.object.forEach(function(r){ if (objRoles[r]) letters.push(participationRole('object', r).letter); });
      MATRIX_ROLE_ORDER.attribute.forEach(function(r){ var l = participationRole('attribute', r).letter; if (attrRoles[r] && letters.indexOf(l) < 0) letters.push(l); });
      if (ctrl) letters.push('К');
      if (letters.length) rows.push({step:s, num:nums[s.id], text:letters.join(', ')});
    });
    if (rows.length) out.push({proc:proc, steps:rows});
  });
  return out;
}
/* Механизм: как участник шага и как источник автоматического контроля. */
function mechanismProcessUses(mechId){
  var part = [], ctrl = [];
  processesByName().forEach(function(proc){
    var nums = stepNumbers(proc), pr = [], cr = [];
    orderedSteps(proc).forEach(function(s){
      var roles = s.participants.filter(function(p){ return p.entityType === 'mechanism' && p.entityId === mechId; })
        .map(function(p){ return participationRole('mechanism', p.role).title; });
      if (roles.length) pr.push({step:s, num:nums[s.id], text:roles.join(', ')});
      var reacts = stepControls(s).filter(function(c){ return c.source === 'mechanism' && c.sourceId === mechId; })
        .map(function(c){ return controlReaction(c.reaction).title.toLowerCase(); });
      if (reacts.length) cr.push({step:s, num:nums[s.id], text:reacts.join(', ')});
    });
    if (pr.length) part.push({proc:proc, steps:pr});
    if (cr.length) ctrl.push({proc:proc, steps:cr});
  });
  return {participant:part, control:ctrl};
}
/* Роль: исполнитель шагов и владелец процесса. */
function roleProcessUses(roleId){
  var out = [];
  processesByName().forEach(function(proc){
    var nums = stepNumbers(proc), rows = [];
    orderedSteps(proc).forEach(function(s){ if (s.roleId === roleId) rows.push({step:s, num:nums[s.id], text:stepKindTitle(s.kind).toLowerCase()}); });
    if (rows.length || proc.ownerRoleId === roleId) out.push({proc:proc, steps:rows, owner:proc.ownerRoleId === roleId});
  });
  return out;
}
function objectProcessCount(objId){ return objectProcessUses(objId).length; }
function mechanismProcessCount(mechId){
  var u = mechanismProcessUses(mechId), ids = {};
  u.participant.concat(u.control).forEach(function(g){ ids[g.proc.id] = true; });
  return Object.keys(ids).length;
}
function roleProcessCount(roleId){ return roleProcessUses(roleId).length; }

/* Блок «… в процессах · N»: процесс → шаги (номер, название, роли); клик — переход к шагу. */
function renderProcessUsesBlock(container, title, groups, emptyText){
  if (!container) return;
  container.innerHTML = '<div class="panel-section is-tight">' +
    '<div class="panel-section-header"><p class="panel-section-title">' + escapeHtml(title) + ' · ' + groups.length + '</p></div>' +
    (groups.length ? groups.map(function(g){
      return '<div class="pu-group"><button type="button" class="om-link pu-proc" data-proc="' + g.proc.id + '">' +
          '<span class="om-mech-title">' + typeIconSVG('bproc') + '<span class="ref-item-title">' + escapeHtml(g.proc.name) + '</span></span>' +
          (g.owner ? '<span class="om-note">владелец процесса</span>' : '') + '</button>' +
        g.steps.map(function(r){
          return '<button type="button" class="om-link pu-step" data-proc="' + g.proc.id + '" data-step="' + r.step.id + '">' +
            '<span class="step-num">' + r.num + '</span><span class="ref-item-title">' + escapeHtml(r.step.name) + '</span>' +
            '<span class="pu-roles">' + escapeHtml(r.text) + '</span></button>';
        }).join('') + '</div>';
    }).join('') : '<p class="ref-empty">' + escapeHtml(emptyText) + '</p>') +
  '</div>';
  container.querySelectorAll('.pu-step, .pu-proc').forEach(function(b){
    b.addEventListener('click', function(){ setGraphHint(null); goToProcessStep(b.getAttribute('data-proc'), b.getAttribute('data-step')); });
  });
}

/* ----- Наложение процесса на граф ----- */

var processOverlay = null; /* {procId, nodes:Map(nodeId → [stepId]), mechs:Set} */
var processBadgeRects = [];

/* Узлы процесса: объекты-участники и цели контролей (сам объект), механизмы-участники и источники
   автоконтролей. Реквизиты не поднимают свой объект — у него свой блок в карточке. */
function buildProcessOverlay(procId){
  var proc = state.processes[procId]; if (!proc) return null;
  var nodes = new Map(), mechs = new Set();
  function add(nid, stepId){ var l = nodes.get(nid) || nodes.set(nid, []).get(nid); if (l.indexOf(stepId) < 0) l.push(stepId); }
  orderedSteps(proc).forEach(function(s){
    s.participants.forEach(function(p){
      if (p.entityType === 'object' && state.objects[p.entityId]) add('obj:' + p.entityId, s.id);
      if (p.entityType === 'mechanism' && state.mechanisms[p.entityId]){ add('mech:' + p.entityId, s.id); mechs.add(p.entityId); }
    });
    stepControls(s).forEach(function(c){
      if (c.source === 'mechanism' && state.mechanisms[c.sourceId]){ add('mech:' + c.sourceId, s.id); mechs.add(c.sourceId); }
      c.targets.forEach(function(t){ if (t.entityType === 'object' && state.objects[t.entityId]) add('obj:' + t.entityId, s.id); });
    });
  });
  return {procId:procId, nodes:nodes, mechs:mechs, numbers:stepNumbers(proc)};
}
function setProcessOverlay(procId){
  processOverlay = procId ? buildProcessOverlay(procId) : null;
  if (!processOverlay) processBadgeRects = [];
  var sel = document.getElementById('proc-overlay-select');
  if (sel && sel.value !== (processOverlay ? procId : '')) sel.value = processOverlay ? procId : '';
  requestRender();
}
/* Список процессов в левой панели; после изменений данных наложение пересобирается. */
function fillProcessOverlaySelect(){
  var sel = document.getElementById('proc-overlay-select'); if (!sel) return;
  var cur = processOverlay && state.processes[processOverlay.procId] ? processOverlay.procId : '';
  sel.innerHTML = '<option value="">нет</option>' + processesByName().map(function(p){
    return '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
  }).join('');
  sel.closest('.proc-overlay-row').hidden = !allProcesses().length;
  if (processOverlay) setProcessOverlay(cur);
}
function inGraphSelection(id){
  return (!graphFilter || graphFilter.nodes.has(id)) && (!processOverlay || processOverlay.nodes.has(id));
}
function overlayEdgeIn(e){
  if (processOverlay.nodes.has(e.a) && processOverlay.nodes.has(e.b)) return true;
  var hit = false;
  if (e.mechanismIds) e.mechanismIds.forEach(function(id){ if (processOverlay.mechs.has(id)) hit = true; });
  return hit;
}
/* «1, 6»; больше трёх — «1, 3 +2». */
function overlayBadgeText(stepIds){
  var n = stepIds.map(function(id){ return processOverlay.numbers[id]; });
  return n.length <= 3 ? n.join(', ') : n.slice(0, 2).join(', ') + ' +' + (n.length - 2);
}
function drawProcessBadges(ctx){
  processBadgeRects = [];
  if (!processOverlay || focusMode) return;
  ctx.save();
  ctx.font = THEME.badgeFont; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  currentNodes.forEach(function(n){
    var steps = processOverlay.nodes.get(n.id); if (!steps) return;
    var r = nodeRadius(n) * view.scale, cx = n.x * view.scale + view.offsetX, cy = n.y * view.scale + view.offsetY;
    if (cx < -40 || cy < -40 || cx > viewportWidth + 40 || cy > viewportHeight + 40) return;
    var text = overlayBadgeText(steps), w = ctx.measureText(text).width + 12, h = 18;
    var x = cx + r * 0.55, y = cy - r - h + 6;
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = THEME.panel; ctx.fill();
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = THEME.accent; ctx.fillText(text, x + 6, y + h / 2 + 0.5);
    processBadgeRects.push({x:x, y:y, w:w, h:h, nodeId:n.id, stepId:steps[0], text:text});
  });
  ctx.restore();
}
function processBadgeClick(sx, sy){
  if (!processOverlay) return false;
  var b = processBadgeRects.filter(function(r){ return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h; })[0];
  if (!b) return false;
  goToProcessStep(processOverlay.procId, b.stepId);
  return true;
}

/* ----- Поиск Ctrl+K: процессы и шаги ----- */
function processSearchMatches(q){
  var res = [];
  allProcesses().forEach(function(p){
    var i = p.name.toLowerCase().indexOf(q), n = p.steps.length;
    if (i >= 0) res.push({kind:'proc', id:p.id, title:p.name, sub:'Процесс · ' + n + ' ' + pluralRu(n,'шаг','шага','шагов'), color:typeColor('bproc'), pos:i});
    var nums = null;
    p.steps.forEach(function(s){
      var j = s.name.toLowerCase().indexOf(q); if (j < 0) return;
      nums = nums || stepNumbers(p);
      res.push({kind:'step', id:s.id, procId:p.id, title:s.name, sub:'Шаг ' + nums[s.id] + ' · ' + p.name, color:typeColor('bproc'), pos:j});
    });
  });
  return res;
}
