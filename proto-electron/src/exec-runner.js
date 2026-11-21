'use strict';
// Executa os comandos declarados em k.exec: spawn SEM shell (o sistema decide se roda: shebang, binfmt), com prazo, limite de saída
// e callbacks para o .lua. Só o .lua chega aqui (ação de botão, tecla, função); nenhuma página tem caminho até este módulo.
// Comandos "service" ficam rodando sem prazo (h:stop, h:write, h:restart); o vigia de CPU/memória (Linux) mata o que ficar preso.
const childProcess = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { createSliceQueue } = require('./slice-queue');
const { createSampler } = require('./proc-sampler');
const { createPlatformSampler } = require('./platform-sampler');
const { classify } = require('./stuck-check');
const { createPlatform } = require('./exec-platform');

const MAX_RUNNING = 8; // teto de comandos ao mesmo tempo (uma tecla repetida não vira bomba de processos)
const KILL_GRACE_MS = 2000;
const FIRST_LINE_MAX = 120;
const WATCH_MS = 1000;
const MEGABYTE = 1024 * 1024;
const JUDGE_STEP_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Linux lê /proc (síncrono); macOS e Windows consultam ps/PowerShell (assíncrono). O runner aceita os dois (await).
const defaultSampler = () => (process.platform === 'linux' ? createSampler() : createPlatformSampler());

// Um callback do .lua que quebre já é tratado pela VM (onError); aqui só se protege o fluxo.
const safely = (fn, ...args) => { try { fn?.(...args); } catch { /* o erro do .lua já foi reportado pela VM */ } };

// Divide uma stream em linhas sem partir caracteres UTF-8 entre dois pedaços.
function readLines(stream, onLine) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  stream.on('data', (chunk) => {
    const lines = (pending + decoder.write(chunk)).split('\n');
    pending = lines.pop();
    lines.forEach(onLine);
  });
  stream.on('end', () => {
    pending += decoder.end();
    if (pending) onLine(pending);
  });
}

function limitsOf(spec) {
  if (spec.max_cpu === undefined && spec.max_memory_mb === undefined) return null;
  return { cpu: spec.max_cpu === undefined ? undefined : Number.parseInt(spec.max_cpu, 10), cpuForS: spec.max_cpu_for_s, memory: spec.max_memory_mb };
}

