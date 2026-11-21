#!/usr/bin/env python3
"""KaiaK — protótipo B: shell mínimo sobre WebKitGTK 6.0 (GTK4 + PyGObject)."""
import argparse
import os
import sys
import time
from urllib.parse import quote_plus, urlparse

import gi

gi.require_version("Gdk", "4.0")
gi.require_version("Gtk", "4.0")
gi.require_version("WebKit", "6.0")
from gi.repository import Gdk, Gio, GLib, Gtk, WebKit  # noqa: E402

TAB_BAR_WIDTH = 42
ICON_SIZE = 24
BLANK = "about:blank"
SEARCH_URL = "https://duckduckgo.com/?q="
CSS = """
.kaiak-tabs { background: #2b2b2b; }
.kaiak-tabs row { padding: 6px 0; }
.kaiak-tabs row:selected { background: #3584e4; }
.kaiak-letter { background: #555555; color: white; border-radius: 5px; font-weight: bold;
                min-width: 24px; min-height: 24px; }
"""

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
    print(f"[kaiak-gtk] {msg}", file=sys.stderr, flush=True)


def to_url(text):
    """Texto da barra -> URL. Com esquema: navega; 'dominio.tld': https; resto: busca DDG."""
    text = text.strip()
    if "://" in text or text.startswith(("about:", "file:", "data:")):
        return text
    if "." in text and " " not in text:
        return "https://" + text
    return SEARCH_URL + quote_plus(text)


class DiscardPolicy:
    """Decide QUANDO descartar: chama on_discard(chave) após `after` s em segundo plano."""

    def __init__(self, after, on_discard):
        self.after = after
        self.on_discard = on_discard
        self.hidden_since = {}
        if after > 0:
            GLib.timeout_add_seconds(int(max(1, min(5, after / 2))), self._tick)

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
        return GLib.SOURCE_CONTINUE


class TabIcon(Gtk.Stack):
    """Favicon da aba ou, sem favicon, a inicial do título."""

    def __init__(self):
        super().__init__(halign=Gtk.Align.CENTER)
        self.image = Gtk.Image(pixel_size=ICON_SIZE)
        self.letter = Gtk.Label(label="?", css_classes=["kaiak-letter"])
        self.add_named(self.letter, "letter")
        self.add_named(self.image, "image")

    def show_letter(self, text):
        self.letter.set_label((text.strip() or "?")[0].upper())

    def show_favicon(self, texture):
        if texture is None:
            self.set_visible_child_name("letter")
            return
        self.image.set_from_paintable(texture)
        self.set_visible_child_name("image")


class Tab:
    """Uma aba: WebView vivo, ou só URL/título guardados quando descartada."""

    def __init__(self, url):
        self.url = url
        self.title = ""
        self.view = None
        self.slot = Gtk.Box(hexpand=True, vexpand=True)  # lugar fixo no Gtk.Stack
        self.icon = TabIcon()
        self.row = Gtk.ListBoxRow(child=self.icon, focusable=False)


class AddressBar(Gtk.Box):
    """Voltar/avançar/recarregar + campo de endereço; Enter chama on_submit(url)."""

    def __init__(self, on_submit):
        super().__init__(spacing=4, margin_top=4, margin_bottom=4, margin_start=4, margin_end=4)
        self.back = Gtk.Button(icon_name="go-previous-symbolic", has_frame=False)
        self.forward = Gtk.Button(icon_name="go-next-symbolic", has_frame=False)
        self.reload = Gtk.Button(icon_name="view-refresh-symbolic", has_frame=False)
        self.entry = Gtk.Entry(hexpand=True, placeholder_text="Endereço ou busca")
        self.entry.connect("activate", lambda e: on_submit(to_url(e.get_text())))
        self.shown = ""
        for widget in (self.back, self.forward, self.reload, self.entry):
            self.append(widget)

    def show_url(self, url):
        focused = self.entry.get_state_flags() & Gtk.StateFlags.FOCUS_WITHIN
        if focused and self.entry.get_text() != self.shown:
            return  # não atropela o que o usuário está digitando
        self.shown = "" if url == BLANK else (url or "")
        self.entry.set_text(self.shown)

    def focus(self):
        self.entry.grab_focus()
        self.entry.select_region(0, -1)


