import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAdminConfig } from '../admin/config';
import { buildClearCookie, buildSessionCookie } from '../admin/cookies';

test('defaults keep the host-only cookie with Path=/ in production', () => {
  const config = loadAdminConfig({ NODE_ENV: 'production' });
  assert.equal(config.cookieName, '__Host-nhis_admin_session');
  assert.equal(config.cookiePath, '/');
  const cookie = buildSessionCookie('x'.repeat(30), 60, config);
  assert.match(cookie, /^__Host-nhis_admin_session=/);
  assert.match(cookie, /Path=\/;/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test('behind IIS the cookie uses an application-specific name and the external API path, still Secure and HttpOnly', () => {
  const config = loadAdminConfig({ NODE_ENV: 'production', ADMIN_COOKIE_NAME: 'tnnhis_admin_session', ADMIN_COOKIE_PATH: '/TNNHISApi' });
  assert.equal(config.cookieName, 'tnnhis_admin_session', 'no __Host- prefix with a narrower path');
  const cookie = buildSessionCookie('y'.repeat(30), 60, config);
  assert.match(cookie, /^tnnhis_admin_session=/);
  assert.match(cookie, /Path=\/TNNHISApi;/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  const cleared = buildClearCookie(config);
  assert.match(cleared, /Path=\/TNNHISApi;/);
  assert.match(cleared, /Max-Age=0/);
});

test('unsafe cookie names and paths fall back to safe defaults', () => {
  for (const bad of ['/a b', '/x;y', 'relative', '//evil', '/a\r\nSet-Cookie: x=1']) {
    assert.equal(loadAdminConfig({ ADMIN_COOKIE_PATH: bad }).cookiePath, '/', bad);
  }
  for (const bad of ['a b', 'x;y', 'a=b', '', 'ab']) {
    assert.equal(loadAdminConfig({ ADMIN_COOKIE_NAME: bad }).cookieName, 'nhis_admin_session', bad);
  }
});

test('external origins and proxy hops are read explicitly', () => {
  const config = loadAdminConfig({ ADMIN_ALLOWED_ORIGINS: 'https://3.109.241.251, https://example.org/path', ADMIN_TRUSTED_PROXY_HOPS: '1' });
  assert.deepEqual([...config.allowedOrigins], ['https://3.109.241.251', 'https://example.org']);
  assert.equal(config.trustedProxyHops, 1);
});