function createExecRunner({ specs, spawn = childProcess.spawn, notify = () => {}, home = '', env = process.env, sampler = defaultSampler(), watchMs = WATCH_MS, now = () => performance.now(), platform = createPlatform(), registry = null }) {
  const running = new Set(); // instâncias vivas
  let watcher = null;
  const ofId = (id) => [...running].filter((inst) => inst.id === id);

  // ---- vigia de CPU/memória -------------------------------------------------------------------
  async function checkLimits(inst) {
    if (inst.sampling) return; // a consulta anterior (processo externo no macOS/Windows) ainda não voltou
    inst.sampling = true;
    const sample = await Promise.resolve(sampler.sample(inst.child.pid, inst.limits.memory !== undefined)).catch(() => null);
    inst.sampling = false;
    if (!sample || inst.done) return;
    const { cpu, cpuForS, memory } = inst.limits;
    if (memory !== undefined && sample.rss > memory * MEGABYTE) return terminate(inst, `memória acima de ${memory} MB`);
    if (cpu === undefined) return;
    const at = now();
    const seconds = inst.prev ? (at - inst.prev.at) / 1000 : 0;
    const used = inst.prev && seconds > 0 ? ((sample.ticks - inst.prev.ticks) / sampler.hz / seconds) * 100 : 0;
    inst.over = used > cpu ? inst.over + seconds : 0;
    inst.prev = { ticks: sample.ticks, at };
    if (inst.over >= cpuForS) terminate(inst, `CPU acima de ${cpu}% por ${cpuForS} s`);
  }

  // ---- gatilho do prazo: valida antes de matar --------------------------------------------------------
  // Janela curta de amostras (CPU, I/O, filhos) + bytes de saída recebidos. Saudável = ganha mais um prazo (até timeout_max_ms); enroscado = encerra.
  async function takeSamples(inst) {
    const windowMs = inst.spec.stuck_window_s * 1000;
    const samples = [];
    const take = async () => {
      const s = sampler.supported ? await Promise.resolve(sampler.sample(inst.child.pid, false, true)).catch(() => null) : null;
      samples.push({ at: now(), out: inst.received, ticks: s?.ticks ?? 0, io: s?.io ?? 0, pids: s?.pids ?? [] });
    };
    await take();
    for (let waited = 0; waited < windowMs && !inst.done; waited += JUDGE_STEP_MS) {
      await sleep(Math.min(JUDGE_STEP_MS, windowMs - waited));
      await take();
    }
    return samples;
  }

  async function onTimeout(inst) {
    const { spec } = inst;
    if (!spec.timeout_check) return terminate(inst, `estourou ${spec.timeout_ms} ms`);
    const samples = await takeSamples(inst);
    if (inst.done || inst.ending) return;
    const verdict = classify(samples, { stuckCpu: Number.parseInt(spec.stuck_cpu, 10), hz: sampler.hz ?? 100 });
    if (!verdict.healthy) return terminate(inst, `${verdict.reason} (prazo de ${spec.timeout_ms} ms)`);
    const left = spec.timeout_max_ms - (now() - inst.startedAt);
    if (left <= 0) return terminate(inst, `prazo máximo de ${spec.timeout_max_ms} ms atingido (${verdict.reason})`);
    notify({ level: 'info', text: `exec "${inst.id}" ainda ativo (${verdict.reason}): prazo estendido`, tag: `exec:${inst.id}` });
    inst.timer = setTimeout(() => onTimeout(inst), Math.min(spec.timeout_ms, left));
  }

  function updateWatcher() {
    const needed = [...running].some((inst) => inst.limits);
    if (needed && !watcher) {
      watcher = setInterval(() => [...running].filter((inst) => inst.limits).forEach(checkLimits), watchMs);
      watcher.unref?.();
    }
    if (!needed && watcher) {
      clearInterval(watcher);
      watcher = null;
    }
  }

  // ---- encerramento -----------------------------------------------------------------------------
  // SIGTERM no grupo; se não sair em 2 s, SIGKILL. `reason` (texto) vira o motivo do aviso de falha.
  function terminate(inst, reason) {
    if (inst.ending) return;
    inst.ending = true;
    inst.reason = reason;
    inst.child.stdin?.end?.();
    platform.killTree(inst.child, 'SIGTERM');
    inst.killer = setTimeout(() => platform.killTree(inst.child, 'SIGKILL'), KILL_GRACE_MS);
  }

  function finish(inst, code, signal) {
    inst.done = true;
    registry?.remove(inst.child.pid);
    clearTimeout(inst.timer);
    clearTimeout(inst.killer);
    running.delete(inst);
    updateWatcher();
    inst.queue.whenIdle(() => deliverExit(inst, code, signal)); // on_exit só depois da última linha entregue
  }

  function deliverExit(inst, code, signal) {
    const { id, spec } = inst;
    const text = Buffer.concat(inst.chunks).toString('utf8');
    const failed = code !== 0 && !inst.stopped;
    const reason = inst.reason ?? (signal ? `sinal ${signal}` : `código ${code}`);
    if (failed && spec.output !== 'none') notify({ level: 'warning', text: `exec "${id}" falhou (${reason})`, tag: `exec:${id}` });
    if (inst.reason && spec.output === 'none') notify({ level: 'warning', text: `exec "${id}" encerrado: ${inst.reason}`, tag: `exec:${id}` });
    if (!failed && code === 0 && spec.output === 'notify') notify({ level: 'info', text: `${id}: ${text.trim().split('\n')[0].slice(0, FIRST_LINE_MAX) || 'concluído'}`, tag: `exec:${id}` });
    const dropped = inst.queue.dropped();
    if (dropped > 0) notify({ level: 'warning', text: `exec "${id}": ${dropped} linhas descartadas (o .lua não acompanhou o fluxo)`, tag: `exec:${id}` });
    safely(spec.on_exit, code ?? -1, text);
    if (inst.restart) startAgain(id, inst.restart.extra);
  }

  function startAgain(id, extra) {
    const problem = run(id, extra);
    if (problem) notify({ level: 'warning', text: `exec: ${problem}`, tag: `exec:${id}` });
  }

  // ---- execução -----------------------------------------------------------------------------------
  function newInstance(id, spec) {
    return {
      id, spec, child: null, chunks: [], size: 0, timer: null, killer: null, reason: null, ending: false, stopped: false, restart: null,
      limits: sampler.supported ? limitsOf(spec) : null, prev: null, over: 0, received: 0, done: false, sampling: false, startedAt: now(),
      queue: createSliceQueue({ budgetMs: spec.on_output_budget_ms, cap: spec.on_output_queue_max }),
    };
  }

  // Guarda o que sai (stdout + stderr juntos, até o limite) e entrega as linhas aos callbacks do .lua, em fatias.
  function wireOutput(inst) {
    const { spec, child } = inst;
    const max = spec.max_output_kb * 1024;
    const keep = (chunk) => {
      inst.received += chunk.length; // conta TUDO que chegou (sinal de progresso do gatilho), mesmo o que o limite descarta
      if (inst.size >= max) return;
      const slice = chunk.subarray(0, max - inst.size);
      inst.size += slice.length;
      inst.chunks.push(slice);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    if (spec.on_output) readLines(child.stdout, (line) => inst.queue.push((l) => safely(spec.on_output, l), line));
    if (spec.on_error_output) readLines(child.stderr, (line) => inst.queue.push((l) => safely(spec.on_error_output, l), line));
  }

  function wireStdin(inst) {
    const { spec, child } = inst;
    if (!child.stdin) return;
    child.stdin.on('error', () => {});
    if (spec.stdin !== undefined) child.stdin.write(spec.stdin);
    if (!spec.service) child.stdin.end(); // service mantém o stdin aberto (h:write)
  }

  // Devolve null se começou, ou o problema (texto) se não deu.
  function run(id, extraArgs = []) {
    const spec = specs[id];
    if (!spec) return `o comando "${id}" não existe (declare com k.exec("${id}", { cmd = ... }))`;
    if (!Array.isArray(extraArgs) || extraArgs.some((a) => !['string', 'number'].includes(typeof a))) return 'os argumentos extras devem ser uma lista de textos';
    if (spec.service && ofId(id).length > 0) return `"${id}" já está rodando (service); use h:restart() para reiniciar`;
    if (running.size >= MAX_RUNNING) return `já há ${MAX_RUNNING} comandos rodando; espere algum terminar`;
    const piped = spec.service || spec.stdin !== undefined;
    const { command, args, options } = platform.prepare(spec, extraArgs, { home, env });
    options.stdio = [piped ? 'pipe' : 'ignore', 'pipe', 'pipe'];
    const inst = newInstance(id, spec);
    try {
      inst.child = spawn(command, args, options); // "~/x.sh" vale no cmd (nos args o ~ fica literal)
    } catch (error) {
      return `não foi possível iniciar "${id}": ${error.message}`;
    }
    running.add(inst);
    registry?.add(inst.child.pid);
    let done = false;
    const end = (code, signal) => { if (!done) { done = true; finish(inst, code, signal); } };
    inst.child.on('error', (error) => { // ex.: ENOENT (comando não existe)
      notify({ level: 'warning', text: `exec "${id}": ${error.code === 'ENOENT' ? `comando "${spec.cmd}" não encontrado` : error.message}`, tag: `exec:${id}` });
      end(-1, null);
    });
    inst.child.on('close', end);
    wireOutput(inst);
    wireStdin(inst);
    if (!spec.service) inst.timer = setTimeout(() => onTimeout(inst), spec.timeout_ms);
    if (inst.limits) updateWatcher();
    else if (!sampler.supported && (spec.max_cpu || spec.max_memory_mb)) notify({ level: 'warning', text: `exec "${id}": max_cpu/max_memory_mb só funcionam no Linux; ignorados`, tag: `exec:${id}` });
    return null;
  }

  // ---- controle de comandos em execução (h:stop, h:running, h:write, h:restart) -------------------
  function stop(id) {
    const insts = ofId(id);
    insts.forEach((inst) => { inst.stopped = true; terminate(inst, null); });
    return insts.length > 0;
  }

  function write(id, text) {
    const [inst] = ofId(id);
    if (!inst) return `"${id}" não está rodando`;
    if (!inst.spec.service) return `"${id}" não é um service: só comandos com service = true aceitam write`;
    if (typeof text !== 'string') return 'write espera um texto';
    inst.child.stdin.write(text);
    return null;
  }

  function restart(id, extra = []) {
    const [inst] = ofId(id);
    if (!inst) return run(id, extra);
    inst.restart = { extra };
    stop(id);
    return null;
  }

  return {
    run, stop, write, restart,
    isRunning: (id) => ofId(id).length > 0,
    runningCount: () => running.size,
    // Ao fechar o navegador: nenhum comando fica órfão.
    killAll: () => running.forEach((inst) => platform.killTree(inst.child, 'SIGKILL')),
  };
}

module.exports = { createExecRunner, MAX_RUNNING };
