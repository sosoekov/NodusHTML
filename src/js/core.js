'use strict';

/* ===================== Справочники ===================== */

/* Словарь типов — единственное место, где задаются их подписи.
   Порядок — как в дереве конфигуратора 1С («Общие» сначала).
   title  — подпись в единственном числе (бейджи, крошки, легенда, поле «Тип»);
   plural — подпись во множественном числе (группы дерева и списка, фильтр типов);
   name1c — имя вида метаданных в конфигураторе (префикс «Имени в конфигураторе»);
   short  — метка типа внутри круга на графе. */
var OBJECT_TYPES = [
  {code:'subsystem', title:'Подсистема',              plural:'Подсистемы',               name1c:'Подсистема',             short:'Под'},
  {code:'commonmod', title:'Общий модуль',            plural:'Общие модули',             name1c:'ОбщийМодуль',            short:'ОМ'},
  {code:'role',      title:'Роль',                    plural:'Роли',                     name1c:'Роль',                   short:'Роль'},
  {code:'const',     title:'Константа',               plural:'Константы',                name1c:'Константа',              short:'Кон'},
  {code:'catalog',   title:'Справочник',              plural:'Справочники',              name1c:'Справочник',             short:'Спр'},
  {code:'document',  title:'Документ',                plural:'Документы',                name1c:'Документ',               short:'Док'},
  {code:'doclog',    title:'Журнал документов',       plural:'Журналы документов',       name1c:'ЖурналДокументов',       short:'ЖД'},
  {code:'enumt',     title:'Перечисление',            plural:'Перечисления',             name1c:'Перечисление',           short:'Пер'},
  {code:'report',    title:'Отчёт',                   plural:'Отчёты',                   name1c:'Отчет',                  short:'Отч'},
  {code:'process',   title:'Обработка',               plural:'Обработки',                name1c:'Обработка',              short:'Обр'},
  {code:'charchart', title:'План видов характеристик',plural:'Планы видов характеристик',name1c:'ПланВидовХарактеристик', short:'ПВХ'},
  {code:'infreg',    title:'Регистр сведений',        plural:'Регистры сведений',        name1c:'РегистрСведений',        short:'РС'},
  {code:'accumreg',  title:'Регистр накопления',      plural:'Регистры накопления',      name1c:'РегистрНакопления',      short:'РН'},
  {code:'bproc',     title:'Бизнес-процесс',          plural:'Бизнес-процессы',          name1c:'БизнесПроцесс',          short:'БП'},
  {code:'task',      title:'Задача',                  plural:'Задачи',                   name1c:'Задача',                 short:'Зад'},
  {code:'extsrc',    title:'Внешний источник данных', plural:'Внешние источники данных', name1c:'ВнешнийИсточникДанных',  short:'ВИД'}
];
var DEFAULT_OBJECT_TYPE = 'const';

