import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCookieInput } from './platform-cookies.cjs';

test('recovers Netscape records whose newlines were removed by a legacy input', () => {
  const rows=['.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\tlogin-value', '.example.com\tTRUE\t/\tTRUE\t0\tsessionid\tforeign', '#HttpOnly_.douyin.com\tTRUE\t/\tTRUE\t0\tttwid\tdevice-value'];
  assert.equal(normalizeCookieInput('# Netscape HTTP Cookie File '+rows.join(' '),'douyin').header,'sessionid=login-value; ttwid=device-value');
});

test('plugin JSON and Netscape exports preserve values and isolate platform domains', () => {
  const cookie = { name: 'sessionid', value: 'test-session==', domain: '.douyin.com', httpOnly: true };
  for (const input of [
    JSON.stringify([cookie], null, 2),
    JSON.stringify({ cookies: [cookie], version: 1 }, null, 2),
    JSON.stringify(cookie),
    JSON.stringify({ sessionid: cookie.value }),
    '\uFEFF# Netscape HTTP Cookie File\r\n#HttpOnly_.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\ttest-session==\r\n',
  ]) {
    const result = normalizeCookieInput(input, 'douyin');
    assert.equal(result.header, 'sessionid=test-session==');
    assert.deepEqual(result.names, ['sessionid']);
  }
  const mixed = JSON.stringify({ cookies: [cookie, { ...cookie, domain: '.example.com', value: 'foreign-session' }] });
  assert.equal(normalizeCookieInput(mixed, 'douyin').header, 'sessionid=test-session==');
  for (const invalid of [
    JSON.stringify([{ ...cookie, domain: '.douyin.com.example.com' }]),
    JSON.stringify([{ ...cookie, value: 'bad; injected=value' }]),
    JSON.stringify([{ ...cookie, value: 'bad\r\nInjected: value' }]),
    JSON.stringify({ sessionid: { unexpected: true } }),
    '{"cookies": [',
  ]) assert.throws(() => normalizeCookieInput(invalid, 'douyin'));
});
