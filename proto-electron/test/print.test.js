'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrint, cleanPrintOptions, pdfName } = require('../src/print');
const { createPrintDialog } = require('../src/print-dialog');
const { resolve, DEFAULTS } = require('../src/config');
const { createLuaHost } = require('../src/lua-host');
const { createActions } = require('../src/actions');

const SETTINGS = { page_size: 'A4', landscape: false, background: true, scale: 100, margins: 'default' };
const page = (over = {}) => ({
  title: 'Minha página', url: 'https://exemplo.org/a',
  getTitle() { return this.title; }, getURL() { return this.url; },
  printed: [], pdfOptions: [],
  print(options, done) { this.printed.push(options); done?.(this.result ?? true, this.reason); },
  async printToPDF(options) { this.pdfOptions.push(options); if (this.fail) throw new Error('sem memória'); return Buffer.from('%PDF'); },
  ...over,
});
const make = (wc, settings = SETTINGS) => {
  const said = []; const files = {}; const dirs = [];
  const printer = createPrint({
    activeContents: () => wc, getDir: () => '/tmp/pdfs', notify: (t, x) => said.push([t, x]), settings,
    writeFile: async (file, data) => { files[file] = data; }, mkdir: async (dir) => dirs.push(dir),
  });
  return { printer, said, files, dirs };
};

test('pdfName: título, senão host, senão "pagina"; sem barras nem caracteres perigosos, até 80 letras', () => {
  assert.equal(pdfName('Minha página', 'https://a.test/'), 'Minha página.pdf');
  assert.equal(pdfName('', 'https://a.test/x'), 'a.test.pdf');
  assert.equal(pdfName(undefined, 'lixo'), 'pagina.pdf');
  assert.equal(pdfName('x'.repeat(300), 'https://a.test').length, 84);
  assert.equal(pdfName('../../etc/passwd', 'https://a.test'), 'passwd.pdf');
});

test('cleanPrintOptions: valores da tela são validados; o inválido volta ao padrão do .lua', () => {
  assert.deepEqual(cleanPrintOptions(undefined, SETTINGS), { ...SETTINGS, pages: '' });
  assert.deepEqual(cleanPrintOptions({ page_size: 'Letter', landscape: true, background: false, scale: 150, margins: 'none', pages: '1-3, 5' }, SETTINGS),
    { page_size: 'Letter', landscape: true, background: false, scale: 150, margins: 'none', pages: '1-3, 5' });
  const bad = cleanPrintOptions({ page_size: 'A0', landscape: 'sim', background: 1, scale: 9000, margins: 'x', pages: '1; rm -rf' }, SETTINGS);
  assert.deepEqual(bad, { ...SETTINGS, pages: '' });
  assert.equal(cleanPrintOptions({ scale: 10.5 }, SETTINGS).scale, 100, 'só inteiro');
  assert.equal(cleanPrintOptions({ pages: 'a' }, SETTINGS).pages, '');
  assert.equal(cleanPrintOptions({ pages: '5'.repeat(61) }, SETTINGS).pages, '');
});

test('save_pdf: padrões do .lua sem tela; com valores da tela, escala/margens/páginas chegam ao motor; aviso com o nome', async () => {
  const wc = page();
  const { printer, said, files, dirs } = make(wc, { ...SETTINGS, page_size: 'Letter', landscape: true, background: false });
  const target = await printer.savePdf();
  assert.deepEqual(wc.pdfOptions[0], { pageSize: 'Letter', landscape: true, printBackground: false, scale: 1, margins: { marginType: 'default' } });
  assert.deepEqual(dirs, ['/tmp/pdfs']);
  assert.equal(target, '/tmp/pdfs/Minha página.pdf');
  assert.equal(files[target].toString(), '%PDF');
  assert.deepEqual(said, [['PDF salvo', 'Minha página.pdf']]);
  await printer.savePdf({ scale: 80, margins: 'none', pages: '1-3,  5' });
  assert.deepEqual(wc.pdfOptions[1], { pageSize: 'Letter', landscape: true, printBackground: false, scale: 0.8, margins: { marginType: 'none' }, pageRanges: '1-3,5' });
});

test('save_pdf: erro do motor vira aviso (não lança); sem aba ativa não faz nada', async () => {
  const bad = make(page({ fail: true }));
  assert.equal(await bad.printer.savePdf(), null);
  assert.deepEqual(bad.said, [['PDF falhou', 'sem memória']]);
  const none = make(undefined);
  assert.equal(await none.printer.savePdf(), null);
  none.printer.printSystem();
  assert.deepEqual(none.said, []);
});