/* Иконки типов (контурные, 16×16, цвет — currentColor). */
var TYPE_ICON_PATHS = {
  subsystem:'<rect x="2" y="2" width="12" height="4" rx="1"/><rect x="2" y="10" width="12" height="4" rx="1"/><path d="M8 6v4"/>',
  commonmod:'<path d="M3 2h7l3 3v9H3z"/><path d="M6.5 8 5 9.5 6.5 11M9.5 8 11 9.5 9.5 11"/>',
  role:'<circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/>',
  'const':'<rect x="6" y="1.5" width="4" height="4" rx=".6"/><rect x="1.5" y="10.5" width="4" height="4" rx=".6"/><rect x="10.5" y="10.5" width="4" height="4" rx=".6"/><path d="M8 5.5v2.5M3.5 10.5V8h9v2.5"/>',
  catalog:'<rect x="2" y="2" width="3.4" height="12" rx=".6"/><rect x="6.3" y="2" width="3.4" height="12" rx=".6"/><rect x="10.6" y="2" width="3.4" height="12" rx=".6"/><path d="M3 5h1.4M7.3 5h1.4M11.6 5h1.4M3 11h1.4M7.3 11h1.4M11.6 11h1.4"/>',
  document:'<rect x="3" y="1.5" width="10" height="13" rx="1"/><path d="M5.5 5h5M5.5 8h5M5.5 11h5"/>',
  doclog:'<rect x="2" y="1.5" width="12" height="13" rx="1"/><path d="M4.5 1.5v13"/><rect x="6.5" y="4" width="5.5" height="7.5" rx=".4"/><path d="M6.5 6.5h5.5M6.5 9h5.5M9.2 4v7.5"/>',
  enumt:'<path d="M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v2M14 11v2a1 1 0 0 1-1 1h-2M5 14H3a1 1 0 0 1-1-1v-2M7 2h2M7 14h2M2 7v2M14 7v2"/>',
  report:'<path d="M3 1.5h6.5L13 5v9.5H3z"/><path d="M6 12V9M8 12V7M10 12v-4"/>',
  process:'<path d="M9 14.5H3v-13h6.5L13 5v3"/><circle cx="11.5" cy="11.5" r="1.6"/><path d="M11.5 8.3v1.2M11.5 13.5v1.2M8.3 11.5h1.2M13.5 11.5h1.2M9.3 9.3l.8.8M12.9 12.9l.8.8M9.3 13.7l.8-.8M12.9 10.1l.8-.8"/>',
  charchart:'<rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 5.5h13M5 5.5v8M8 5.5v8M11 5.5v8M3 8h1M3 10.5h1M6.3 8h.5M9.3 10.5h.5M12.3 8h.5"/>',
  infreg:'<rect x="1.5" y="2" width="10" height="10" rx="1"/><path d="M1.5 5h10M1.5 8h10M5 5v7"/><path d="M10 13.5h4.5M12.8 11.8l1.7 1.7-1.7 1.7"/>',
  accumreg:'<ellipse cx="7" cy="3.5" rx="5" ry="2"/><path d="M2 3.5v8c0 1.1 2.2 2 5 2M12 3.5v4.5M2 7.5c0 1.1 2.2 2 5 2s5-.9 5-2"/><path d="M9.5 13h5M12.8 11.3l1.7 1.7-1.7 1.7"/>',
  bproc:'<rect x="5.5" y="1.5" width="5" height="3.5" rx=".5"/><path d="M8 5v2.5M4 7.5h8M4 7.5V10M12 7.5V10"/><rect x="2" y="10" width="4" height="4" rx=".5"/><path d="M12 9.5 14.5 12 12 14.5 9.5 12z"/>',
  task:'<rect x="3" y="2.5" width="10" height="12" rx="1"/><rect x="6" y="1.5" width="4" height="2" rx=".5"/><path d="M5.5 7h.5M8 7h3M5.5 9.5h.5M8 9.5h3M5.5 12h.5M8 12h3"/>',
  extsrc:'<path d="M4.5 12.5H4a3 3 0 0 1-.3-6A4.5 4.5 0 0 1 12.4 6a3.3 3.3 0 0 1-.4 6.5h-.5"/><path d="M8 14.5V8.5M5.8 10.6 8 8.4l2.2 2.2"/>'
};
function typeIconSVG(code){
  var body = TYPE_ICON_PATHS[code];
  if (!body) return '<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/></svg>';
  return '<svg class="type-icon" viewBox="0 0 16 16" aria-hidden="true">' + body + '</svg>';
}
var UNKNOWN_TYPE_TITLE = 'Тип не указан';

var MECH_CATEGORIES = [
  {code:'calc', title:'Расчёт'},
  {code:'fill', title:'Заполнение'},
  {code:'check', title:'Проверка'},
  {code:'exchange', title:'Обмен'},
  {code:'access', title:'Права доступа'}
];
var UNKNOWN_CATEGORY_TITLE = 'Без категории';

var PARTICIPANT_ROLES = [
  {code:'source', title:'Источник', direction:'source'},
  {code:'default', title:'Значение по умолчанию', direction:'source'},
  {code:'override', title:'Переопределение', direction:'source'},
  {code:'target', title:'Приёмник', direction:'target'},
  {code:'result', title:'Результат', direction:'target'},
  {code:'param', title:'Параметр', direction:'neutral'},
  {code:'condition', title:'Условие', direction:'neutral'}
];

