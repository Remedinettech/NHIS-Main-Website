import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentFileUrl, isSitePath, resolveApiUrl } from './urls';

test('only a path of this site is a site path: no protocol-relative address, no backslash trick, no other scheme', () => {
  for (const accepted of ['/', '/forms', '/forms#orders', '/api/v1/files/abc123DEF456', '/documents/policy/x.pdf']) assert.equal(isSitePath(accepted), true, accepted);
  for (const rejected of ['', 'forms', '//evil.example/x', '/\\evil.example/x', '///evil.example', 'https://example.com/', 'javascript:alert(1)', 'data:text/html,x', ' /forms']) {
    assert.equal(isSitePath(rejected), false, rejected);
  }
});

test('a document file is the API file route under the API base of the deployment, a path of this site or a safe https address', () => {
  assert.equal(documentFileUrl('/api/v1/files/abc123DEF456'), '/api/v1/files/abc123DEF456');
  assert.equal(resolveApiUrl('/api/v1/files/abc123DEF456', '/TNNHISApi/api/v1'), '/TNNHISApi/api/v1/files/abc123DEF456');
  assert.equal(documentFileUrl('/documents/policy/x.pdf'), '/documents/policy/x.pdf');
  assert.equal(documentFileUrl('https://example.com/a.pdf'), 'https://example.com/a.pdf');
});

test('anything else has no file address, so no link is drawn', () => {
  for (const unsafe of ['', 'javascript:alert(1)', 'data:application/pdf;base64,AAAA', '//evil.example/a.pdf', '/\\evil.example/a.pdf', 'http://example.com/a.pdf', 'file:///c:/x.pdf', 'a.pdf']) {
    assert.equal(documentFileUrl(unsafe), undefined, unsafe);
  }
  assert.equal(documentFileUrl(null), undefined);
  assert.equal(documentFileUrl(undefined), undefined);
});
