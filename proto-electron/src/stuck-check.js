'use strict';
// Gatilho do prazo: quando timeout_ms estoura, em vez de matar às cegas, classifica o comando como SAUDÁVEL ou ENROSCADO olhando uma
// janela curta de amostras. Puro (sem processos). samples = [{ at (ms), out (bytes de saída acumulados), ticks, io (bytes lidos+gravados), pids }].
const IO_PROGRESS_BYTES = 4096; // abaixo disso é ruído de processo ocioso
const HZ_DEFAULT = 100;

const sameSet = (a, b) => a.length === b.length && a.every((pid) => b.includes(pid));

// Devolve { healthy, reason, cpu }. Sinais de progresso (qualquer um basta): saída nova, I/O, árvore de filhos mudou.
// Sem progresso: CPU alta = girando; CPU baixa = parado (deadlock/espera eterna).
function classify(samples, { stuckCpu = 50, hz = HZ_DEFAULT } = {}) {
  const first = samples[0];
  const last = samples.at(-1);
  const seconds = Math.max((last.at - first.at) / 1000, 0.001);
  const cpu = Math.round(((last.ticks - first.ticks) / hz / seconds) * 100);
  const window = `${Math.round(seconds)} s`;
  if (last.out > first.out) return { healthy: true, cpu, reason: `saída nova (${last.out - first.out} bytes em ${window})` };
  if (last.io - first.io >= IO_PROGRESS_BYTES) return { healthy: true, cpu, reason: `I/O em andamento (${last.io - first.io} bytes em ${window})` };
  if (!sameSet(first.pids, last.pids)) return { healthy: true, cpu, reason: 'processos filhos mudaram' };
  if (cpu >= stuckCpu) return { healthy: false, cpu, reason: `enroscado: CPU ${cpu}% sem saída nem I/O por ${window}` };
  return { healthy: false, cpu, reason: `enroscado: parado, sem saída, I/O nem CPU (${cpu}%) por ${window}` };
}

module.exports = { classify, IO_PROGRESS_BYTES };
