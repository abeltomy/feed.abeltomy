// Serves and deletes R2 media objects.
// Route: /media/* (wildcard matches nested paths too)

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function getKey(params) {
  // params.key is an array of path segments for [[key]] wildcard
  return Array.isArray(params.key) ? params.key.join('/') : params.key || '';
}

export async function onRequestOptions({ env }) {
  return new Response(null, { headers: corsHeaders(env) });
}

export async function onRequestGet({ params, env }) {
  const headers = corsHeaders(env);
  const key = getKey(params);

  if (!key) return new Response('Not found', { status: 404, headers });

  const obj = await env.R2.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers });

  return new Response(obj.body, {
    headers: {
      ...headers,
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export async function onRequestDelete({ params, env }) {
  const headers = corsHeaders(env);
  const key = getKey(params);

  if (!key) return new Response(JSON.stringify({ error: 'No key' }), { status: 400, headers });

  await env.R2.delete(key);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
