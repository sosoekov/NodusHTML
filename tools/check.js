#!/usr/bin/env node
/* Статическая проверка перед сдачей: node tools/check.js
   1. Синтаксис каждого src/js/*.js (как node --check).
   2. Сверка id: каждый id из getElementById('…') / querySelector('#…') в JS объявлен
      в разметке (src/index.html) или в HTML-шаблоне внутри JS (id="…"), и наоборот —
      каждый id разметки где-то используется (в JS, в CSS или как for/aria-controls).
   3. dist/nodus.html соответствует исходникам (node build.js --check). */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var problems = 0;
function fail(msg){ problems++; console.error('✗ ' + msg); }

var jsFiles = fs.readdirSync(path.join(SRC, 'js')).filter(function(f){ return /\.js$/.test(f); });
var js = '';
jsFiles.forEach(function(f){
  var code = fs.readFileSync(path.join(SRC, 'js', f), 'utf8');
  try { new vm.Script(code, {filename:f}); } catch (e){ fail('синтаксис ' + f + ': ' + e.message); }
  js += code + '\n';
});
var css = fs.readdirSync(path.join(SRC, 'css')).map(function(f){ return fs.readFileSync(path.join(SRC, 'css', f), 'utf8'); }).join('\n');
var html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

function collect(re, text){ var s = new Set(), m; while ((m = re.exec(text))) s.add(m[1]); return s; }
var declared = collect(/\bid="([A-Za-z][\w-]*)"/g, html);
var declaredInJs = collect(/\bid="([A-Za-z][\w-]*)"/g, js);
var used = collect(/getElementById\('([\w-]+)'\)/g, js);
collect(/querySelector(?:All)?\('#([\w-]+)/g, js).forEach(function(id){ used.add(id); });
collect(/closest\('#([\w-]+)/g, js).forEach(function(id){ used.add(id); });
/* id, переданный строкой в функцию (setupResizeHandle('resize-left', …)), тоже считается использованием. */
var literals = collect(/'([A-Za-z][\w-]*)'/g, js);

used.forEach(function(id){
  if (!declared.has(id) && !declaredInJs.has(id)) fail('id «' + id + '» используется в JS, но нигде не объявлен');
});
var refsInHtml = collect(/(?:for|aria-controls)="([\w-]+)"/g, html);
declared.forEach(function(id){
  var inCss = new RegExp('#' + id + '(?![\\w-])').test(css);
  /* Неиспользуемый id — не ошибка (обёртки-ориентиры), только предупреждение. */
  if (!used.has(id) && !literals.has(id) && !inCss && !refsInHtml.has(id)) console.warn('! id «' + id + '» объявлен в разметке, но не используется');
});

try { cp.execFileSync(process.execPath, [path.join(ROOT, 'build.js'), '--check'], {stdio:'pipe'}); }
catch (e){ fail(String(e.stderr || e.message).trim()); }

if (problems){ console.error(problems + ' проблем(ы)'); process.exit(1); }
console.log('OK: ' + jsFiles.length + ' JS-файлов, ' + declared.size + ' id в разметке, ' + used.size + ' id из JS; dist актуален');