/* Значения токенов из :root, прочитанные для холста. Заполняется readTheme() в init(). */
var THEME = null;

function readTheme(){
  var cs = getComputedStyle(document.documentElement);
  function v(name){ return cs.getPropertyValue(name).trim(); }
  function n(name){ return parseFloat(v(name)); }
  var t = {
    bg:v('--bg'), panel:v('--bg-panel'), accent:v('--accent'), text:v('--text'),
    edge:v('--graph-edge'), arrow:v('--graph-arrow'), grid:v('--graph-grid'),
    textMuted:v('--text-muted'), textFaint:v('--text-faint'),
    stubStroke:v('--graph-stub-stroke'), badgeStroke:v('--graph-badge-stroke'),
    typeUnknown:v('--type-unknown'), catUnknown:v('--cat-unknown'),
    types:{}, cats:{},
    nodeText:v('--graph-node-text'),
    alpha:{
      nodeActive:n('--alpha-node-active'), nodeNeighbor:n('--alpha-node-neighbor'),
      nodeSecond:n('--alpha-node-second'), nodeBackground:n('--alpha-node-background'),
      nodeFiltered:n('--alpha-node-filtered'), edgeFiltered:n('--alpha-edge-filtered'),
      labelSecond:n('--alpha-label-second'), labelBackground:n('--alpha-label-background'),
      labelPlate:n('--alpha-label-plate'), deprecated:n('--alpha-deprecated'),
      focusOther:n('--alpha-focus-other')
    },
    labelFont:'500 ' + v('--fs-graph-label') + ' ' + v('--sans'),
    labelSize:parseFloat(v('--fs-graph-label')),
    typeTagWeight:'500', sans:v('--sans'),
    badgeFont:'600 ' + v('--fs-graph-badge') + ' ' + v('--mono')
  };
  OBJECT_TYPES.forEach(function(x){ t.types[x.code] = v('--type-'+x.code) || t.typeUnknown; });
  MECH_CATEGORIES.forEach(function(x){ t.cats[x.code] = v('--cat-'+x.code) || t.catUnknown; });
  THEME = t;
}

/* ===================== Состояние ===================== */

var state = { objects:{}, mechanisms:{}, roles:{}, attributes:{}, controls:{}, tombstones:{} };
var STORAGE_KEY = 'objectGraphPrototypeV1';

/* Формат данных (localStorage, папка, экспорт). Разделы roles, attributes, controls и
   tombstones появились в formatVersion 2 и необязательны: файл без них читается как пустые.
   tombstones — последние известные названия удалённых сущностей, на которые остались ссылки
   (id → {kind, name}): ссылка не исчезает, а показывается как «⚠ Удалено: <название>». */
var FORMAT_VERSION = 2;
function serializeState(){
  return {formatVersion:FORMAT_VERSION, objects:state.objects, mechanisms:state.mechanisms, roles:state.roles,
    attributes:state.attributes, controls:state.controls, tombstones:state.tombstones};
}
function applyState(data){
  data = data || {};
  state.objects = data.objects || {};
  state.mechanisms = data.mechanisms || {};
  state.roles = data.roles || {};
  state.attributes = data.attributes || {};
  state.controls = data.controls || {};
  state.tombstones = data.tombstones || {};
}
function emptyState(){ applyState({}); }
/* «16 объектов, 6 механизмов, 3 роли, 12 реквизитов» — для подтверждений импорта и очистки.
   Роли и реквизиты упоминаются, только если они есть. */