class Tabs:
    """Abas: lista de Tab em paralelo com as linhas da ListBox e as páginas do Gtk.Stack."""

    def __init__(self, session, content, strip, stack, discard_after, on_current):
        self.session = session
        self.content = content
        self.strip = strip
        self.stack = stack
        self.on_current = on_current
        self.tabs = []
        self.current = None
        self.discard = DiscardPolicy(discard_after, self._discard_tab)
        strip.connect("row-selected", self._on_row_selected)

    def open(self, url, background=False):
        tab = Tab(url)
        self.tabs.append(tab)
        self.stack.add_child(tab.slot)
        self.strip.append(tab.row)
        self._create_view(tab)
        if background:
            self.discard.background(tab)
            return
        self.strip.select_row(tab.row)

    def close_current(self):
        tab = self.current
        if tab is None:
            return
        index = self.tabs.index(tab)
        self.discard.forget(tab)
        self.current = None
        self.tabs.pop(index)
        if tab.view is not None:
            self._drop_view(tab)
        self.stack.remove(tab.slot)
        self.strip.remove(tab.row)
        if not self.tabs:
            self.stack.get_root().close()
            return
        self.strip.select_row(self.tabs[min(index, len(self.tabs) - 1)].row)

    def cycle(self, step):
        if self.tabs:
            index = self.tabs.index(self.current) if self.current else 0
            self.strip.select_row(self.tabs[(index + step) % len(self.tabs)].row)

    def _on_row_selected(self, _strip, row):
        if row is None:
            return
        if self.current is not None:
            self.discard.background(self.current)
        tab = self.tabs[row.get_index()]
        self.current = tab
        self.discard.forget(tab)
        if tab.view is None:
            self._create_view(tab)
            log(f"restore: {tab.url}")
        self.stack.set_visible_child(tab.slot)
        self.on_current(tab)

    def _create_view(self, tab):
        view = WebKit.WebView(network_session=self.session, user_content_manager=self.content,
                              hexpand=True, vexpand=True)
        for prop, handler in self._watched():
            view.connect("notify::" + prop, handler, tab)
        tab.view = view
        tab.slot.append(view)
        view.load_uri(tab.url)

    def _watched(self):
        return (("uri", self._on_uri), ("title", self._on_title), ("favicon", self._on_favicon))

    def _discard_tab(self, tab):
        # Sem equivalente ao Discarded do Chromium: guarda URL/título e destrói o WebView.
        if tab.view is None:
            return
        self._drop_view(tab)
        log(f"discard: {tab.url}")

    def _drop_view(self, tab):
        # Medido no WebKitGTK 2.54: destruir a view NÃO encerra o WebProcess dela, então
        # ele é encerrado explicitamente (cada aba tem o seu; views não são relacionadas).
        view = tab.view
        tab.url = view.get_uri() or tab.url
        for _prop, handler in self._watched():
            view.disconnect_by_func(handler)  # o término zera título/URI da view
        view.terminate_web_process()
        tab.slot.remove(view)
        tab.view = None

    def _on_uri(self, view, _pspec, tab):
        tab.url = view.get_uri() or tab.url
        if tab is self.current:
            self.on_current(tab)

    def _on_title(self, view, _pspec, tab):
        tab.title = view.get_title() or ""
        tab.row.set_tooltip_text(tab.title)
        tab.icon.show_letter(tab.title or urlparse(tab.url).hostname or "?")
        if tab is self.current:
            self.on_current(tab)

    def _on_favicon(self, view, _pspec, tab):
        tab.icon.show_favicon(view.get_favicon())


def install_shortcuts(window, bindings):
    """Atalhos na fase de captura da janela: valem mesmo com o foco dentro da página."""
    controller = Gtk.ShortcutController(propagation_phase=Gtk.PropagationPhase.CAPTURE)
    for trigger, callback in bindings:
        controller.add_shortcut(Gtk.Shortcut(trigger=Gtk.ShortcutTrigger.parse_string(trigger),
                                             action=Gtk.CallbackAction.new(_run(callback))))
    window.add_controller(controller)


def _run(callback):
    def handler(_widget, _args):
        callback()
        return True
    return handler


