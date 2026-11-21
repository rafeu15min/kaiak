'use strict';
// Hospedeiro Lua (fengari): roda o kaiak.lua do usuário e devolve DADOS. O Lua só é chamado de novo
// em eventos (funções registradas por k.bind / k.on). Todo código do usuário roda com prazo: um
// laço infinito é abortado pelo gancho de contagem em vez de travar o navegador.
const { performance } = require('node:perf_hooks');
const { lua, lauxlib, lualib, to_luastring: str } = require('fengari');
const { merge } = require('./config');

const MAX_DEPTH = 8;
const HOOK_EVERY = 10000; // instruções entre verificações do prazo
const SECTIONS = ['theme', 'start', 'boot', 'session', 'find', 'zoom', 'print', 'context_menu', 'timing', 'security', 'blocking', 'search', 'devtools', 'downloads'];
// Biblioteca restrita: sem io/debug/dofile/loadfile; os mantém só o que é inofensivo.
const SANDBOX = `
io = nil; debug = nil; dofile = nil; loadfile = nil
local o = os
os = { time = o.time, date = o.date, clock = o.clock, getenv = o.getenv }
`;

// As funções de JS ficam escondidas (notification_*, layout_ops); o que o usuário vê é k.notification{} com .surface e .type,
// e k.layout, que devolve handles (h:remove()), como o hl.bind do Hyprland.
const LUA_API_BOOTSTRAP = `
-- Erros das funções de JS apontam a linha do kaiak.lua (não a deste código): relança no nível do chamador.
local function wrap(fn, level)
  return function(...)
    local ok, err = pcall(fn, ...)
    if not ok then error((tostring(err):gsub("^%[string .-%]:%d+: ", "")), level) end
  end
end

local config, surface, kind = kaiak.notification, kaiak.notification_surface, kaiak.notification_type
kaiak.notification_surface, kaiak.notification_type = nil, nil
config = wrap(config, 3)
kaiak.notification = setmetatable({ surface = wrap(surface, 2), type = wrap(kind, 2) }, { __call = function(_, t) return config(t) end })

local ops = wrap(kaiak.layout_ops, 3)
local button_ops = wrap(kaiak.button_ops, 3)
local visible = wrap(kaiak.slot_visible, 3)
local button_set = wrap(kaiak.button_set, 3)
-- k.theme { cores }  (tema base)   |   k.theme("noite", { cores })  (tema nomeado; o 1º declarado é o inicial)   |   k.theme.set("noite")
local theme_plain, theme_ops, theme_set = kaiak.theme, wrap(kaiak.theme_ops, 3), wrap(kaiak.theme_set, 3)
kaiak.theme_ops, kaiak.theme_set = nil, nil
kaiak.theme = setmetatable({ set = function(name) theme_set(name) end }, {
  __call = function(_, first, spec)
    if type(first) == "string" then
      theme_ops(first, spec)
      return
    end
    theme_plain(first)
  end,
})
kaiak.layout_ops, kaiak.button_ops, kaiak.slot_visible, kaiak.button_set = nil, nil, nil, nil
-- k.exec("id", { cmd, args, ... }) declara um comando da MÁQUINA; h:run({ "extra" }) e k.exec.run("id", { "extra" }) o disparam
-- (dentro de funções de evento: teclas, botões, k.on). Só o .lua dispara; sites nunca.
local exec_ops, exec_run = wrap(kaiak.exec_ops, 3), wrap(kaiak.exec_run, 3)
local exec_ctl = kaiak.exec_ctl -- stop/restart/write/running: devolve valor (running e stop devolvem booleano)
kaiak.exec_ops, kaiak.exec_run, kaiak.exec_ctl = nil, nil, nil
local function exec_control(id, verb, arg)
  local ok, result = pcall(exec_ctl, id, verb, arg)
  if not ok then error((tostring(result):gsub("^%[string .-%]:%d+: ", "")), 3) end
  return result
end

-- Handles: o que k.layout / k.button devolvem (h:remove(), e h:show/hide/toggle nos slots), como o hl.bind do Hyprland.
local function collection(add, methods)
  local Handle = { remove = function(self) add(self.id, false) end }
  for name, fn in pairs(methods or {}) do Handle[name] = fn end
  Handle.__index = Handle
  local function handle(id) return setmetatable({ id = id }, Handle) end
  return function(first, spec)
    if type(first) == "string" then
      add(first, spec)
      return handle(first)
    end
    add(first)
    local handles = {}
    for id in pairs(first) do handles[id] = handle(id) end
    return handles
  end
end

kaiak.layout = collection(ops, {
  show = function(self) visible(self.id, true) end,
  hide = function(self) visible(self.id, false) end,
  toggle = function(self) visible(self.id) end,
})
local exec_collection = collection(exec_ops, {
  run = function(self, args) exec_run(self.id, args) end,
  stop = function(self) return exec_control(self.id, "stop") end,
  restart = function(self) exec_control(self.id, "restart") end,
  write = function(self, text) exec_control(self.id, "write", text) end,
  running = function(self) return exec_control(self.id, "running") end,
})
kaiak.exec = setmetatable({
  run = function(id, args) exec_run(id, args) end,
  stop = function(id) return exec_control(id, "stop") end,
  restart = function(id) exec_control(id, "restart") end,
  write = function(id, text) exec_control(id, "write", text) end,
  running = function(id) return exec_control(id, "running") end,
}, { __call = function(_, first, spec) return exec_collection(first, spec) end })
kaiak.button = collection(button_ops, {
  set_state = function(self, name) button_set(self.id, "state", name) end,
  set_badge = function(self, value) button_set(self.id, "badge", value) end,
  set_enabled = function(self, on) button_set(self.id, "enabled", on) end,
})
`;