function dataSummary(data){
  function n(sec){ return Object.keys((data && data[sec]) || {}).length; }
  var oc = n('objects'), mc = n('mechanisms'), rc = n('roles'), ac = n('attributes'), cc = n('controls');
  var parts = [oc + ' ' + pluralRu(oc,'объект','объекта','объектов'), mc + ' ' + pluralRu(mc,'механизм','механизма','механизмов')];
  if (rc) parts.push(rc + ' ' + pluralRu(rc,'роль','роли','ролей'));
  if (ac) parts.push(ac + ' ' + pluralRu(ac,'реквизит','реквизита','реквизитов'));
  if (cc) parts.push(cc + ' ' + pluralRu(cc,'контроль','контроля','контролей'));
  return parts.join(', ');
}
/* Запомнить название удаляемой сущности, на которую остаются ссылки. */
function rememberDeleted(kind, id, name){ state.tombstones[id] = {kind:kind, name:name}; }
function deletedName(id){ var t = state.tombstones[id]; return t ? t.name : '?'; }
function brokenRefHTML(id){ return '<span class="ref-broken" title="Удалено">⚠ Удалено: ' + escapeHtml(deletedName(id)) + '</span>'; }

var folderHandle = null;
var folderSupported = ('showDirectoryPicker' in window);
var autoSaveStatus = 'disconnected'; /* disconnected | connected | needs-permission | error */
var lastFolderSaveAt = null;

var currentMode = (function(){ try{ return localStorage.getItem('nodusMechMode') === 'full' ? 'full' : 'collapsed'; }catch(e){ return 'collapsed'; } })();
var currentView = 'graph';
var currentNodes = [];
var currentEdges = [];
var nodeById = new Map();
var labelOrder = [];

var hoverId = null;
var listHover = null; /* {kind:'object'|'mechanism', id} — строка списка слева под курсором */
var pinnedNodeId = null;
var pinnedEdgeKey = null;
var pinnedMechanismId = null;

var mouseDownPos = null;
var didDrag = false;
var dragNode = null;
var isPanning = false;
var panStart = null;

var view = { scale:1, offsetX:0, offsetY:0 };
var viewInitialized = false;
var viewportWidth = 0, viewportHeight = 0;

var PANEL_WIDTHS_KEY = 'objectGraphPanelWidths';
var panelWidths = { left:280, right:340 };

var sim = { alpha:1, alphaMin:0.012, alphaDecay:0.02 };
var renderRequested = false;

var canvasEl, ctx2d;

/* ===================== Утилиты ===================== */

function uid(prefix){
  if (window.crypto && crypto.randomUUID) return prefix + '-' + crypto.randomUUID();
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
}

