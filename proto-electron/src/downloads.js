'use strict';
// Downloads sem diálogo: o arquivo vai direto para a pasta configurada (ou a de Downloads do sistema),
// com nome seguro e sem sobrescrever nada ("arquivo (1).ext"). `notify` mostra o aviso passageiro.
const fs = require('node:fs');
const path = require('node:path');

// Só o último trecho do caminho, sem barras, caracteres de controle nem pontos iniciais; nunca vazio.
function safeName(name) {
  const base = path.basename(String(name).replace(/\\/g, '/')).replace(/[\x00-\x1f]/g, '').trim();
  return base.replace(/^\.+/, '') || 'download';
}

function uniquePath(dir, name, exists = fs.existsSync) {
  const safe = safeName(name);
  const ext = path.extname(safe);
  const stem = safe.slice(0, safe.length - ext.length);
  let candidate = path.join(dir, safe);
  for (let n = 1; exists(candidate); n++) candidate = path.join(dir, `${stem} (${n})${ext}`);
  return candidate;
}

// "~/x" vira o home; vazio vale a pasta de Downloads do sistema.
function resolveDir(configDir, home, systemDir) {
  const dir = String(configDir).trim().replace(/^~(?=$|\/)/, home);
  return dir || systemDir;
}

function attachDownloads(ses, { getDir, notify }) {
  ses.on('will-download', (_event, item) => {
    const dir = getDir();
    fs.mkdirSync(dir, { recursive: true });
    const target = uniquePath(dir, item.getFilename());
    item.setSavePath(target); // com o caminho definido, o Electron não abre o diálogo
    const name = path.basename(target);
    notify('Baixando', name);
    item.once('done', (_e, state) => notify(state === 'completed' ? 'Download concluído' : 'Download falhou', name));
  });
}

module.exports = { safeName, uniquePath, resolveDir, attachDownloads };
