#!/usr/bin/env python3
"""KaiaK — protótipo A: shell mínimo sobre Qt WebEngine (PySide6)."""
import argparse
import os
import sys
import time
from urllib.parse import quote_plus

from PySide6.QtCore import QSize, Qt, QTimer, QUrl
from PySide6.QtGui import QAction, QColor, QFont, QIcon, QKeySequence, QPainter, QPixmap
from PySide6.QtWebEngineCore import (QWebEnginePage, QWebEngineProfileBuilder, QWebEngineScript,
                                     QWebEngineSettings)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (QApplication, QHBoxLayout, QLineEdit, QListView, QListWidget,
                               QListWidgetItem, QStackedWidget, QToolButton, QVBoxLayout, QWidget)

TAB_BAR_WIDTH = 42
ICON_SIZE = 24
BLANK = "about:blank"
SEARCH_URL = "https://duckduckgo.com/?q="
Lifecycle = QWebEnginePage.LifecycleState

# Rolagem estilo vim, injetada num mundo isolado. Ignora campos editáveis,
# teclas com modificador e eventos que a própria página já tratou.
VIM_SCROLL_JS = r"""
(() => {
  const editable = (el) => !!el && (el.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const half = () => window.innerHeight / 2;
  const actions = {
    j: () => window.scrollBy(0, 60),
    k: () => window.scrollBy(0, -60),
    d: () => window.scrollBy(0, half()),
    u: () => window.scrollBy(0, -half()),
    g: () => window.scrollTo(0, 0),
    G: () => window.scrollTo(0, document.documentElement.scrollHeight),
  };
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    if (editable(e.composedPath()[0]) || editable(document.activeElement)) return;
    const act = actions[e.key];
    if (!act) return;
    act();
    e.preventDefault();
  });
})();
"""


def log(msg):
    print(f"[kaiak-qt] {msg}", file=sys.stderr, flush=True)


def to_url(text):
    """Texto da barra -> URL. Com esquema: navega; 'dominio.tld': https; resto: busca DDG."""
    text = text.strip()
    if "://" in text or text.startswith(("about:", "file:", "data:")):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return SEARCH_URL + quote_plus(text)


def letter_icon(text):
    """Ícone de reserva quando a página não tem favicon: a inicial num quadrado."""
    pix = QPixmap(ICON_SIZE, ICON_SIZE)
    pix.fill(Qt.transparent)
    painter = QPainter(pix)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.setPen(Qt.NoPen)
    painter.setBrush(QColor("#555555"))
    painter.drawRoundedRect(pix.rect(), 5, 5)
    font = QFont()
    font.setBold(True)
    painter.setFont(font)
    painter.setPen(QColor("white"))
    painter.drawText(pix.rect(), Qt.AlignCenter, (text.strip() or "?")[0].upper())
    painter.end()
    return QIcon(pix)


class DiscardPolicy:
    """Decide QUANDO descartar: chama on_discard(chave) após `after` s em segundo plano."""

    def __init__(self, after, on_discard, parent):
        self.after = after
        self.on_discard = on_discard
        self.hidden_since = {}
        self.timer = QTimer(parent)
        self.timer.timeout.connect(self._tick)
        if after > 0:
            self.timer.start(int(max(1, min(5, after / 2)) * 1000))

    def background(self, key):
        if self.after > 0:
            self.hidden_since[key] = time.monotonic()

    def forget(self, key):
        self.hidden_since.pop(key, None)

    def _tick(self):
        now = time.monotonic()
        expired = [k for k, t in self.hidden_since.items() if now - t >= self.after]
        for key in expired:
            del self.hidden_since[key]
            self.on_discard(key)


class TabStrip(QListWidget):
    """Coluna vertical estreita: um ícone por aba, título no tooltip."""

    def __init__(self):
        super().__init__()
        self.setFixedWidth(TAB_BAR_WIDTH)
        self.setViewMode(QListView.IconMode)
        self.setFlow(QListView.TopToBottom)
        self.setWrapping(False)
        self.setMovement(QListView.Static)
        self.setIconSize(QSize(ICON_SIZE, ICON_SIZE))
        self.setGridSize(QSize(TAB_BAR_WIDTH - 4, ICON_SIZE + 12))
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setFocusPolicy(Qt.NoFocus)

    def insert_tab(self, row):
        item = QListWidgetItem(letter_icon("?"), "")
        self.insertItem(row, item)
        return item