function createLuaHost({ requireDir, configTimeoutMs = 500, callTimeoutMs = 100, onError = () => {} } = {}) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lauxlib.luaL_dostring(L, str(SANDBOX));

  let deadline = Infinity;
  let callbacks = 0;
  let closed = false;
  let runtime = null;
  let syntaxError = false;
  const data = { theme: {}, start: {}, boot: {}, session: {}, find: {}, zoom: {}, print: {}, context_menu: {}, themes: [], layout: [], buttons: [], exec: [], timing: {}, security: {}, blocking: {}, search: {}, devtools: {}, downloads: {}, notification: { surfaces: {}, types: {} }, keys: {} };
  const handlers = {};

  lua.lua_sethook(L, (S) => {
    if (performance.now() > deadline) lauxlib.luaL_error(S, str('tempo esgotado (laço infinito?)'));
  }, lua.LUA_MASKCOUNT, HOOK_EVERY);

  // ---- Lua -> JS -------------------------------------------------------------------------
  const readers = {
    [lua.LUA_TBOOLEAN]: (i) => lua.lua_toboolean(L, i),
    [lua.LUA_TNUMBER]: (i) => lua.lua_tonumber(L, i),
    [lua.LUA_TSTRING]: (i) => lua.lua_tojsstring(L, i),
    [lua.LUA_TTABLE]: (i, depth) => readTable(i, depth),
    [lua.LUA_TFUNCTION]: (i) => makeCallable(i),
  };

  function toJs(idx, depth = 0) {
    const read = readers[lua.lua_type(L, idx)];
    return read ? read(idx, depth) : undefined;
  }

  function readKey(idx) {
    return lua.lua_type(L, idx) === lua.LUA_TNUMBER ? String(lua.lua_tonumber(L, idx)) : lua.lua_tojsstring(L, idx);
  }

  function readArray(abs, length, depth) {
    const out = [];
    for (let i = 1; i <= length; i++) {
      lua.lua_rawgeti(L, abs, i);
      out.push(toJs(-1, depth + 1));
      lua.lua_pop(L, 1);
    }
    return out;
  }

  function readTable(idx, depth) {
    if (depth > MAX_DEPTH) return undefined;
    const abs = lua.lua_absindex(L, idx);
    const length = lua.lua_rawlen(L, abs);
    if (length > 0) return readArray(abs, length, depth);
    const out = {};
    lua.lua_pushnil(L);
    while (lua.lua_next(L, abs) !== 0) {
      out[readKey(-2)] = toJs(-1, depth + 1);
      lua.lua_pop(L, 1);
    }
    return out;
  }

  // ---- JS -> Lua (chamar funções do usuário em eventos) ---------------------------------
  const pushers = {
    string: (v) => lua.lua_pushstring(L, str(v)),
    number: (v) => lua.lua_pushnumber(L, v),
    boolean: (v) => lua.lua_pushboolean(L, v),
    // objeto simples -> tabela Lua (ex.: o ctx do menu de contexto); null vira nil
    object: (v) => {
      if (v === null) return lua.lua_pushnil(L);
      lua.lua_newtable(L);
      Object.entries(v).forEach(([key, value]) => {
        pushArg(value);
        lua.lua_setfield(L, -2, str(key));
      });
    },
  };
  const pushArg = (v) => (pushers[typeof v] ?? (() => lua.lua_pushnil(L)))(v);

  function popError() {
    const msg = lua.lua_tojsstring(L, -1);
    lua.lua_pop(L, 1);
    return msg;
  }

  function protectedCall(nargs, timeoutMs) {
    deadline = performance.now() + timeoutMs;
    const status = lua.lua_pcall(L, nargs, 0, 0);
    deadline = Infinity;
    return status === 0 ? null : popError();
  }

  function makeCallable(idx) {
    lua.lua_pushvalue(L, idx);
    const ref = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
    callbacks++;
    return (...args) => {
      if (closed) return;
      lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
      args.forEach(pushArg);
      const error = protectedCall(args.length, callTimeoutMs);
      if (error) onError(error);
    };
  }

  // ---- API k.* ---------------------------------------------------------------------------
  const fail = (message) => lauxlib.luaL_error(L, str(message));

  function tableArg(index, fn) {
    if (lua.lua_type(L, index) !== lua.LUA_TTABLE) fail(`k.${fn} espera uma tabela`);
    return toJs(index);
  }

  function stringArg(index, fn) {
    if (lua.lua_type(L, index) !== lua.LUA_TSTRING) fail(`k.${fn}: argumento ${index} deve ser texto`);
    return lua.lua_tojsstring(L, index);
  }

  function bindTarget(index) {
    const type = lua.lua_type(L, index);
    const accepted = type === lua.LUA_TFUNCTION || type === lua.LUA_TSTRING || type === lua.LUA_TBOOLEAN;
    if (!accepted) fail('k.bind: o 2º argumento deve ser ação (texto), função ou false');
    return toJs(index);
  }

  function requireRuntime(fn) {
    if (!runtime) fail(`k.${fn} só funciona depois da partida (dentro de uma função de evento)`);
    return runtime;
  }

  // Coleção com duas formas equivalentes: k.x("id", spec) ou k.x { id = spec, ... }. spec = false remove/desliga.
  function collection(fn, store) {
    const named = lua.lua_type(L, 1) === lua.LUA_TSTRING;
    if (named && ![lua.LUA_TTABLE, lua.LUA_TBOOLEAN].includes(lua.lua_type(L, 2))) fail(`k.${fn} espera uma tabela ou false`);
    const entries = named ? [[lua.lua_tojsstring(L, 1), toJs(2)]] : Object.entries(tableArg(1, fn));
    entries.forEach(([id, spec]) => {
      const mergeable = spec !== null && typeof spec === 'object' && !Array.isArray(spec);
      store[id] = mergeable ? merge(store[id] || {}, spec) : spec; // false e valores inválidos seguem para a validação
    });
  }

  function collectOps(fn, list) {
    const named = lua.lua_type(L, 1) === lua.LUA_TSTRING;
    if (named && ![lua.LUA_TNONE, lua.LUA_TNIL, lua.LUA_TTABLE, lua.LUA_TBOOLEAN].includes(lua.lua_type(L, 2))) fail(`k.${fn} espera uma tabela, false ou nada`);
    const entries = named ? [[lua.lua_tojsstring(L, 1), lua.lua_type(L, 2) <= 0 ? {} : toJs(2)]] : Object.entries(tableArg(1, fn));
    entries.forEach(([id, spec]) => list.push({ id, spec }));
  }

  const api = {
    bind() { data.keys[stringArg(1, 'bind')] = bindTarget(2); },
    on() {
      const event = stringArg(1, 'on');
      if (lua.lua_type(L, 2) !== lua.LUA_TFUNCTION) fail('k.on: o 2º argumento deve ser uma função');
      (handlers[event] ??= []).push(makeCallable(2));
    },
    run() { requireRuntime('run').runAction(stringArg(1, 'run')); },
    // k.notification { surfaces = {...}, types = {...} }; k.notification.surface(...) e .type(...) (ver collection).
    // Coleções ordenadas (layout, button) na ORDEM DE LEITURA: k.x("id", spec | false | nada) ou k.x { id = spec, ... }. Cada entrada
    // vira uma operação na lista (data.layout / data.buttons), porque "remover e declarar de novo" muda a posição.
    // h:show() / h:hide() / h:toggle(): abre ou fecha um slot em execução (dentro de uma função de evento).
    slot_visible() {
      const id = stringArg(1, 'layout');
      const mode = lua.lua_type(L, 2) === lua.LUA_TBOOLEAN ? !!lua.lua_toboolean(L, 2) : 'toggle';
      if (!requireRuntime('layout').setSlotVisible(id, mode)) fail(`k.layout: o slot "${id}" não existe`);
    },
    // h:set_state("nome") / h:set_badge(n | "texto" | false) / h:set_enabled(bool): mudam um botão em execução.
    button_set() {
      const id = stringArg(1, 'button');
      const field = stringArg(2, 'button');
      const type = lua.lua_type(L, 3);
      const value = type === lua.LUA_TNUMBER ? lua.lua_tonumber(L, 3) : type === lua.LUA_TBOOLEAN ? !!lua.lua_toboolean(L, 3) : type === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 3) : false;
      const problem = requireRuntime('button').setButton(id, field, value);
      if (problem) fail(`k.button: ${problem}`);
    },
    theme_ops() { collectOps('theme', data.themes); },
    theme_set() {
      const name = stringArg(1, 'theme.set');
      if (!requireRuntime('theme.set').setTheme(name)) fail(`k.theme.set: o tema "${name}" não existe`);
    },
    layout_ops() { collectOps('layout', data.layout); },
    button_ops() { collectOps('button', data.buttons); },
    exec_ops() { collectOps('exec', data.exec); },
    // k.exec.run("id", { "extra", ... }): dispara um comando declarado (só depois da partida).
    exec_run() {
      const id = stringArg(1, 'exec.run');
      const extra = lua.lua_type(L, 2) === lua.LUA_TTABLE ? toJs(2) : [];
      const problem = requireRuntime('exec.run').runExec(id, Array.isArray(extra) ? extra : []);
      if (problem) fail(`k.exec: ${problem}`);
    },
    notification() { data.notification = merge(data.notification, tableArg(1, 'notification')); },
    notification_surface() { collection('notification.surface', data.notification.surfaces); },
    notification_type() { collection('notification.type', data.notification.types); },
  };
  // k.exec: h:stop() (true se havia algo rodando), h:running(), h:write(texto), h:restart().
  const returning = {
    exec_ctl() {
      const id = stringArg(1, 'exec');
      const verb = stringArg(2, 'exec');
      const text = lua.lua_type(L, 3) === lua.LUA_TSTRING ? lua.lua_tojsstring(L, 3) : undefined;
      const result = requireRuntime('exec').execControl(id, verb, text);
      if (result?.problem) fail(`k.exec: ${result.problem}`);
      return result?.value;
    },
  };
  for (const name of SECTIONS) {
    api[name] = () => { data[name] = merge(data[name], tableArg(1, name)); };
  }

  function define(name, fn) {
    lua.lua_pushjsfunction(L, () => { fn(); return 0; });
    lua.lua_setfield(L, -2, str(name));
  }

  // Função que devolve UM valor ao Lua (booleano, texto, número ou nada).
  function defineReturning(name, fn) {
    lua.lua_pushjsfunction(L, () => {
      pushArg(fn());
      return 1;
    });
    lua.lua_setfield(L, -2, str(name));
  }

  function installApi() {
    lua.lua_newtable(L);
    Object.entries(api).forEach(([name, fn]) => define(name, fn));
    Object.entries(returning).forEach(([name, fn]) => defineReturning(name, fn));
    lua.lua_newtable(L);
    // k.tabs.open(url [, true]): o 2º argumento abre a aba como privada.
    define('open', () => requireRuntime('tabs.open').openTab(stringArg(1, 'tabs.open'), !!lua.lua_toboolean(L, 2)));
    lua.lua_setfield(L, -2, str('tabs'));
    lua.lua_pushvalue(L, -1);
    lua.lua_setglobal(L, str('kaiak'));
    lua.lua_setglobal(L, str('k'));
    // k.notification vira uma tabela chamável: k.notification { ... } e k.notification.surface("nome", { ... }).
    lauxlib.luaL_dostring(L, str(LUA_API_BOOTSTRAP));
  }

  function setRequirePath(dir) {
    if (!dir) return;
    lua.lua_getglobal(L, str('package'));
    lua.lua_pushstring(L, str(`${dir}/?.lua`));
    lua.lua_setfield(L, -2, str('path'));
    lua.lua_pop(L, 1);
  }

  installApi();
  setRequirePath(requireDir);

  return {
    data,
    // Roda o arquivo uma vez. Devolve a mensagem de erro (com arquivo:linha) ou null.
    run(source, chunkName) {
      const bytes = str(source);
      const status = lauxlib.luaL_loadbuffer(L, bytes, bytes.length, str(`@${chunkName}`));
      syntaxError = status !== 0; // não compilou (sintaxe); se compilou e quebrou ao rodar, é erro de EXECUÇÃO
      return status === 0 ? protectedCall(0, configTimeoutMs) : popError();
    },
    attach(rt) { runtime = rt; },
    get syntaxError() { return syntaxError; },
    emit(event, ...args) { (handlers[event] ?? []).forEach((fn) => fn(...args)); },
    get hasCallbacks() { return callbacks > 0; },
    // Sem funções registradas, a VM não tem mais o que fazer: libera.
    release() { if (callbacks === 0) this.close(); },
    close() {
      if (closed) return;
      closed = true;
      lua.lua_close(L);
    },
  };
}

module.exports = { createLuaHost };
