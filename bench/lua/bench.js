'use strict';
// Mede custo de partida, memória e latência de chamada de dois motores Lua (descartável).
const { performance } = require('node:perf_hooks');
const CONFIG = `
local cfg = { rail = { width = 42, hover = 240 }, theme = { bg = "#1e1f24", accent = "#7aa2f7" } }
k.theme(cfg.theme); k.layout(cfg)
for i = 1, 40 do k.bind("ctrl+shift+" .. i, "act" .. i) end
function on_key(n) return n + 1 end
function heavy() local s = 0 for i = 1, 1000000 do s = s + i end return s end
`;
const rss = () => process.memoryUsage().rss / 1048576;
const pct = (a, p) => a.sort((x, y) => x - y)[Math.floor(a.length * p)];
const report = (name, t) => console.log(JSON.stringify({ name, ...t }));

async function wasmoonRun() {
  const t0 = performance.now(); const m0 = rss();
  const { LuaFactory } = require('wasmoon');
  const lua = await new LuaFactory().createEngine();
  const t1 = performance.now();
  let calls = 0;
  lua.global.set('k', { theme: () => calls++, layout: () => calls++, bind: () => calls++ });
  await lua.doString(CONFIG);
  const t2 = performance.now(); const m1 = rss();
  const fn = lua.global.get('on_key');
  const lat = [];
  for (let i = 0; i < 20000; i++) { const a = performance.now(); fn(i); lat.push((performance.now() - a) * 1000); }
  const h = lua.global.get('heavy'); const h0 = performance.now(); h(); const heavy = performance.now() - h0;
  report('wasmoon', { engine_ms: +(t1 - t0).toFixed(1), config_ms: +(t2 - t1).toFixed(2), rss_mb: +(m1 - m0).toFixed(1),
    call_p50_us: +pct(lat, .5).toFixed(2), call_p99_us: +pct(lat, .99).toFixed(2), heavy_1M_loop_ms: +heavy.toFixed(1) });
  lua.global.close();
}

function fengariRun() {
  const t0 = performance.now(); const m0 = rss();
  const { lua, lauxlib, lualib, to_luastring } = require('fengari');
  const L = lauxlib.luaL_newstate(); lualib.luaL_openlibs(L);
  lua.lua_newtable(L);
  for (const name of ['theme', 'layout', 'bind']) {
    lua.lua_pushjsfunction(L, () => 0); lua.lua_setfield(L, -2, to_luastring(name));
  }
  lua.lua_setglobal(L, to_luastring('k'));
  const t1 = performance.now();
  if (lauxlib.luaL_dostring(L, to_luastring(CONFIG))) throw new Error('fengari config falhou');
  const t2 = performance.now(); const m1 = rss();
  const call = (name, arg) => {
    lua.lua_getglobal(L, to_luastring(name));
    if (arg !== undefined) lua.lua_pushinteger(L, arg);
    lua.lua_pcall(L, arg === undefined ? 0 : 1, 1, 0); lua.lua_pop(L, 1);
  };
  const lat = [];
  for (let i = 0; i < 20000; i++) { const a = performance.now(); call('on_key', i); lat.push((performance.now() - a) * 1000); }
  const h0 = performance.now(); call('heavy'); const heavy = performance.now() - h0;
  report('fengari', { engine_ms: +(t1 - t0).toFixed(1), config_ms: +(t2 - t1).toFixed(2), rss_mb: +(m1 - m0).toFixed(1),
    call_p50_us: +pct(lat, .5).toFixed(2), call_p99_us: +pct(lat, .99).toFixed(2), heavy_1M_loop_ms: +heavy.toFixed(1) });
}

(async () => {
  const which = process.argv[2];
  if (which === 'wasmoon') await wasmoonRun();
  else fengariRun();
})().catch((e) => { console.error(e); process.exit(1); });
