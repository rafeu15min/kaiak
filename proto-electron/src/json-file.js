'use strict';
// JSON em disco para dados do navegador (Speed Dial, sessão): leitura que nunca lança e gravação ATÔMICA (arquivo
// temporário + rename: um corte no meio não deixa o arquivo pela metade).
const fs = require('node:fs');
const path = require('node:path');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback; // sem arquivo ou ilegível: o chamador segue com o padrão
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

module.exports = { readJson, writeJsonAtomic };