function escapeHtml(str){
  return String(str === null || str === undefined ? '' : str).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function pluralRu(n, one, few, many){
  var m = Math.abs(n) % 100;
  var n1 = m % 10;
  if (m > 10 && m < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function typeInfo(code){ return OBJECT_TYPES.filter(function(x){return x.code===code;})[0] || null; }
function typeTitle(code){ var t = typeInfo(code); return t ? t.title : UNKNOWN_TYPE_TITLE; }
function typeShort(code){ var t = typeInfo(code); return t ? t.short : ''; }
function categoryInfo(code){ return MECH_CATEGORIES.filter(function(x){return x.code===code;})[0] || null; }
function categoryTitle(code){ var c = categoryInfo(code); return c ? c.title : UNKNOWN_CATEGORY_TITLE; }
function roleInfo(code){ return PARTICIPANT_ROLES.filter(function(x){return x.code===code;})[0] || {code:code, title:code, direction:'neutral'}; }
/* Коды статусов в данных прежние (stub/draft, active, deprecated) — меняются только названия. */
var STATUS_TITLES = { dev:'В разработке', prod:'В продуктиве', deprecated:'Устарел' };
/* Статус по умолчанию: его бейдж нейтральный (серый контур), остальные — цветные. */
var DEFAULT_OBJECT_STATUS = 'stub', DEFAULT_MECH_STATUS = 'draft';
var OBJECT_STATUSES = [{code:'stub', kind:'dev'}, {code:'active', kind:'prod'}, {code:'deprecated', kind:'deprecated'}];
var MECH_STATUSES = [{code:'draft', kind:'dev'}, {code:'active', kind:'prod'}, {code:'deprecated', kind:'deprecated'}];
function statusKind(code){ return code === 'deprecated' ? 'deprecated' : (code === 'active' ? 'prod' : 'dev'); }
/* «Показывать устаревшие» — одна опция для списков, «Списка» и графа; хранится в браузере. */
var SHOW_DEPRECATED_KEY = 'nodusShowDeprecated';
var showDeprecated = (function(){ try{ return localStorage.getItem(SHOW_DEPRECATED_KEY) !== '0'; }catch(e){ return true; } })();
function isShown(entity){ return showDeprecated || !entity || entity.status !== 'deprecated'; }
/* Переключатель есть в левой панели «Графа» и в фильтрах «Списка» — состояние одно на оба. */
function syncDeprecatedSwitches(){
  document.querySelectorAll('.toggle-deprecated').forEach(function(cb){ cb.checked = showDeprecated; });
}
/* «Механизмы: узлами | связями» — запоминается между перезагрузками. */
var MECH_MODE_KEY = 'nodusMechMode';
function syncMechModeUI(){
  document.querySelectorAll('.mech-mode-btn').forEach(function(b){
    b.setAttribute('aria-checked', b.getAttribute('data-mode') === currentMode ? 'true' : 'false');
  });
}
function deprecatedTagHTML(entity){ return entity && entity.status === 'deprecated' ? '<span class="deprecated-tag" title="Устарел">устарел</span>' : ''; }

function objectStatusTitle(s){ return s==='stub' ? STATUS_TITLES.dev : (s==='deprecated' ? STATUS_TITLES.deprecated : STATUS_TITLES.prod); }
function mechanismStatusTitle(s){ return s==='draft' ? STATUS_TITLES.dev : (s==='deprecated' ? STATUS_TITLES.deprecated : STATUS_TITLES.prod); }

function typeColor(code){ return THEME.types[code] || THEME.typeUnknown; }
function categoryAccent(code){ return THEME.cats[code] || THEME.catUnknown; }

function labelOfRef(refId){
  if (refId.indexOf('obj:') === 0){ var o = state.objects[refId.slice(4)]; return o ? o.name : '—'; }
  if (refId.indexOf('mech:') === 0){ var m = state.mechanisms[refId.slice(5)]; return m ? m.title : '—'; }
  return refId;
}

/* ===================== Хранение ===================== */

/* Индикатор сохранения в карточке: «Сохранение…» пока идут правки, «Сохранено» через
   SAVE_SETTLE_MS после последней записи, «Ошибка сохранения» — если не удалась запись
   в localStorage или в подключённую папку. Сама механика записи прежняя: каждая правка
   сразу пишется в localStorage и (если подключена) в папку. */
var SAVE_SETTLE_MS = 400;
var saveStatus = 'saved'; /* saved | saving | error */
var saveSettleTimer = null;
var lastLocalSaveFailed = false;

function setSaveStatus(s){
  saveStatus = s;
  document.querySelectorAll('.save-indicator').forEach(renderSaveIndicator);
}
function renderSaveIndicator(el){
  el.classList.toggle('is-error', saveStatus === 'error');
  if (saveStatus === 'error'){
    el.innerHTML = 'Ошибка сохранения <button type="button" class="save-retry">Повторить</button>';
    el.querySelector('.save-retry').addEventListener('click', retrySave);
  } else {
    el.textContent = saveStatus === 'saving' ? 'Сохранение…' : 'Сохранено';
  }
}
function retrySave(){
  if (folderHandle && autoSaveStatus === 'error') autoSaveStatus = 'connected';
  persist();
}

function persist(){
  lastLocalSaveFailed = false;
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
  }catch(e){
    lastLocalSaveFailed = true;
    console.warn('Не удалось сохранить в localStorage (нормально для предпросмотра внутри Claude — при открытии файла напрямую в браузере сохранение работает).', e);
  }
  if (saveSettleTimer) clearTimeout(saveSettleTimer);
  if (lastLocalSaveFailed){ setSaveStatus('error'); return saveToFolder(); }
  setSaveStatus('saving');
  var folderDone = saveToFolder();
  saveSettleTimer = setTimeout(function(){
    saveSettleTimer = null;
    folderDone.then(function(ok){ if (!saveSettleTimer && !lastLocalSaveFailed) setSaveStatus(ok ? 'saved' : 'error'); });
  }, SAVE_SETTLE_MS);
}
function loadPersisted(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    applyState(JSON.parse(raw));
  }catch(e){
    console.warn('Не удалось прочитать localStorage.', e);
  }
}

/* ===================== Автосохранение в папку (File System Access API) =====================
   Работает только в Chrome/Edge (не в Firefox/Safari) и требует явного выбора папки
   пользователем через системный диалог — сайт не может получить произвольный путь строкой.
   Handle папки хранится в IndexedDB, чтобы не спрашивать папку заново при каждом открытии;
   само разрешение на запись браузер иногда просит подтвердить повторно — это нормально. */

var IDB_NAME = 'objectGraphPrototypeDB';
var IDB_STORE = 'handles';

function openHandleDB(){
  return new Promise(function(resolve, reject){
    if (!window.indexedDB){ reject(new Error('indexedDB недоступен')); return; }
    var req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch(e){ reject(e); return; }
    req.onupgradeneeded = function(){ req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error); };
  });
}
function idbSet(key, value){
  return openHandleDB().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error); };
    });
  });
}
function idbGet(key){
  return openHandleDB().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(IDB_STORE, 'readonly');
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  });
}
function idbDelete(key){
  return openHandleDB().then(function(db){
    return new Promise(function(resolve, reject){
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = function(){ resolve(); };
      tx.onerror = function(){ reject(tx.error); };
    });
  });
}

