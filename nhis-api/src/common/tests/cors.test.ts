import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedOrigin, isPublicApiPath, loadPublicCorsConfig, mergeVary, normalizeOrigin, preflightHeaders, requestedHeadersAllowed,
} from '../cors';

const config = loadPublicCorsConfig({ PUBLIC_API_ALLOWED_ORIGINS: 'https://www.tn-nhis.net, https://tn-nhis.net/ignored-path , *, ftp://x, not a url' });

test('allowlist is parsed explicitly: wildcard, other schemes and junk are dropped, paths are stripped', () => {
  assert.deepEqual([...config.allowedOrigins].sort(), ['https://tn-nhis.net', 'https://www.tn-nhis.net']);
  assert.equal(loadPublicCorsConfig({}).allowedOrigins.size, 0);
  assert.equal(loadPublicCorsConfig({ PUBLIC_API_ALLOWED_ORIGINS: '*' }).allowedOrigins.size, 0);
});

test('only exact allowlisted origins are allowed (no reflection, no look-alikes)', () => {
  assert.equal(allowedOrigin('https://www.tn-nhis.net', config), 'https://www.tn-nhis.net');
  for (const bad of [null, 'null', 'http://www.tn-nhis.net', 'https://www.tn-nhis.net:8443', 'https://evil.com', 'https://www.tn-nhis.net.evil.com',
    'https://www.tn-nhis.net/', 'https://WWW.tn-nhis.net.evil.com', 'https://sub.www.tn-nhis.net']) {
    assert.equal(allowedOrigin(bad, config), undefined, String(bad));
  }
  assert.equal(normalizeOrigin('https://user:pw@www.tn-nhis.net'), undefined);
});

test('admin API paths never take part in public CORS', () => {
  assert.equal(isPublicApiPath('/api/v1/site'), true);
  assert.equal(isPublicApiPath('/api/v1/files/abc'), true);
  assert.equal(isPublicApiPath('/api/v1/admin'), false);
  assert.equal(isPublicApiPath('/api/v1/admin/auth/login'), false);
  assert.equal(isPublicApiPath('/api/v1/administrators'), true, 'only the admin path segment is excluded');
  assert.equal(isPublicApiPath('/other'), false);
});

test('Vary merging keeps existing tokens and adds Origin once', () => {
  assert.equal(mergeVary(null), 'Origin');
  assert.equal(mergeVary('rsc, next-router-state-tree'), 'rsc, next-router-state-tree, Origin');
  assert.equal(mergeVary('Accept-Encoding, origin'), 'Accept-Encoding, origin');
  assert.equal(mergeVary('*'), '*');
});

test('preflight allows GET/HEAD only and a fixed header list; credentials are never allowed', () => {
  const headers = preflightHeaders('https://www.tn-nhis.net');
  assert.equal(headers['Access-Control-Allow-Methods'], 'GET, HEAD, OPTIONS');
  assert.equal(Object.keys(headers).some((h) => h.toLowerCase() === 'access-control-allow-credentials'), false);
  assert.equal(requestedHeadersAllowed('content-type, If-None-Match'), true);
  assert.equal(requestedHeadersAllowed('x-csrf-token'), false);
  assert.equal(requestedHeadersAllowed('authorization'), false);
});