class AddressBar(QWidget):
    """Voltar/avançar/recarregar + campo de endereço; Enter chama on_submit(url)."""

    def __init__(self, on_submit):
        super().__init__()
        self.back = QToolButton(text="←", autoRaise=True)
        self.forward = QToolButton(text="→", autoRaise=True)
        self.reload = QToolButton(text="⟳", autoRaise=True)
        self.edit = QLineEdit(placeholderText="Endereço ou busca")
        self.edit.returnPressed.connect(lambda: on_submit(to_url(self.edit.text())))
        layout = QHBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        for widget in (self.back, self.forward, self.reload, self.edit):
            layout.addWidget(widget)

    def show_url(self, qurl):
        if self.edit.hasFocus() and self.edit.isModified():
            return  # não atropela o que o usuário está digitando
        url = qurl.toString()
        self.edit.setText("" if url == BLANK else url)
        self.edit.setCursorPosition(0)

    def focus(self):
        self.edit.setFocus()
        self.edit.selectAll()


class Tabs:
    """Abas: lista de views em paralelo com as linhas da TabStrip e o QStackedWidget."""

    def __init__(self, profile, strip, stack, discard_after, on_current):
        self.profile = profile
        self.strip = strip
        self.stack = stack
        self.on_current = on_current
        self.views = []
        self.current_view = None
        self.discard = DiscardPolicy(discard_after, self._discard_page, stack)
        strip.currentRowChanged.connect(self._select_row)

    def open(self, url, background=False):
        view = QWebEngineView(self.profile)
        row = len(self.views)
        self.views.append(view)
        self.stack.addWidget(view)
        item = self.strip.insert_tab(row)
        view.titleChanged.connect(lambda title: self._on_title(view, item, title))
        view.iconChanged.connect(lambda icon: self._on_icon(view, item, icon))
        view.urlChanged.connect(lambda _url: self._on_url(view))
        view.setUrl(QUrl(url))
        if background:
            self.discard.background(view.page())
            return
        self.strip.setCurrentRow(row)

    def close_current(self):
        view = self.current_view
        if view is None:
            return
        row = self.views.index(view)
        self.discard.forget(view.page())
        self.current_view = None
        self.views.pop(row)
        self.stack.removeWidget(view)
        view.deleteLater()
        # Sinais bloqueados: a troca automática de item do Qt durante a remoção
        # chegaria com índice antigo e dessincronizaria lista e pilha.
        self.strip.blockSignals(True)
        self.strip.takeItem(row)
        self.strip.setCurrentRow(min(row, len(self.views) - 1))
        self.strip.blockSignals(False)
        if not self.views:
            self.stack.window().close()
            return
        self._select_row(self.strip.currentRow())

    def cycle(self, step):
        if self.views:
            self.strip.setCurrentRow((self.strip.currentRow() + step) % len(self.views))

    def _select_row(self, row):
        if row < 0:
            return
        if self.current_view is not None:
            self.discard.background(self.current_view.page())
        view = self.views[row]
        self.current_view = view
        self.discard.forget(view.page())
        self._restore(view.page())
        self.stack.setCurrentWidget(view)
        self.on_current(view)

    def _restore(self, page):
        # Página descartada volta a Active (o Qt recarrega a URL guardada).
        if page.lifecycleState() == Lifecycle.Active:
            return
        page.setLifecycleState(Lifecycle.Active)
        log(f"restore: {page.url().toString()}")

    def _discard_page(self, page):
        # Qt só aceita Discarded para página não visível; o resultado real é logado.
        page.setLifecycleState(Lifecycle.Discarded)
        log(f"discard: {page.url().toString()} -> {page.lifecycleState().name}")

    def _on_title(self, view, item, title):
        item.setToolTip(title)
        if view.icon().isNull():
            item.setIcon(letter_icon(title or view.url().host()))
        if view is self.current_view:
            self.on_current(view)

    def _on_icon(self, view, item, icon):
        item.setIcon(letter_icon(view.title() or view.url().host()) if icon.isNull() else icon)

    def _on_url(self, view):
        if view is self.current_view:
            self.on_current(view)


def install_shortcuts(window, bindings):
    """Uma QAction por atalho, válida na janela inteira (inclusive com foco na página)."""
    for keys, callback in bindings:
        action = QAction(window)
        action.setShortcuts([QKeySequence(k) for k in keys])
        action.setShortcutContext(Qt.WindowShortcut)
        action.triggered.connect(callback)
        window.addAction(action)


