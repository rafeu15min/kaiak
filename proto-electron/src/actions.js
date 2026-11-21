'use strict';
// Ações nomeadas que um atalho (ou, na fase 2, o Lua) pode disparar.
function createActions({ tabs, focusAddress, toggleDevtools = () => {}, toggleTheme = () => {}, find = {}, zoom = {}, printer = {}, printDialog = {} }) {
  return {
    new_tab: () => { tabs.open(); focusAddress(); },
    new_private_tab: () => { tabs.open(undefined, false, true); focusAddress(); },
    close_tab: () => { if (tabs.active) tabs.close(tabs.active.id); },
    focus_address: focusAddress,
    next_tab: () => tabs.cycle(1),
    prev_tab: () => tabs.cycle(-1),
    back: () => tabs.back(),
    forward: () => tabs.forward(),
    reload: () => tabs.reload(),
    toggle_devtools: toggleDevtools,
    find: () => find.open?.(), // busca na página: abre a caixa (ou foca o campo)
    find_next: () => find.step?.(true),
    find_prev: () => find.step?.(false),
    print: () => printDialog.open?.(), // tela de impressão do KaiaK (parâmetros + Salvar como PDF)
    print_system: () => printer.printSystem?.(), // diálogo de impressão do sistema
    save_pdf: () => printer.savePdf?.(), // PDF direto na pasta de downloads, com os padrões do k.print (sem tecla padrão)
    zoom_in: () => zoom.step?.(1),
    zoom_out: () => zoom.step?.(-1),
    zoom_reset: () => zoom.reset?.(),
    toggle_theme: toggleTheme, // próximo tema declarado no .lua (volta ao 1º depois do último)
  };
}

// Nomes das ações (a validação da config os conhece sem carregar o Electron). O teste actions.test.js garante que esta
// lista e createActions não se afastam.
const ACTION_NAMES = ['new_tab', 'new_private_tab', 'close_tab', 'focus_address', 'next_tab', 'prev_tab', 'back', 'forward', 'reload', 'toggle_devtools', 'toggle_theme', 'find', 'find_next', 'find_prev', 'print', 'print_system', 'save_pdf', 'zoom_in', 'zoom_out', 'zoom_reset'];

module.exports = { createActions, ACTION_NAMES };