function connectFolder(){
  if (!folderSupported) return;
  window.showDirectoryPicker({mode:'readwrite', id:'object-graph-storage'}).then(function(handle){
    folderHandle = handle;
    autoSaveStatus = 'connected';
    idbSet('folderHandle', handle).catch(function(){});
    saveToFolder();
    openSettingsModal();
  }).catch(function(err){
    if (err && err.name === 'AbortError') return;
    console.warn('Не удалось подключить папку', err);
  });
}
function disconnectFolder(){
  folderHandle = null;
  autoSaveStatus = 'disconnected';
  idbDelete('folderHandle').catch(function(){});
}
function reconnectFolderPermission(){
  if (!folderHandle) return;
  folderHandle.requestPermission({mode:'readwrite'}).then(function(perm){
    autoSaveStatus = (perm === 'granted') ? 'connected' : 'needs-permission';
    if (perm === 'granted') saveToFolder();
    openSettingsModal();
  }).catch(function(){});
}
function tryRestoreFolder(){
  if (!folderSupported) return;
  idbGet('folderHandle').then(function(handle){
    if (!handle) return;
    return handle.queryPermission({mode:'readwrite'}).then(function(perm){
      folderHandle = handle;
      autoSaveStatus = (perm === 'granted') ? 'connected' : 'needs-permission';
    });
  }).catch(function(){ /* сохранённой папки нет, или API недоступен в этом контексте */ });
}
/* Возвращает Promise<boolean>: false — запись в подключённую папку не удалась. */
function saveToFolder(){
  if (!folderHandle) return Promise.resolve(true);
  if (autoSaveStatus !== 'connected') return Promise.resolve(autoSaveStatus !== 'error');
  var data = JSON.stringify(serializeState(), null, 2);
  return folderHandle.getFileHandle('object-graph-data.json', {create:true}).then(function(fh){
    return fh.createWritable();
  }).then(function(writable){
    return writable.write(data).then(function(){ return writable.close(); });
  }).then(function(){
    lastFolderSaveAt = new Date();
    updateSettingsSaveStatus();
    return true;
  }).catch(function(err){
    console.warn('Не удалось сохранить в папку', err);
    autoSaveStatus = 'error';
    return false;
  });
}

/* ===================== Вложения (только в подключённой папке) =====================
   Метаданные (имя, размер) хранятся в state и попадают в localStorage/экспорт как обычно.
   Сами файлы лежат только в подключённой папке, в attachments/obj-<id>/ или attachments/mech-<id>/ —
   поэтому все действия с файлами (прикрепить/открыть/удалить с диска) требуют подключённой папки. */

function formatFileSize(bytes){
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' КБ';
  return (bytes/1024/1024).toFixed(1) + ' МБ';
}

