const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(fetch, profile = {}) {
  let changed;
  const sandbox = {
    URL, AbortController, setTimeout, clearTimeout,
    chrome: { storage: {
      local: { get: (_key, cb) => cb({ aiProviderSettings: { local: { model: 'test', ...profile } } }) },
      onChanged: { addListener: cb => { changed = cb; } },
    } }, fetch,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/background/aiProviders.js', 'utf8') + '\nglobalThis.api = aiProviders;', sandbox);
  return { api: sandbox.api, change: () => changed({ aiProviderSettings: {} }) };
}
const response = content => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] }) });

test('preserves paragraph shape, whitespace, placeholders and request parameters', async () => {
  let calls = 0;
  const { api } = setup(async (url, options) => {
    calls++;
    assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'test');
    assert.deepEqual(JSON.parse(body.messages[1].content), ['Hello @%0#$', 'World']);
    return response(['你好 @%0#$', '世界']);
  });
  const source = [['Hello @%0#$', '  '], [], ['World']];
  assert.equal(JSON.stringify(await api.translate('local', 'auto', 'zh-CN', source)), JSON.stringify([['你好 @%0#$', '  '], [], ['世界']]));
  await api.translate('local', 'auto', 'zh-CN', source);
  assert.equal(calls, 1);
});

test('rejects remote HTTP and embedded credentials before sending a request', async () => {
  const { api } = setup(() => { throw new Error('must not fetch'); });
  assert.throws(() => api.endpoint('http://example.com/v1'), /HTTPS/);
  assert.throws(() => api.endpoint('https://user:password@example.com/v1'), /密码/);
  assert.throws(() => api.endpoint('https://example.com/v1?key=secret'), /查询/);
  assert.equal(api.endpoint('https://example.com/v1/chat/completions/'), 'https://example.com/v1/chat/completions');
});

test('rejects malformed, mismatched, empty and truncated model output', async () => {
  const { api } = setup(async () => response(['only one']));
  await assert.rejects(api.translate('local', 'auto', 'zh-CN', [['one', 'two']]), /数量/);
  assert.throws(() => api.parse('[""]', 1), /格式/);
  assert.throws(() => api.parse('Explanation instead of JSON', 1), /JSON/);
  assert.equal(JSON.stringify(api.parse('```json\n["你好"]\n```', 1)), '["你好"]');
  const other = setup(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '["partial"]' } }] }) }));
  await assert.rejects(other.api.translate('local', 'auto', 'zh-CN', [['one']]), /不完整/);
});

test('limits concurrent API calls and deduplicates identical work', async () => {
  let active = 0, peak = 0, calls = 0;
  const { api } = setup(async (_url, options) => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return response(JSON.parse(JSON.parse(options.body).messages[1].content));
  });
  await Promise.all([0, 1, 2, 3, 3].map(i => api.translate('local', 'auto', 'zh-CN', [[String(i)]])));
  assert.equal(peak, 2);
  assert.equal(calls, 4);
});

test('incognito requests bypass shared cache and settings changes invalidate it', async () => {
  let calls = 0;
  const { api, change } = setup(async () => { calls++; return response(['你好']); });
  const run = privateMode => api.translate('local', 'auto', 'zh-CN', [['Hello']], privateMode);
  await run(false); await run(false); assert.equal(calls, 1);
  await run(true); await run(true); assert.equal(calls, 3);
  change(); await run(false); assert.equal(calls, 4);
});

test('batching reconstructs rows and HTTP errors do not leak server response bodies', async () => {
  let calls = 0;
  const { api } = setup(async (_url, options) => {
    calls++;
    const input = JSON.parse(JSON.parse(options.body).messages[1].content);
    assert.ok(input.length <= 12);
    return response(input.map(text => `译:${text}`));
  });
  const rows = [Array.from({ length: 13 }, (_, i) => String(i)), ['last']];
  const translated = await api.translate('local', 'auto', 'zh-CN', rows);
  assert.equal(calls, 2);
  assert.equal(translated[0].length, 13);
  assert.equal(translated[1][0], '译:last');
  const failed = setup(async () => ({ ok: false, status: 401, json: async () => ({ secret: 'private body' }) }));
  await assert.rejects(failed.api.translate('local', 'auto', 'zh-CN', [['hello']]), /HTTP 401/);
});
