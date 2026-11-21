'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registrableDomain, parseList } = require('../src/psl');
const { isThirdParty } = require('../src/security');

test('PSL: domínios comuns, com subdomínios profundos', () => {
  assert.equal(registrableDomain('example.com'), 'example.com');
  assert.equal(registrableDomain('a.b.c.example.com'), 'example.com');
  assert.equal(registrableDomain('www.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(registrableDomain('sga.ciebe.com.br'), 'ciebe.com.br');
  assert.equal(registrableDomain('catalogo.estudesemfronteiras.com'), 'estudesemfronteiras.com');
});

test('PSL: seção privada separa inquilinos (github.io, blogspot, vercel.app)', () => {
  assert.equal(registrableDomain('rafeu15min.github.io'), 'rafeu15min.github.io');
  assert.equal(registrableDomain('a.b.rafeu15min.github.io'), 'rafeu15min.github.io');
  assert.equal(registrableDomain('x.blogspot.com'), 'x.blogspot.com');
  assert.equal(registrableDomain('app.vercel.app'), 'app.vercel.app');
});

test('PSL: curinga e exceção (*.ck, !www.ck)', () => {
  assert.equal(registrableDomain('a.b.ck'), 'a.b.ck');
  assert.equal(registrableDomain('www.ck'), 'www.ck');
  assert.equal(registrableDomain('x.www.ck'), 'www.ck');
});

test('PSL: o próprio sufixo, IP, IPv6 e nome sem ponto voltam intactos; ponto final e maiúsculas', () => {
  assert.equal(registrableDomain('co.uk'), 'co.uk');
  assert.equal(registrableDomain('127.0.0.1'), '127.0.0.1');
  assert.equal(registrableDomain('[::1]'), '[::1]');
  assert.equal(registrableDomain('nas'), 'nas');
  assert.equal(registrableDomain('WWW.Example.COM.'), 'example.com');
});

test('PSL: domínio internacional (regra em unicode casa com o host em punycode)', () => {
  assert.equal(registrableDomain('sub.xn--80asehdb'), 'sub.xn--80asehdb'.split('.').slice(-2).join('.'));
  const list = parseList('// c\nxn--p1ai\n');
  assert.equal(registrableDomain('a.b.xn--p1ai', list), 'b.xn--p1ai');
  const uni = parseList('рф\n');
  assert.equal(registrableDomain('a.b.xn--p1ai', uni), 'b.xn--p1ai');
});

test('PSL: sem regras, o padrão é 2 rótulos', () => {
  assert.equal(registrableDomain('a.b.example.com', parseList('')), 'example.com');
});

test('isThirdParty usa a PSL: dois inquilinos do github.io são sites diferentes', () => {
  assert.equal(isThirdParty('https://a.github.io/x.js', 'https://b.github.io/'), true);
  assert.equal(isThirdParty('https://cdn.example.co.uk/x', 'https://www.example.co.uk/'), false);
  assert.equal(isThirdParty('https://other.co.uk/x', 'https://example.co.uk/'), true);
});