test('print_system: diálogo do sistema não silencioso com as opções; cancelar não avisa; sem CUPS avisa claro', () => {
  const wc = page();
  make(wc).printer.printSystem({ landscape: true, page_size: 'A5' });
  assert.deepEqual(wc.printed, [{ silent: false, printBackground: true, landscape: true, pageSize: 'A5' }]);
  const cancelled = make(page({ result: false, reason: 'cancelled' }));
  cancelled.printer.printSystem();
  assert.deepEqual(cancelled.said, []);
  const failed = make(page({ result: false, reason: 'sem impressora' }));
  failed.printer.printSystem();
  assert.deepEqual(failed.said, [['Impressão falhou', 'sem impressora']]);
  const noCups = make(page({ result: false, reason: 'Failed to enumerate printers' }));
  noCups.printer.printSystem();
  assert.match(noCups.said[0][1], /não tem CUPS.*Salvar como PDF/);
});

const dialog = (over = {}) => {
  const log = []; let active = { id: 'a', isDestroyed: () => false, focus: () => log.push('page-focus') };
  const sent = [];
  const view = { setBounds: (b) => log.push(['bounds', b]), webContents: { send: (...a) => sent.push(a), focus: () => log.push('focus'), close: () => log.push('destroy') } };
  const win = { contentView: { addChildView: () => log.push('add'), removeChildView: () => log.push('remove') } };
  const d = createPrintDialog({
    win, createView: (onLoaded) => { setTimeout(onLoaded, 0); return view; }, pageBounds: () => ({ x: 50, y: 50, width: 1000, height: 600 }),
    activeContents: () => active, canPrintSystem: async () => over.system ?? false,
    settings: { place: 'center', width: 440, height: 400, html: '<x>', css: 'c', values: { scale: 100 } },
  });
  return { d, log, sent, view, setActive: (a) => { active = a; } };
};

test('tela de impressão: abre centralizada, manda o modelo e se há impressora; abrir de novo só foca; fechar destrói', async () => {
  const { d, log, sent, view } = dialog({ system: true });
  d.open();
  assert.deepEqual(log.slice(0, 2), ['add', ['bounds', { x: 330, y: 150, width: 440, height: 400 }]]);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(sent, [['print:template', { html: '<x>', css: 'c', values: { scale: 100 }, system: true }]]);
  assert.ok(d.owns(view.webContents) && !d.owns({}));
  log.length = 0; d.open(); assert.deepEqual(log, ['focus']);
  d.close();
  assert.deepEqual(log.slice(-3), ['remove', 'destroy', 'page-focus']);
  assert.equal(d.owns(view.webContents), false);
  d.close(); // de novo: nada
});

test('tela de impressão: sem impressora o botão do sistema fica desligado; trocar de aba fecha; sem aba não abre', async () => {
  const { d, sent, setActive, log } = dialog();
  d.open(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent[0][1].system, false);
  d.tabChanged(); assert.ok(!log.includes('destroy'), 'mesma aba: continua');
  setActive({ id: 'b', isDestroyed: () => false });
  d.tabChanged(); assert.ok(log.includes('destroy'));
  const none = dialog(); none.setActive(null); none.d.open(); assert.ok(!none.log.includes('add'));
});

test('config: padrões, validação de todas as chaves, html exige data-print="save", chaves com sugestão, teclas do Chromium', () => {
  const lua = (src) => { const h = createLuaHost({}); h.run(src, 'kaiak.lua'); const r = resolve(h.data); h.close(); return r; };
  assert.deepEqual(resolve().config.print, DEFAULTS.print);
  assert.deepEqual(lua('k.print { page_size = "Letter", landscape = true, background = false, scale = 80, margins = "none", place = "bottom", width = 500, height = 300, css = ".a{}" }').warnings, []);
  const bad = lua('k.print { page_size = "A0", margins = "x", scale = 5, place = "meio", width = 10, height = 9999, css = "</style>", html = "<b>oi</b>", landscape = "sim" }');
  const text = bad.warnings.join('\n');
  for (const p of [/print\.page_size/, /print\.margins/, /print\.scale/, /print\.place/, /print\.width/, /print\.height/, /print\.css/, /print\.html.*data-print="save"/, /print\.landscape/]) assert.match(text, p);
  assert.deepEqual(bad.config.print.page_size, 'A4');
  assert.equal(lua('k.print { html = [[<button data-print="save">x</button>]] }').warnings.length, 0);
  assert.match(lua('k.print { page_sise = "A4" }').warnings[0], /quis dizer "page_size"/);
  assert.equal(DEFAULTS.keys['ctrl+p'], 'print');
  assert.equal(DEFAULTS.keys['ctrl+shift+p'], 'print_system');
  assert.ok(!Object.values(DEFAULTS.keys).includes('save_pdf'), 'save_pdf não tem tecla padrão');
});

test('ações: print abre a tela, print_system e save_pdf vão ao impressor', () => {
  const calls = [];
  const a = createActions({ tabs: {}, focusAddress() {}, printDialog: { open: () => calls.push('tela') }, printer: { printSystem: () => calls.push('sistema'), savePdf: () => calls.push('pdf') } });
  a.print(); a.print_system(); a.save_pdf();
  assert.deepEqual(calls, ['tela', 'sistema', 'pdf']);
});