class BrowserWindow(QWidget):
    """Janela única: TabStrip à esquerda, AddressBar no topo, páginas no centro."""

    def __init__(self, profile, discard_after):
        super().__init__()
        self.resize(1200, 800)
        self.address = AddressBar(self._navigate)
        strip = TabStrip()
        stack = QStackedWidget()
        self.tabs = Tabs(profile, strip, stack, discard_after, self._show_current)
        self.address.back.clicked.connect(lambda: self._page_action(QWebEnginePage.Back))
        self.address.forward.clicked.connect(lambda: self._page_action(QWebEnginePage.Forward))
        self.address.reload.clicked.connect(lambda: self._page_action(QWebEnginePage.Reload))
        right = QVBoxLayout()
        right.setContentsMargins(0, 0, 0, 0)
        right.setSpacing(0)
        right.addWidget(self.address)
        right.addWidget(stack, 1)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(strip)
        layout.addLayout(right, 1)
        install_shortcuts(self, [
            (["Ctrl+T"], self.new_tab),
            (["Ctrl+W"], self.tabs.close_current),
            (["Ctrl+L"], self.address.focus),
            (["Ctrl+Tab"], lambda: self.tabs.cycle(1)),
            (["Ctrl+Shift+Tab", "Ctrl+Shift+Backtab"], lambda: self.tabs.cycle(-1)),
            (["Alt+Left"], lambda: self._page_action(QWebEnginePage.Back)),
            (["Alt+Right"], lambda: self._page_action(QWebEnginePage.Forward)),
        ])

    def new_tab(self):
        self.tabs.open(BLANK)
        self.address.focus()

    def _navigate(self, url):
        view = self.tabs.current_view
        if view is None:
            self.tabs.open(url)
            return
        view.setUrl(QUrl(url))
        view.setFocus()

    def _page_action(self, action):
        if self.tabs.current_view is not None:
            self.tabs.current_view.page().triggerAction(action)

    def _show_current(self, view):
        self.address.show_url(view.url())
        self.setWindowTitle(f"{view.title() or 'KaiaK'} — KaiaK (qt)")


def apply_privacy(profile):
    """Privacidade nativa do Qt: WebRTC só por interfaces públicas (não expõe IP local)
    e bloqueio de cookies de terceiros (o filtro roda por requisição de cookie)."""
    profile.settings().setAttribute(QWebEngineSettings.WebAttribute.WebRTCPublicInterfacesOnly, True)
    profile.cookieStore().setCookieFilter(lambda request: not request.thirdParty)


def build_profile(profile_dir):
    """Perfil persistente no diretório pedido, com o script de rolagem vim."""
    os.makedirs(profile_dir, exist_ok=True)
    builder = QWebEngineProfileBuilder()
    builder.setPersistentStoragePath(os.path.join(profile_dir, "storage"))
    builder.setCachePath(os.path.join(profile_dir, "cache"))
    profile = builder.createProfile("kaiak-qt")
    apply_privacy(profile)
    script = QWebEngineScript()
    script.setName("kaiak-vim-scroll")
    script.setSourceCode(VIM_SCROLL_JS)
    script.setInjectionPoint(QWebEngineScript.DocumentReady)
    script.setWorldId(QWebEngineScript.ApplicationWorld)
    profile.scripts().insert(script)
    return profile


def parse_args():
    parser = argparse.ArgumentParser(description="KaiaK protótipo Qt WebEngine")
    parser.add_argument("urls", nargs="*", help="URLs iniciais (uma aba cada)")
    parser.add_argument("--profile-dir", default=os.path.expanduser("~/.local/share/kaiak-qt"))
    parser.add_argument("--discard-after", type=int, default=120, metavar="SEG",
                        help="descarta abas em segundo plano após SEG segundos (0 desliga)")
    return parser.parse_known_args()  # argumentos desconhecidos seguem para o Qt


def main():
    args, qt_args = parse_args()
    app = QApplication([sys.argv[0], *qt_args])
    app.setDesktopFileName("kaiak-qt")
    profile = build_profile(args.profile_dir)
    window = BrowserWindow(profile, args.discard_after)
    urls = [to_url(u) for u in args.urls] or [BLANK]
    window.tabs.open(urls[0])
    for url in urls[1:]:
        window.tabs.open(url, background=True)
    window.show()
    code = app.exec()
    del window  # páginas precisam morrer antes do perfil (exigência do Qt WebEngine)
    del profile
    return code


if __name__ == "__main__":
    sys.exit(main())
