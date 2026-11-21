'use strict';
const { performance } = require('node:perf_hooks');
const rss = () => +(process.memoryUsage().rss / 1048576).toFixed(1);
async function main() {
  const { lua, lauxlib, lualib, to_luastring } = require('fengari');
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  const deadline = performance.now() + 200;
  // gancho de contagem: aborta código do usuário que passe do prazo
  lua.lua_sethook(L, (S) => {
    if (performance.now() > deadline) lauxlib.luaL_error(S, to_luastring('tempo esgotado na config (laço infinito?)'));
  }, lua.LUA_MASKCOUNT, 10000);
  const t0 = performance.now();
  const err = lauxlib.luaL_dostring(L, to_luastring('while true do end'));
  const msg = err ? lua.lua_tojsstring(L, -1) : 'sem erro';
  console.log(JSON.stringify({ fengari_laco_infinito: msg, abortou_em_ms: +(performance.now() - t0).toFixed(0) }));
  const before = rss();
  const { LuaFactory } = require('wasmoon');
  const e = await new LuaFactory().createEngine();
  const withVm = rss();
  e.global.close();
  global.gc?.();
  console.log(JSON.stringify({ wasmoon_rss_antes: before, com_vm: withVm, apos_close: rss() }));
}
main().catch((e) => { console.error(e); process.exit(1); });
