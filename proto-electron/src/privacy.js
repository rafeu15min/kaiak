'use strict';
// Privacidade nativa do Electron aplicada a cada página.
// Mesma política do Qt (WebRTCPublicInterfacesOnly): não expõe o IP local por WebRTC.
// Cookies de terceiros, HTTPS, permissões e referrer: ver security.js. Anúncios/rastreadores: ainda não.
function applyPagePrivacy(webContents) {
  webContents.setWebRTCIPHandlingPolicy('default_public_interface_only');
}

module.exports = { applyPagePrivacy };
