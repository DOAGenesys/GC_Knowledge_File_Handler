import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenesysAuthContext } from '../oauth';

// Configure Genesys env BEFORE importing modules that memoize config.
beforeAll(() => {
  process.env.GENESYS_CLIENT_ID = 'cid';
  process.env.GENESYS_REGION = 'mypurecloud.com';
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body == null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

async function fresh() {
  const config = await import('@/server/config');
  config.__resetConfigCache();
  const client = await import('../client');
  const authContext = (): GenesysAuthContext => ({
    accessToken: 'tok-123',
    refreshToken: 'refresh-123',
    expiresAtMs: Date.now() + 3600_000,
    clientId: 'cid',
    regionHost: 'api.mypurecloud.com',
  });
  return {
    listSources: (options?: { pageSize?: number }) =>
      client.listSources(options, { authContext: authContext() }),
    getSource: (sourceId: string) => client.getSource(sourceId, { authContext: authContext() }),
    createSource: (name: string) => client.createSource(name, { authContext: authContext() }),
    resetSource: (sourceId: string, replacementName: string) =>
      client.resetSource(sourceId, replacementName, { authContext: authContext() }),
    startSynchronization: (sourceId: string, type: 'Incremental' | 'Full') =>
      client.startSynchronization(sourceId, type, { authContext: authContext() }),
    requestUploadUrl: (
      sourceId: string,
      synchronizationId: string,
      input: Parameters<typeof client.requestUploadUrl>[2],
    ) =>
      client.requestUploadUrl(sourceId, synchronizationId, input, { authContext: authContext() }),
    patchSynchronization: (
      sourceId: string,
      synchronizationId: string,
      status: 'Completed' | 'Cancelled',
    ) =>
      client.patchSynchronization(sourceId, synchronizationId, status, {
        authContext: authContext(),
      }),
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Default: token endpoint succeeds; API behavior supplied per-test. */
function withToken(apiHandler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation((url: string, init: RequestInit = {}) => {
    if (url.includes('/oauth/token')) {
      return Promise.resolve(
        json(200, { access_token: 'tok-123', token_type: 'bearer', expires_in: 3600 }),
      );
    }
    return Promise.resolve(apiHandler(url, init));
  });
}

describe('Genesys client', () => {
  it('lists and normalizes sources', async () => {
    withToken(() =>
      json(200, {
        entities: [
          { id: 's1', name: 'Support KB', type: 'FileUpload', status: 'Active', documentCount: 12 },
          { id: 's2', name: 'Web', type: 'Web', status: 'Active' },
        ],
      }),
    );
    const client = await fresh();
    const sources = await client.listSources();
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ id: 's1', name: 'Support KB', type: 'FileUpload' });
  });

  it('maps 404 on getSource to SOURCE_NOT_FOUND', async () => {
    withToken(() => json(404, { message: 'not found' }));
    const client = await fresh();
    await expect(client.getSource('11111111-1111-1111-1111-111111111111')).rejects.toMatchObject({
      code: 'SOURCE_NOT_FOUND',
    });
  });

  it('maps 403 to GENESYS_PERMISSION_DENIED', async () => {
    withToken(() => json(403, { message: 'denied' }));
    const client = await fresh();
    await expect(client.listSources()).rejects.toMatchObject({ code: 'GENESYS_PERMISSION_DENIED' });
  });

  it('creates a source (POST FileUpload body, no extra fields)', async () => {
    let sentBody: Record<string, unknown> = {};
    withToken((_url, init) => {
      sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return json(200, { id: 'new-src', name: 'KB', type: 'FileUpload', status: 'Active' });
    });
    const client = await fresh();
    const src = await client.createSource('KB');
    expect(src.id).toBe('new-src');
    expect(sentBody).toMatchObject({ name: 'KB', type: 'FileUpload' });
    // The Genesys File Connector create contract rejects unknown fields (400);
    // ensure we never send a `triggerType`.
    expect(sentBody).not.toHaveProperty('triggerType');
  });

  it('resets a source by deleting the original BEFORE creating the replacement (capacity-safe)', async () => {
    const calls: Array<{ method?: string; path: string; body?: Record<string, unknown> }> = [];
    withToken((url, init) => {
      const path = new URL(url).pathname;
      const body = init.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined;
      calls.push({ method: init.method, path, body });

      if (init.method === 'DELETE' && path === '/api/v2/knowledge/sources/original-src') {
        return json(200, null);
      }
      if (init.method === 'POST' && path === '/api/v2/knowledge/sources') {
        // The replacement is created with the final name directly — no staging
        // name, no rename step.
        expect(body).toMatchObject({ name: 'Worldline', type: 'FileUpload' });
        return json(200, {
          id: 'replacement-src',
          name: 'Worldline',
          type: 'FileUpload',
          status: 'Active',
        });
      }
      return json(500, { message: 'unexpected call' });
    });

    const client = await fresh();
    const result = await client.resetSource('original-src', 'Worldline');

    expect(result).toMatchObject({
      source: { id: 'replacement-src', name: 'Worldline', type: 'FileUpload' },
    });
    // Delete must precede create so the org source slot is freed first.
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v2/knowledge/sources/original-src',
      'POST /api/v2/knowledge/sources',
    ]);
  });

  it('does not create a replacement when the original delete is denied', async () => {
    const calls: Array<{ method?: string; path: string }> = [];
    withToken((url, init) => {
      const path = new URL(url).pathname;
      calls.push({ method: init.method, path });
      if (init.method === 'DELETE' && path === '/api/v2/knowledge/sources/original-src') {
        return json(403, { message: 'delete denied' });
      }
      return json(500, { message: 'unexpected call' });
    });

    const client = await fresh();
    await expect(client.resetSource('original-src', 'Worldline')).rejects.toMatchObject({
      code: 'GENESYS_PERMISSION_DENIED',
    });
    // The create is never attempted when the original could not be deleted.
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v2/knowledge/sources/original-src',
    ]);
  });

  it('treats an already-deleted original as deletable and proceeds to create (retry resilience)', async () => {
    const calls: Array<{ method?: string; path: string }> = [];
    withToken((url, init) => {
      const path = new URL(url).pathname;
      calls.push({ method: init.method, path });
      if (init.method === 'DELETE' && path === '/api/v2/knowledge/sources/original-src') {
        return json(404, { message: 'not found' });
      }
      if (init.method === 'POST' && path === '/api/v2/knowledge/sources') {
        return json(200, {
          id: 'replacement-src',
          name: 'Worldline',
          type: 'FileUpload',
          status: 'Active',
        });
      }
      return json(500, { message: 'unexpected call' });
    });

    const client = await fresh();
    const result = await client.resetSource('original-src', 'Worldline');
    expect(result.source.id).toBe('replacement-src');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v2/knowledge/sources/original-src',
      'POST /api/v2/knowledge/sources',
    ]);
  });

  it('does not create a replacement when the original delete is ambiguous (unknown outcome)', async () => {
    const calls: Array<{ method?: string; path: string }> = [];
    withToken((url, init) => {
      const path = new URL(url).pathname;
      calls.push({ method: init.method, path });
      if (init.method === 'DELETE' && path === '/api/v2/knowledge/sources/original-src') {
        return json(504, { message: 'gateway timeout' });
      }
      return json(500, { message: 'unexpected call' });
    });

    const client = await fresh();
    await expect(client.resetSource('original-src', 'Worldline')).rejects.toMatchObject({
      code: 'SOURCE_DELETE_UNKNOWN',
    });
    // An ambiguous delete must NOT lead to a create (would risk a duplicate).
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'DELETE /api/v2/knowledge/sources/original-src',
    ]);
  });

  it('classifies an ambiguous create timeout as SOURCE_CREATE_UNKNOWN (no blind retry)', async () => {
    const calls: string[] = [];
    withToken((url) => {
      calls.push(url);
      return json(504, { message: 'gateway timeout' });
    });
    const client = await fresh();
    await expect(client.createSource('KB')).rejects.toMatchObject({
      code: 'SOURCE_CREATE_UNKNOWN',
    });
    // Non-idempotent: exactly one API attempt, never retried.
    expect(calls.length).toBe(1);
  });

  it('classifies a thrown create (network) as SOURCE_CREATE_UNKNOWN', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/oauth/token')) {
        return Promise.resolve(json(200, { access_token: 't', token_type: 'b', expires_in: 3600 }));
      }
      return Promise.reject(new Error('socket hang up'));
    });
    const client = await fresh();
    await expect(client.createSource('KB')).rejects.toMatchObject({
      code: 'SOURCE_CREATE_UNKNOWN',
    });
  });

  it('starts a synchronization', async () => {
    withToken(() => json(200, { id: 'sync-1', type: 'Incremental', status: 'InProgress' }));
    const client = await fresh();
    const s = await client.startSynchronization(
      '11111111-1111-1111-1111-111111111111',
      'Incremental',
    );
    expect(s.id).toBe('sync-1');
  });

  it('requests an upload URL and returns the ticket', async () => {
    withToken(() =>
      json(200, { url: 'https://upload.example/abc?sig=xyz', headers: { 'x-amz-acl': 'private' } }),
    );
    const client = await fresh();
    const ticket = await client.requestUploadUrl('11111111-1111-1111-1111-111111111111', 'sync-1', {
      fileName: 'a.txt',
      contentMd5: 'kAFQmDzST7DWlj99KOF/cg==',
    });
    expect(ticket.url).toContain('https://upload.example');
  });

  it('patch Completed maps a timeout to COMPLETION_UNKNOWN', async () => {
    withToken(() => json(504, {}));
    const client = await fresh();
    await expect(
      client.patchSynchronization('11111111-1111-1111-1111-111111111111', 'sync-1', 'Completed'),
    ).rejects.toMatchObject({ code: 'COMPLETION_UNKNOWN' });
  });

  it('retries an idempotent GET on 429 then succeeds', async () => {
    let n = 0;
    withToken(() => {
      n += 1;
      if (n === 1) return json(429, { message: 'slow down' }, { 'retry-after': '0' });
      return json(200, { entities: [{ id: 's1', name: 'KB', type: 'FileUpload' }] });
    });
    const client = await fresh();
    const sources = await client.listSources();
    expect(sources).toHaveLength(1);
    expect(n).toBe(2);
  });

  it('refreshes the token once on 401 then succeeds', async () => {
    let tokenCalls = 0;
    let apiCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/oauth/token')) {
        tokenCalls += 1;
        return Promise.resolve(
          json(200, { access_token: `tok${tokenCalls}`, token_type: 'b', expires_in: 3600 }),
        );
      }
      apiCalls += 1;
      if (apiCalls === 1) return Promise.resolve(json(401, { message: 'expired' }));
      return Promise.resolve(json(200, { entities: [] }));
    });
    const client = await fresh();
    const sources = await client.listSources();
    expect(sources).toEqual([]);
    expect(tokenCalls).toBe(1);
    expect(apiCalls).toBe(2);
  });

  it('re-issues a NON-idempotent write once on 401 (re-auth must not consume the maxAttempts=1 budget)', async () => {
    let apiCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/oauth/token')) {
        return Promise.resolve(
          json(200, { access_token: 'tok', token_type: 'b', expires_in: 3600 }),
        );
      }
      apiCalls += 1;
      if (apiCalls === 1) return Promise.resolve(json(401, { message: 'expired' }));
      return Promise.resolve(
        json(200, { id: 'new-src', name: 'KB', type: 'FileUpload', status: 'Active' }),
      );
    });
    const client = await fresh();
    const src = await client.createSource('KB');
    // The write was re-issued with the fresh token and succeeded — NOT mapped to
    // a retryable SOURCE_CREATE_FAILED (which could drive a duplicate create).
    expect(src.id).toBe('new-src');
    expect(apiCalls).toBe(2);
  });

  it('a second 401 on a write maps to GENESYS_AUTH_FAILED (not status 0)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/oauth/token')) {
        return Promise.resolve(
          json(200, { access_token: 'tok', token_type: 'b', expires_in: 3600 }),
        );
      }
      return Promise.resolve(json(401, { message: 'denied' }));
    });
    const client = await fresh();
    await expect(client.createSource('KB')).rejects.toMatchObject({ code: 'GENESYS_AUTH_FAILED' });
  });
});
