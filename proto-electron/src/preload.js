'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Ponte mínima e fechada entre a interface (trilho/barra) e o processo principal.
const SEND = new Set(['tab:select', 'tab:close', 'tab:new', 'nav:go', 'nav:back', 'nav:forward',
  'nav:reload', 'slot:expand', 'button:click', 'find:query', 'find:step', 'find:close', 'find:options', 'print:save', 'print:system', 'print:close', 'notify:dismiss', 'notify:dismiss-all']);
const RECEIVE = new Set(['state', 'focus-address', 'config', 'theme', 'find:template', 'print:template', 'find:focus', 'find:state', 'slot', 'panel', 'buttons', 'notify:render']);

contextBridge.exposeInMainWorld('kaiak', {
  send: (channel, ...args) => { if (SEND.has(channel)) ipcRenderer.send(channel, ...args); },
  on: (channel, callback) => {
    if (RECEIVE.has(channel)) ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
});
