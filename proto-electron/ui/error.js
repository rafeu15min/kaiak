'use strict';
// Tela de erro padrão: recebe ?url=&code=&desc=&upgraded=1. Tudo entra por textContent.
const REASONS = [
  [[-105, -137], 'Não foi possível encontrar o endereço deste servidor. Confira se está escrito certo e se há internet.'],
  [[-102], 'O servidor recusou a conexão (nada está escutando nesse endereço e porta).'],
  [[-106, -109], 'Sem conexão com a internet.'],
  [[-7, -118], 'O servidor demorou demais para responder.'],
  [[-101, -100], 'A conexão foi interrompida.'],
  [[-107, -113, -111], 'Não foi possível negociar uma conexão segura (HTTPS) com este servidor.'],
];

const params = new URLSearchParams(location.search);
const target = params.get('url') || '';
const code = Number(params.get('code'));
let host = target;
try { host = new URL(target).hostname; } catch { /* mantém o texto recebido */ }

// Erros de certificado (-200 a -299): motivo específico. Um erro de certificado NUNCA tem botão "continuar": quem decide é o .lua.
const CERT_REASONS = {
  '-200': 'O certificado foi emitido para OUTRO nome de site. Pode ser um erro de configuração do servidor ou alguém se passando por ele.',
  '-201': 'O certificado está VENCIDO (ou ainda não começou a valer). Confira também a data e a hora do seu computador.',
  '-202': 'O certificado NÃO foi emitido por uma autoridade confiável. É o caso de certificados autoassinados (comum em servidores caseiros) ou de alguém interceptando a conexão.',
  '-206': 'O certificado foi REVOGADO pela autoridade que o emitiu: o site não deve mais ser considerado seguro.',
  '-208': 'O certificado usa um algoritmo de assinatura fraco.',
  '-211': 'O certificado usa uma chave fraca.',
  '-213': 'O certificado tem validade longa demais para ser aceito.',
};

const isCertError = (errorCode) => errorCode <= -200 && errorCode >= -299;

function reasonFor(errorCode) {
  const found = REASONS.find(([codes]) => codes.includes(errorCode));
  if (found) return found[1];
  if (isCertError(errorCode)) return CERT_REASONS[String(errorCode)] ?? 'O certificado deste site é inválido ou não é confiável. Por segurança, o KaiaK não abre a página.';
  return 'Ocorreu um erro de rede ao carregar a página.';
}

document.getElementById('host').textContent = target;
document.getElementById('why').textContent = reasonFor(code);
document.getElementById('code').textContent = `${params.get('desc') || ''} (código ${code})`;
if (params.get('upgraded') === '1') {
  document.getElementById('https').style.display = 'block';
  document.getElementById('how').textContent = `k.security { https_exceptions = { ${JSON.stringify(host)} } }`;
}
if (isCertError(code)) {
  document.getElementById('cert').style.display = 'block';
  document.getElementById('certhow').textContent = `k.security { cert_exceptions = { ${JSON.stringify(host)} } }`;
}
document.getElementById('retry').addEventListener('click', () => { if (/^https?:\/\//.test(target)) location.href = target; });
document.getElementById('back').addEventListener('click', () => history.back());
