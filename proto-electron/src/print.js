'use strict';
// Impressão e PDF da aba ativa. Sem Electron aqui: o main injeta a aba ativa, a pasta e o aviso.
// savePdf(values): grava um PDF na pasta de downloads (nome seguro, sem sobrescrever). printSystem(values): diálogo de impressão do
// sistema (precisa de impressora/CUPS). `values` vêm da tela de parâmetros (não confiáveis): cleanPrintOptions valida tudo.
const fs = require('node:fs');
const { safeName, uniquePath } = require('./downloads');

const PAGE_SIZES = ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid'];
const MARGINS = ['default', 'none', 'minimum'];
const MAX_NAME = 80;
const CANCELLED = ['cancelled', 'Print job canceled'];
const PAGES_PATTERN = /^[0-9]+(-[0-9]+)?(,\s*[0-9]+(-[0-9]+)?)*$/; // "1-3, 5, 8-10"

// Nome do arquivo: título da página, senão o host, senão "pagina". Só o último trecho, sem caracteres de controle.
function pdfName(title, url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* sem host */ }
  const stem = safeName(title?.trim() || host || 'pagina').replace(/[/\\:*?"<>|]/g, '_').slice(0, MAX_NAME).trim();
  return `${stem || 'pagina'}.pdf`;
}

// Junta os padrões do .lua com o que a tela mandou; o que vier inválido volta ao padrão.
function cleanPrintOptions(values, defaults) {
  const v = values !== null && typeof values === 'object' ? values : {};
  const scale = Number.isInteger(v.scale) && v.scale >= 10 && v.scale <= 200 ? v.scale : defaults.scale;
  const pages = typeof v.pages === 'string' ? v.pages.trim() : '';
  return {
    page_size: PAGE_SIZES.includes(v.page_size) ? v.page_size : defaults.page_size,
    landscape: typeof v.landscape === 'boolean' ? v.landscape : defaults.landscape,
    background: typeof v.background === 'boolean' ? v.background : defaults.background,
    scale,
    margins: MARGINS.includes(v.margins) ? v.margins : defaults.margins,
    pages: PAGES_PATTERN.test(pages) && pages.length <= 60 ? pages : '',
  };
}

function createPrint({ activeContents, getDir, notify, settings, writeFile = fs.promises.writeFile, mkdir = fs.promises.mkdir }) {
  function savePdf(values) {
    return writePdf(cleanPrintOptions(values, settings));
  }

  async function writePdf(o) {
    const wc = activeContents();
    if (!wc) return null;
    try {
      const pdfOptions = { pageSize: o.page_size, landscape: o.landscape, printBackground: o.background, scale: o.scale / 100, margins: { marginType: o.margins } };
      if (o.pages) pdfOptions.pageRanges = o.pages.split(/\s*,\s*/).join(',');
      const data = await wc.printToPDF(pdfOptions);
      const dir = getDir();
      await mkdir(dir, { recursive: true });
      const target = uniquePath(dir, pdfName(wc.getTitle(), wc.getURL()));
      await writeFile(target, data);
      notify('PDF salvo', target.split('/').pop());
      return target;
    } catch (error) {
      notify('PDF falhou', error.message);
      return null;
    }
  }

  // Diálogo do SISTEMA (como o Ctrl+Shift+P do Chrome). Sem CUPS o motor recusa antes de abrir: vira um aviso claro.
  function printSystem(values) {
    const wc = activeContents();
    if (!wc) return;
    const o = cleanPrintOptions(values, settings);
    wc.print({ silent: false, printBackground: o.background, landscape: o.landscape, pageSize: o.page_size }, (ok, reason) => {
      if (ok || !reason || CANCELLED.includes(reason)) return;
      notify('Impressão falhou', /enumerate printers/i.test(reason) ? 'nenhuma impressora disponível (o sistema não tem CUPS); use "Salvar como PDF"' : reason);
    });
  }

  return { printSystem, savePdf };
}

module.exports = { createPrint, cleanPrintOptions, pdfName, PAGE_SIZES, MARGINS };
