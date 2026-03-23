export interface Env {
  OFFICES: KVNamespace;
  DIRECTORY_TOKEN: string;
}

export interface OfficeRecord {
  id: string;
  name: string;
  wsUrl: string;
  registeredAt: string;
  lastSeenAt: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.DIRECTORY_TOKEN) return true; // No token configured = open
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${env.DIRECTORY_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // GET /offices/:id — single office lookup
    if (method === 'GET' && url.pathname.startsWith('/offices/')) {
      const id = url.pathname.slice('/offices/'.length);
      if (!id) return jsonResponse({ error: 'Missing id' }, 400);
      const value = await env.OFFICES.get(id);
      if (!value) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse(JSON.parse(value) as OfficeRecord);
    }

    // GET /offices — list all
    if (method === 'GET' && url.pathname === '/offices') {
      const list = await env.OFFICES.list();
      const offices: OfficeRecord[] = [];
      for (const key of list.keys) {
        const value = await env.OFFICES.get(key.name);
        if (value) {
          offices.push(JSON.parse(value) as OfficeRecord);
        }
      }
      return jsonResponse(offices);
    }

    // PUT /offices/:id — register
    if (method === 'PUT' && url.pathname.startsWith('/offices/')) {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const id = url.pathname.slice('/offices/'.length);
      if (!id) return jsonResponse({ error: 'Missing id' }, 400);
      const body = (await request.json()) as { name?: string; wsUrl?: string };
      if (!body.wsUrl) return jsonResponse({ error: 'Missing wsUrl' }, 400);

      const existing = await env.OFFICES.get(id);
      const prev = existing ? (JSON.parse(existing) as OfficeRecord) : null;
      const record: OfficeRecord = {
        id,
        name: body.name ?? prev?.name ?? id,
        wsUrl: body.wsUrl,
        registeredAt: prev?.registeredAt ?? new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      // TTL: auto-expire after 24 hours if not refreshed
      await env.OFFICES.put(id, JSON.stringify(record), { expirationTtl: 86400 });
      return jsonResponse(record);
    }

    // DELETE /offices/:id — deregister
    if (method === 'DELETE' && url.pathname.startsWith('/offices/')) {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const id = url.pathname.slice('/offices/'.length);
      if (!id) return jsonResponse({ error: 'Missing id' }, 400);
      await env.OFFICES.delete(id);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
