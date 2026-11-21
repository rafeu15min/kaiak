'use strict';
const { BLANK } = require('./url');
const { whenPainted } = require('./page-ready');

class Tab {
  constructor(id, url, isPrivate = false) {
    this.id = id;
    this.private = isPrivate; // sessão em memória, apagada quando a última aba privada fecha
    this.url = url;
    this.title = '';
    this.icon = '';
    this.view = null; // null = descartada (sem processo de renderização)
    this.lastActive = Date.now();
  }
}

// Gerencia abas e a política de descarte. Fala com a janela só pelo `host`:
//   host.createView() -> WebContentsView | host.show(view) | host.hide(view) | host.changed() | host.toUrl(texto)
class TabManager {
  constructor(host) {
    this.host = host;
    this.tabs = [];
    this.activeId = null;
    this.nextId = 1;
  }

  get active() {
    return this.tabs.find((t) => t.id === this.activeId) || null;
  }

  open(url = this.host.newTabUrl ?? BLANK, background = false, isPrivate = false) {
    const tab = new Tab(this.nextId++, url, isPrivate);
    this.tabs.push(tab);
    this.ensureView(tab);
    if (!background) this.select(tab.id);
    this.host.changed();
    return tab;
  }

  // Estado para guardar em disco: só abas NÃO privadas (a privativa nunca é gravada). `active` = índice na lista guardada.
  sessionState() {
    const saved = this.tabs.filter((tab) => !tab.private);
    const index = saved.findIndex((tab) => tab.id === this.activeId);
    return { tabs: saved.map((tab) => ({ url: tab.url, title: tab.title, icon: tab.icon })), active: Math.max(0, index) };
  }

  // Recria abas guardadas SEM views (descartadas: nenhum processo, nenhuma rede); só a ativa carrega, ao ser selecionada.
  // Devolve a aba ativa (ou null se a lista veio vazia).
  restore({ tabs, active }) {
    if (tabs.length === 0) return null;
    tabs.forEach(({ url, title, icon }) => {
      const tab = new Tab(this.nextId++, url);
      tab.title = title;
      tab.icon = icon;
      this.tabs.push(tab);
    });
    const target = this.tabs[this.tabs.length - tabs.length + Math.min(active, tabs.length - 1)];
    this.select(target.id);
    return target;
  }

  select(id) {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const previous = this.active;
    if (previous && previous !== tab) this.leave(previous);
    this.activeId = id;
    tab.lastActive = Date.now();
    this.ensureView(tab);
    this.host.show(tab.view);
    tab.view.webContents.focus();
    this.host.changed();
  }

  close(id) {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const [tab] = this.tabs.splice(index, 1);
    this.destroyView(tab);
    if (tab.private && !this.tabs.some((t) => t.private)) this.host.privateEnded?.();
    if (this.tabs.length === 0) {
      this.open();
      return;
    }
    if (this.activeId === id) this.select(this.tabs[Math.min(index, this.tabs.length - 1)].id);
    else this.host.changed();
  }

  cycle(delta) {
    if (this.tabs.length < 2) return;
    const index = this.tabs.findIndex((t) => t.id === this.activeId);
    const next = (index + delta + this.tabs.length) % this.tabs.length;
    this.select(this.tabs[next].id);
  }

  go(text) {
    const tab = this.active;
    if (!tab || !text.trim()) return;
    tab.url = this.host.toUrl(text);
    this.ensureView(tab).webContents.loadURL(tab.url);
  }

  back() { this.history('goBack'); }
  forward() { this.history('goForward'); }

  // Recarrega as abas vivas cuja URL satisfaz o teste (ex.: a página inicial, que é gerada com o tema ativo). Devolve uma promessa
  // que resolve quando TODAS terminaram de carregar (ou falharam, ou passou `timeoutMs`): quem troca o tema espera por ela para
  // que a interface e as páginas mudem juntas, no fim do refresh.
  reloadMatching(test, timeoutMs = 2000) {
    const loads = this.tabs.filter((tab) => tab.view && test(tab.url)).map((tab) => {
      const painted = whenPainted(tab.view.webContents, timeoutMs); // escuta ANTES de recarregar
      tab.view.webContents.reload();
      return painted;
    });
    return Promise.all(loads).then(() => undefined);
  }

  reload() {
    if (this.active?.view) this.active.view.webContents.reload();
  }

  // Descarta abas inativas há mais de `ms` ms: fecha o processo de renderização e guarda a URL.
  discardStale(ms) {
    if (ms <= 0) return;
    const now = Date.now();
    const stale = this.tabs.filter((t) => t.view && t.id !== this.activeId && now - t.lastActive > ms);
    stale.forEach((t) => this.destroyView(t));
    if (stale.length) this.host.changed();
  }

  snapshot() {
    const nav = this.active?.view?.webContents.navigationHistory;
    return {
      activeId: this.activeId,
      activePrivate: !!this.active?.private,
      url: this.active && this.active.url !== BLANK ? this.active.url : '',
      canBack: !!nav?.canGoBack(),
      canForward: !!nav?.canGoForward(),
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.title || (t.url === BLANK ? 'Nova aba' : t.url),
        icon: t.icon,
        discarded: t.view === null,
        private: t.private,
      })),
    };
  }

  history(method) {
    const nav = this.active?.view?.webContents.navigationHistory;
    if (nav) nav[method]();
  }

  ensureView(tab) {
    if (tab.view) return tab.view;
    tab.view = this.host.createView(tab.private);
    this.bind(tab);
    tab.view.webContents.loadURL(tab.url);
    return tab.view;
  }

  // Aba que sai de foco: tira a view da janela mas mantém o processo vivo até o descarte.
  leave(tab) {
    tab.lastActive = Date.now();
    if (tab.view) this.host.hide(tab.view);
  }

  destroyView(tab) {
    if (!tab.view) return;
    const view = tab.view;
    tab.view = null;
    this.host.hide(view);
    view.webContents.close();
  }

  bind(tab) {
    const wc = tab.view.webContents;
    const touch = (fn) => (...args) => { fn(...args); this.host.changed(); };
    wc.on('page-title-updated', touch((_e, title) => { tab.title = title; }));
    wc.on('page-favicon-updated', touch((_e, icons) => { tab.icon = icons[0] || ''; }));
    // páginas internas (file:, ex.: a de bloqueio) não substituem o endereço que o usuário pediu
    wc.on('did-navigate', touch((_e, url) => { if (!url.startsWith('file:')) tab.url = url; }));
    wc.on('did-fail-load', touch((_e, _code, _desc, url, isMain) => { if (isMain && !url.startsWith('file:')) tab.url = url; }));
    wc.on('did-navigate-in-page', touch((_e, url, isMain) => { if (isMain) tab.url = url; }));
    wc.setWindowOpenHandler(({ url }) => {
      if (this.host.allowUrl?.(url) ?? true) this.open(url, false, tab.private); // a privacidade é herdada
      return { action: 'deny' };
    });
  }
}

module.exports = { TabManager };
