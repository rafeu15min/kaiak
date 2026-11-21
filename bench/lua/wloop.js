const { LuaFactory } = require('wasmoon');
(async () => { const e = await new LuaFactory().createEngine(); console.log('iniciando laço infinito'); await e.doString('while true do end'); })();
