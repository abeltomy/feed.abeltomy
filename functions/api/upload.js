const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions({ env }) {
  return new Response(null, { headers: corsHeaders(env) });
}

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);

  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return new Response(JSON.stringify({ error: 'File type not allowed' }), {
        status: 415,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'File too large (max 100 MB)' }), {
        status: 413,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

    await env.R2.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const url = `${env.SITE_URL || ''}/media/${key}`;

    return new Response(JSON.stringify({ url, key }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