function getAttachmentsDirForEntity(kind, id){
  if (!folderHandle || autoSaveStatus !== 'connected') return Promise.reject(new Error('Папка не подключена'));
  return folderHandle.getDirectoryHandle('attachments', {create:true}).then(function(root){
    return root.getDirectoryHandle(kind + '-' + id, {create:true});
  });
}

function attachFilesToEntity(kind, id, onDone){
  if (!folderSupported){
    alert('Вложения работают только в Chrome и Edge — эти браузеры умеют сохранять файлы в выбранную папку.');
    return;
  }
  if (!folderHandle || autoSaveStatus !== 'connected'){
    alert('Сначала подключите папку в Настройках — вложения хранятся только в ней, а не в браузере.');
    return;
  }
  window.showOpenFilePicker({multiple:true}).then(function(fileHandles){
    return getAttachmentsDirForEntity(kind, id).then(function(dir){
      return Promise.all(fileHandles.map(function(fh){
        return fh.getFile().then(function(file){
          return dir.getFileHandle(file.name, {create:true}).then(function(destHandle){
            return destHandle.createWritable().then(function(w){
              return w.write(file).then(function(){ return w.close(); });
            }).then(function(){
              return {name:file.name, size:file.size, addedAt:new Date().toISOString()};
            });
          });
        });
      }));
    });
  }).then(function(added){
    var entity = kind === 'obj' ? state.objects[id] : state.mechanisms[id];
    if (!entity) return;
    if (!entity.attachments) entity.attachments = [];
    added.forEach(function(a){
      var idx = entity.attachments.findIndex(function(x){ return x.name === a.name; });
      if (idx >= 0) entity.attachments[idx] = a; else entity.attachments.push(a);
    });
    persist();
    if (onDone) onDone();
  }).catch(function(err){
    if (err && err.name === 'AbortError') return;
    console.warn('Не удалось прикрепить файл', err);
    alert('Не удалось прикрепить файл: ' + (err && err.message ? err.message : err));
  });
}

function openAttachment(kind, id, name){
  if (!folderHandle || autoSaveStatus !== 'connected'){
    alert('Подключите папку в Настройках, чтобы открывать вложения.');
    return;
  }
  getAttachmentsDirForEntity(kind, id).then(function(dir){
    return dir.getFileHandle(name);
  }).then(function(fh){
    return fh.getFile();
  }).then(function(file){
    var url = URL.createObjectURL(file);
    window.open(url, '_blank');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }).catch(function(err){
    console.warn('Не удалось открыть вложение', err);
    alert('Не удалось открыть файл. Возможно, его переместили или удалили из папки вручную.');
  });
}

function removeAttachment(kind, id, name, afterRemove){
  var entity = kind === 'obj' ? state.objects[id] : state.mechanisms[id];
  var finish = function(){
    entity.attachments = (entity.attachments||[]).filter(function(a){ return a.name !== name; });
    persist();
    if (afterRemove) afterRemove();
  };
  if (folderHandle && autoSaveStatus === 'connected'){
    getAttachmentsDirForEntity(kind, id).then(function(dir){
      return dir.removeEntry(name).catch(function(){ /* файла на диске уже нет — не страшно */ });
    }).then(finish);
  } else {
    finish();
  }
}

function renderAttachmentsList(panel, selector, kind, id){
  var container = panel.querySelector(selector);
  if (!container) return;
  var entity = kind === 'obj' ? state.objects[id] : state.mechanisms[id];
  var list = (entity && entity.attachments) || [];
  if (!list.length){
    container.innerHTML = '<p class="ref-empty">Пока нет вложений.</p>';
    return;
  }
  container.innerHTML = list.map(function(a){
    return '<div class="attachment-row">' +
      '<span class="attachment-name" title="'+escapeHtml(a.name)+'">'+escapeHtml(a.name)+'</span>' +
      '<span class="attachment-size">'+escapeHtml(formatFileSize(a.size))+'</span>' +
      '<button class="btn btn-sm attachment-open" type="button">Открыть</button>' +
      '<button class="icon-btn attachment-remove" type="button" aria-label="Удалить вложение">×</button>' +
    '</div>';
  }).join('');
  var rows = container.querySelectorAll('.attachment-row');
  rows.forEach(function(row, idx){
    var name = list[idx].name;
    row.querySelector('.attachment-open').addEventListener('click', function(){ openAttachment(kind, id, name); });
    row.querySelector('.attachment-remove').addEventListener('click', function(){
      removeAttachment(kind, id, name, function(){ renderAttachmentsList(panel, selector, kind, id); });
    });
  });
}

