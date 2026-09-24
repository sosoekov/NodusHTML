#!/usr/bin/env node
/* Сборка Nodus в один HTML-файл — без зависимостей, нужен только Node.js.

   Исходники: src/index.html + src/css/*.css + src/js/*.js. Для работы и отладки
   src/index.html открывается двойным кликом как есть (обычные <script src>, не модули —
   модули браузер не загружает с file://).

   Сборка: подряд идущие <link rel="stylesheet" href="css/…"> заменяются одним <style>,
   подряд идущие <script src="js/…"></script> — одним <script>. Внешние ссылки (шрифты)
   не трогаются. Каждый JS-файл начинается с 'use strict' (чтобы и без сборки код работал
   в строгом режиме); в сборке директива остаётся одна — в начале <script>.

   node build.js          — собрать dist/nodus.html
   node build.js --check  — проверить, что dist/nodus.html соответствует исходникам */
'use strict';

var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, 'src');
var OUT = path.join(__dirname, 'dist', 'nodus.html');
var USE_STRICT = "'use strict';\n\n";

var CSS_RE = /^<link rel="stylesheet" href="(css\/[^"]+\.css)">$/;
var JS_RE = /^<script src="(js\/[^"]+\.js)"><\/script>$/;

function read(rel){ return fs.readFileSync(path.join(SRC, rel), 'utf8'); }

function inlineJS(rel){
  var code = read(rel);
  if (code.indexOf(USE_STRICT) !== 0) throw new Error(rel + ": файл должен начинаться с 'use strict'; и пустой строки");
  return code.slice(USE_STRICT.length);
}

function build(){
  var lines = read('index.html').split('\n');
  var out = [], i = 0;
  while (i < lines.length){
    var m;
    if ((m = CSS_RE.exec(lines[i]))){
      var css = '';
      while (i < lines.length && (m = CSS_RE.exec(lines[i]))){ css += read(m[1]); i++; }
      out.push('<style>\n' + css + '</style>');
    } else if ((m = JS_RE.exec(lines[i]))){
      var js = USE_STRICT;
      while (i < lines.length && (m = JS_RE.exec(lines[i]))){ js += inlineJS(m[1]); i++; }
      out.push('<script>\n' + js + '</script>');
    } else {
      out.push(lines[i]); i++;
    }
  }
  return out.join('\n');
}

var html = build();
if (process.argv.indexOf('--check') >= 0){
  var current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  if (current !== html){ console.error('dist/nodus.html устарел — выполните: node build.js'); process.exit(1); }
  console.log('dist/nodus.html соответствует исходникам');
} else {
  fs.mkdirSync(path.dirname(OUT), {recursive:true});
  fs.writeFileSync(OUT, html);
  console.log('Собрано: dist/nodus.html (' + Math.round(Buffer.byteLength(html) / 1024) + ' КБ)');
}
