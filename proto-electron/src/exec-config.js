'use strict';
// k.exec("id", { cmd, args, cwd, env, stdin, timeout_ms, shell, output, max_output_kb, on_exit, on_output }): comandos da MÁQUINA que
// só o .lua dispara (nunca um site). Módulo puro: valida cada entrada e devolve { id: spec } já com os padrões.
const { applyOps } = require('./ordered-ops');
const { suggest } = require('./config-keys');
const { isAbsoluteShell } = require('./exec-platform');

const EXEC_ID = /^[A-Za-z][\w-]*$/;
const FIELDS = ['cmd', 'args', 'cwd', 'env', 'stdin', 'timeout_ms', 'shell', 'service', 'output', 'max_output_kb', 'on_exit', 'on_output', 'on_error_output',
  'on_output_budget_ms', 'on_output_queue_max', 'timeout_check', 'timeout_max_ms', 'stuck_cpu', 'stuck_window_s', 'max_cpu', 'max_cpu_for_s', 'max_memory_mb'];
const OUTPUTS = ['none', 'notify'];
const LIMITS = { timeout_ms: [100, 3_600_000], max_output_kb: [1, 4096], on_output_budget_ms: [1, 50], max_cpu_for_s: [1, 3600], max_memory_mb: [16, 65_536], on_output_queue_max: [100, 1_000_000], timeout_max_ms: [1000, 86_400_000], stuck_window_s: [1, 60] };
const CPU_PATTERN = /^(\d{2,4})%$/; // "90%" = 90% de UM núcleo (como o top); acima de 100% vale para vários núcleos
const DEFAULTS = { args: [], timeout_ms: 30_000, shell: false, service: false, output: 'none', max_output_kb: 256, on_output_budget_ms: 2, on_output_queue_max: 20_000, timeout_check: true, timeout_max_ms: 600_000, stuck_cpu: '50%', stuck_window_s: 3, max_cpu_for_s: 10 };
const MAX_ARGS = 64;
const MAX_ARG_LEN = 4096;
const MAX_ENV = 64;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isText = (v) => typeof v === 'string' && v !== '';
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Cada verificação devolve o problema (texto) ou null.
const cpuProblem = (v) => {
  const percent = typeof v === 'string' ? Number(CPU_PATTERN.exec(v)?.[1]) : NaN;
  return percent >= 10 && percent <= 1600 ? null : 'texto em % de 10% a 1600% (ex.: "90%": um núcleo)';
};

const CHECKS = {
  cmd: (v) => (isText(v) && v.length <= MAX_ARG_LEN && !v.includes('\0') ? null : 'texto não vazio (o executável, ou a linha de shell com shell = true)'),
  args: (v) => (Array.isArray(v) && v.length <= MAX_ARGS && v.every((a) => ['string', 'number'].includes(typeof a) && String(a).length <= MAX_ARG_LEN && !String(a).includes('\0'))
    ? null : `lista de até ${MAX_ARGS} textos ou números`),
  cwd: (v) => (isText(v) && !v.includes('\0') ? null : 'texto (pasta; "~/x" vale)'),
  env: (v) => (isPlain(v) && Object.keys(v).length <= MAX_ENV && Object.entries(v).every(([k, x]) => ENV_NAME.test(k) && ['string', 'number'].includes(typeof x) && !String(x).includes('\0'))
    ? null : `tabela { NOME = "valor" } de até ${MAX_ENV} variáveis`),
  stdin: (v) => (typeof v === 'string' && v.length <= 1_000_000 ? null : 'texto de até 1 MB'),
  timeout_ms: (v) => (Number.isInteger(v) && v >= LIMITS.timeout_ms[0] && v <= LIMITS.timeout_ms[1] ? null : `inteiro em ms de ${LIMITS.timeout_ms[0]} a ${LIMITS.timeout_ms[1]}`),
  shell: (v) => (typeof v === 'boolean' || (isText(v) && isAbsoluteShell(v) && !v.includes('\0')) ? null : 'true, false ou o caminho absoluto de um shell ("/bin/bash" ou "C:\\Git\\bin\\bash.exe")'),
  service: (v) => (typeof v === 'boolean' ? null : 'true ou false'),
  output: (v) => (OUTPUTS.includes(v) ? null : `um de ${OUTPUTS.join(', ')}`),
  max_output_kb: (v) => (Number.isInteger(v) && v >= LIMITS.max_output_kb[0] && v <= LIMITS.max_output_kb[1] ? null : `inteiro em KB de ${LIMITS.max_output_kb[0]} a ${LIMITS.max_output_kb[1]}`),
  on_exit: (v) => (typeof v === 'function' ? null : 'função(code, output)'),
  on_error_output: (v) => (typeof v === 'function' ? null : 'função(linha)'),
  on_output_budget_ms: (v) => (Number.isInteger(v) && v >= LIMITS.on_output_budget_ms[0] && v <= LIMITS.on_output_budget_ms[1] ? null : `inteiro em ms de ${LIMITS.on_output_budget_ms[0]} a ${LIMITS.on_output_budget_ms[1]}`),
  on_output_queue_max: (v) => (Number.isInteger(v) && v >= LIMITS.on_output_queue_max[0] && v <= LIMITS.on_output_queue_max[1] ? null : `inteiro de ${LIMITS.on_output_queue_max[0]} a ${LIMITS.on_output_queue_max[1]} (linhas pendentes)`),
  timeout_check: (v) => (typeof v === 'boolean' ? null : 'true ou false'),
  timeout_max_ms: (v) => (Number.isInteger(v) && v >= LIMITS.timeout_max_ms[0] && v <= LIMITS.timeout_max_ms[1] ? null : `inteiro em ms de ${LIMITS.timeout_max_ms[0]} a ${LIMITS.timeout_max_ms[1]}`),
  stuck_window_s: (v) => (Number.isInteger(v) && v >= LIMITS.stuck_window_s[0] && v <= LIMITS.stuck_window_s[1] ? null : `inteiro em s de ${LIMITS.stuck_window_s[0]} a ${LIMITS.stuck_window_s[1]}`),
  stuck_cpu: (v) => cpuProblem(v),
  max_cpu: (v) => cpuProblem(v),
  max_cpu_for_s: (v) => (Number.isInteger(v) && v >= LIMITS.max_cpu_for_s[0] && v <= LIMITS.max_cpu_for_s[1] ? null : `inteiro em s de ${LIMITS.max_cpu_for_s[0]} a ${LIMITS.max_cpu_for_s[1]}`),
  max_memory_mb: (v) => (Number.isInteger(v) && v >= LIMITS.max_memory_mb[0] && v <= LIMITS.max_memory_mb[1] ? null : `inteiro em MB de ${LIMITS.max_memory_mb[0]} a ${LIMITS.max_memory_mb[1]}`),
  on_output: (v) => (typeof v === 'function' ? null : 'função(linha)'),
};