/* ===================== CRUD ===================== */

function createObject(partial){
  var id = uid('obj');
  var obj = {
    id:id,
    type: (partial && partial.type) || DEFAULT_OBJECT_TYPE,
    name: (partial && partial.name) || 'Новый объект',
    fullName:'', subsystem:'', tags:[], description:'', status:DEFAULT_OBJECT_STATUS,
    attachments:[], fx:null, fy:null
  };
  state.objects[id] = obj;
  persist(); syncGraphModel(); renderSidebar(); updateStats();
  return obj;
}

function createMechanism(partial){
  var id = uid('mech');
  var m = {
    id:id,
    title:(partial && partial.title) || 'Новый механизм',
    category:(partial && partial.category) || MECH_CATEGORIES[0].code,
    summary:'', body:'', status:DEFAULT_MECH_STATUS, participants:[],
    attachments:[], fx:null, fy:null
  };
  state.mechanisms[id] = m;
  persist(); syncGraphModel(); renderSidebar(); updateStats();
  return m;
}

function deleteObject(id, onCancel){
  var refs = Object.keys(state.mechanisms).map(function(k){return state.mechanisms[k];})
    .filter(function(m){ return m.participants.some(function(p){return p.objectId===id;}); });
  var attrs = objectAttributes(id);
  var ctrls = controlsByTool(id);
  var proceed = function(){
    if (ctrls.length) rememberDeleted('obj', id, state.objects[id].name);
    refs.forEach(function(m){ m.participants = m.participants.filter(function(p){return p.objectId!==id;}); });
    attrs.forEach(function(a){ delete state.attributes[a.id]; });
    delete state.objects[id];
    persist(); syncGraphModel(); renderSidebar(); updateStats(); clearSelection();
    closeModal();
  };
  if (refs.length === 0 && attrs.length === 0 && ctrls.length === 0){ proceed(); return; }
  openModal({
    title:'Удалить объект?',
    bodyHTML:(refs.length ? '<p>Объект участвует в ' + refs.length + ' ' + pluralRu(refs.length,'механизме','механизмах','механизмах') + ': ' +
      escapeHtml(refs.map(function(m){return m.title;}).join(', ')) + '. Он будет убран из ' + pluralRu(refs.length,'него','них','них') + '.</p>' : '') +
      (attrs.length ? '<p>У объекта ' + attrs.length + ' ' + pluralRu(attrs.length,'реквизит','реквизита','реквизитов') + ' — ' +
        pluralRu(attrs.length,'он будет удалён','они будут удалены','они будут удалены') + ' вместе с объектом.</p>' : '') +
      controlRefsWarningHTML(ctrls, 'Объект — инструмент'),
    footerButtons:[
      {label:'Отмена', onClick:function(){ if (onCancel) setTimeout(onCancel, 0); return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){ proceed(); }}
    ]
  });
}

function deleteMechanism(id, onCancel){
  var ctrls = controlsReplacedBy(id);
  openModal({
    title:'Удалить механизм?',
    bodyHTML:'<p>Механизм «' + escapeHtml(state.mechanisms[id] ? state.mechanisms[id].title : '') + '» и описание его связей будут удалены без возможности восстановления.</p>' +
      controlRefsWarningHTML(ctrls, 'Механизм указан как замена'),
    footerButtons:[
      {label:'Отмена', onClick:function(){ if (onCancel) setTimeout(onCancel, 0); return true; }},
      {label:'Удалить', variant:'danger', onClick:function(){
        if (ctrls.length) rememberDeleted('mech', id, state.mechanisms[id].title);
        delete state.mechanisms[id];
        persist(); syncGraphModel(); renderSidebar(); updateStats(); clearSelection();
        closeModal();
      }}
    ]
  });
}