class BrowserWindow(Gtk.ApplicationWindow):
    """Janela única: abas à esquerda, AddressBar no topo, páginas no centro."""

    def __init__(self, app, session, content, discard_after):
        super().__init__(application=app, title="KaiaK (gtk)", default_width=1200,
                         default_height=800)
        self.address = AddressBar(self._navigate)
        strip = Gtk.ListBox(css_classes=["kaiak-tabs"], can_focus=False)
        scroller = Gtk.ScrolledWindow(child=strip, width_request=TAB_BAR_WIDTH,
                                      hscrollbar_policy=Gtk.PolicyType.NEVER,
                                      vscrollbar_policy=Gtk.PolicyType.EXTERNAL)
        stack = Gtk.Stack(hexpand=True, vexpand=True)
        self.tabs = Tabs(session, content, strip, stack, discard_after, self._show_current)
        self.address.back.connect("clicked", lambda _b: self._view_call("go_back"))
        self.address.forward.connect("clicked", lambda _b: self._view_call("go_forward"))
        self.address.reload.connect("clicked", lambda _b: self._view_call("reload"))
        right = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, hexpand=True)
        right.append(self.address)
        right.append(stack)
        root = Gtk.Box()
        root.append(scroller)
        root.append(right)
        self.set_child(root)
        install_shortcuts(self, [
            ("<Control>t", self.new_tab),
            ("<Control>w", self.tabs.close_current),
            ("<Control>l", self.address.focus),
            ("<Control>Tab", lambda: self.tabs.cycle(1)),
            ("<Control><Shift>ISO_Left_Tab|<Control><Shift>Tab", lambda: self.tabs.cycle(-1)),
            ("<Alt>Left", lambda: self._view_call("go_back")),
            ("<Alt>Right", lambda: self._view_call("go_forward")),
        ])

    def new_tab(self):
        self.tabs.open(BLANK)
        self.address.focus()

    def _navigate(self, url):
        tab = self.tabs.current
        if tab is None:
            self.tabs.open(url)
            return
        tab.view.load_uri(url)
        tab.view.grab_focus()

    def _view_call(self, method):
        tab = self.tabs.current
        if tab is not None and tab.view is not None:
            getattr(tab.view, method)()

    def _show_current(self, tab):
        self.address.show_url(tab.url)
        self.set_title(f"{tab.title or 'KaiaK'} — KaiaK (gtk)")


def apply_privacy(session):
    """Privacidade nativa do WebKitGTK: bloqueia cookies de terceiros e liga a
    Prevenção Inteligente de Rastreamento (ITP). WebRTC já vem desligado no WebKitGTK."""
    session.get_cookie_manager().set_accept_policy(WebKit.CookieAcceptPolicy.NO_THIRD_PARTY)
    session.set_itp_enabled(True)


def build_session(profile_dir):
    """Sessão de rede persistente no diretório pedido, com favicons ligados."""
    data_dir = os.path.join(profile_dir, "data")
    cache_dir = os.path.join(profile_dir, "cache")
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)
    session = WebKit.NetworkSession.new(data_dir, cache_dir)
    session.get_website_data_manager().set_favicons_enabled(True)
    apply_privacy(session)
    return session


def build_content_manager():
    """Script de rolagem vim num mundo isolado ("kaiak"), só no frame principal."""
    content = WebKit.UserContentManager()
    content.add_script(WebKit.UserScript.new_for_world(
        VIM_SCROLL_JS, WebKit.UserContentInjectedFrames.TOP_FRAME,
        WebKit.UserScriptInjectionTime.END, "kaiak", None, None))
    return content


def parse_args():
    parser = argparse.ArgumentParser(description="KaiaK protótipo WebKitGTK")
    parser.add_argument("urls", nargs="*", help="URLs iniciais (uma aba cada)")
    parser.add_argument("--profile-dir", default=os.path.expanduser("~/.local/share/kaiak-gtk"))
    parser.add_argument("--discard-after", type=int, default=120, metavar="SEG",
                        help="descarta abas em segundo plano após SEG segundos (0 desliga)")
    return parser.parse_args()


def on_activate(app, args):
    provider = Gtk.CssProvider()
    provider.load_from_string(CSS)
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider,
                                              Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    window = BrowserWindow(app, build_session(args.profile_dir), build_content_manager(),
                           args.discard_after)
    urls = [to_url(u) for u in args.urls] or [BLANK]
    window.tabs.open(urls[0])
    for url in urls[1:]:
        window.tabs.open(url, background=True)
    window.present()


def main():
    args = parse_args()
    # NON_UNIQUE: cada execução é independente (sem instância única via D-Bus).
    app = Gtk.Application(application_id="dev.rafeu.KaiakGtk",
                          flags=Gio.ApplicationFlags.NON_UNIQUE)
    app.connect("activate", on_activate, args)
    return app.run([sys.argv[0]])


if __name__ == "__main__":
    sys.exit(main())