// Devolve o spec limpo, ou null (entrada ignorada, com aviso).
function checkExec(id, spec, warnings) {
  const where = `exec.${id}`;
  const unknown = Object.keys(spec).filter((key) => !FIELDS.includes(key));
  unknown.forEach((key) => {
    const hint = suggest(key, FIELDS);
    warnings.push(`chave desconhecida "${where}.${key}" ignorada${hint ? ` (quis dizer "${hint}"?)` : ''}`);
  });
  if (spec.cmd === undefined) {
    warnings.push(`"${where}" incompleto (falta: cmd): ignorado`);
    return null;
  }
  const out = { ...DEFAULTS, args: [] };
  for (const field of FIELDS.filter((f) => spec[f] !== undefined)) {
    const problem = CHECKS[field](spec[field]);
    if (problem && field === 'cmd') {
      warnings.push(`"${where}.cmd" inválido: ${problem}; ignorado`);
      return null;
    }
    if (problem) warnings.push(`"${where}.${field}" inválido: ${problem}; usando o padrão`);
    else out[field] = spec[field];
  }
  out.cmd = spec.cmd;
  if (out.service && spec.timeout_ms !== undefined) warnings.push(`"${where}": com service = true não há prazo; "timeout_ms" é ignorado (quem encerra é h:stop() ou o vigia max_cpu/max_memory_mb)`);
  if (out.timeout_max_ms < out.timeout_ms && !out.service) {
    warnings.push(`"${where}.timeout_max_ms" (${out.timeout_max_ms}) menor que timeout_ms (${out.timeout_ms}): o teto vale o próprio timeout_ms`);
    out.timeout_max_ms = out.timeout_ms;
  }
  if (out.shell && out.args.length > 0) {
    warnings.push(`"${where}": com shell = true, "cmd" é a linha de shell inteira e "args" é ignorado (monte a linha no cmd)`);
    out.args = [];
  }
  out.args = out.args.map(String);
  if (out.env) out.env = Object.fromEntries(Object.entries(out.env).map(([k, v]) => [k, String(v)]));
  return out;
}

// ops: lista de operações do Lua [{ id, spec }]. Devolve { id: spec } em ordem de declaração.
function buildExec(ops, warnings) {
  const map = new Map();
  applyOps(map, ops, { idPattern: EXEC_ID, noun: 'exec', path: 'exec', replace: ['args', 'env'], warnings });
  const out = {};
  for (const [id, spec] of map) {
    const clean = checkExec(id, spec, warnings);
    if (clean) out[id] = clean;
  }
  return out;
}

module.exports = { buildExec, checkExec, EXEC_ID, DEFAULTS, FIELDS };
