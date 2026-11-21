-- KaiaK do Rafeu: visual do Vivaldi (referência: capturas de tela de 19/11/2026, só a aparência).
-- Tudo de layout, tema e página inicial mora aqui. Rodado UMA vez, na partida.

-- ─── Tema ────────────────────────────────────────────────────────────────────────────────────────
-- Cores amostradas do Vivaldi: barras #252734, campo de endereço #020314, trilho #2b395e, painel #1b1c27.
-- Um segundo tema (ex.: "dia") ligaria o botão de alternar; o trilho e o painel têm cor própria (bg do slot),
-- então um tema claro precisaria de bg novo nesses slots. Por ora, só "noite".
k.theme("noite", {
  bg = "#252734", fg = "#e1e3ee", muted = "#8f93ab", accent = "#b2b4dd",
  panel = "#2f3245", border = "#3a3d52", input = "#020314",
  tab_active = "#3f5287", tab_icon = "#4a5778", hover = "#46507a", disabled = "#555a73",
  color_scheme = "dark", scheme = "noite",
})

-- ─── Layout ──────────────────────────────────────────────────────────────────────────────────────
-- Barra de endereço no topo (campo em pílula, mais escuro que a barra).
k.layout("bar", { content = "address", place = "top", size = 44 })

-- Trilho de abas à esquerda, só com ícones, azul fosco, sem expandir ao passar o mouse.
k.layout("rail", { content = "tabs", place = "left", size = 46, expand = false, bg = "#2b395e" })

-- Faixa de botões à direita (como a tira de painéis do Vivaldi), mais escura.
k.layout("side", { content = "buttons", place = "right", size = 42, bg = "#1b1c27" })

k.button("devtools", {
  icon = { svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M5.5 4 1.5 8l4 4 1-1L3.5 8l3-3zm5 0-1 1 3 3-3 3 1 1 4-4z'/></svg>" },
  tooltip = "Ferramentas de desenvolvedor (F12)", slot = "side", action = "toggle_devtools",
})
k.button("privada", {
  icon = { svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='M8 1 2 3.5v4c0 3.6 2.5 6 6 7.5 3.5-1.5 6-3.9 6-7.5v-4z'/></svg>" },
  tooltip = "Nova aba privada (Ctrl+Shift+N)", slot = "side", action = "new_private_tab",
})

-- ─── Página inicial ──────────────────────────────────────────────────────────────────────────────
-- Cor lisa do tema + uma imagem de uma cor só (pintada com o destaque do tema) e o campo de busca.
k.start {
  background = { image = { file = "~/.config/kaiak/art/cowboy-silhouette.svg", size = "34%", place = "center", tint = true } },
}
