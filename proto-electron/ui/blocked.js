'use strict';
// Página de bloqueio: recebe ?url=...&kind=malware|user e mostra o motivo. Tudo entra por textContent.
const REASONS = {
  malware: 'Este domínio está na lista de malware e phishing (o que o Safe Browsing faria, só que local, sem enviar nada a ninguém).',
  user: 'Você bloqueou este domínio em k.blocking.block no seu kaiak.lua.',
};

const params = new URLSearchParams(location.search);
const target = params.get('url') || '';
let host = target;
try { host = new URL(target).hostname; } catch { /* mantém o texto recebido */ }

document.getElementById('host').textContent = host;
document.getElementById('why').textContent = REASONS[params.get('kind')] ?? 'Este domínio está bloqueado.';
document.getElementById('how').textContent = `k.blocking { allow = { ${JSON.stringify(host)} } }`;
document.getElementById('back').addEventListener('click', () => history.back());
