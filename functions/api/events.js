const GITHUB_API = 'https://api.github.com';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions({ env }) {
  return new Response(null, { headers: corsHeaders(env) });
}

export async function onRequestGet({ env }) {
  const headers = corsHeaders(env);
  try {
    const res = await githubGet(env);
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const data = await res.json();
    const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
    return new Response(content, {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost({ request, env }) {
  const headers = corsHeaders(env);
  try {
    const body    = await request.json();
    const content = JSON.stringify(body, null, 2);
    const encoded = btoa(unescape(encodeURIComponent(content)));

    // Fetch current SHA
    const getRes  = await githubGet(env);
    if (!getRes.ok) throw new Error(`GitHub GET ${getRes.status}`);
    const getData = await getRes.json();

    const putRes = await githubPut(env, encoded, getData.sha);
    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub PUT ${putRes.status}: ${err}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}

function githubGet(env) {
  return fetch(
    `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${env.EVENTS_PATH || 'events.json'}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'feed-abeltomy',
      },
    }
  );
}

function githubPut(env, content, sha) {
  return fetch(
    `${GITHUB_API}/repos/${env.GITHUB_REPO}/contents/${env.EVENTS_PATH || 'events.json'}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'feed-abeltomy',
      },
      body: JSON.stringify({
        message: 'chore: update events',
        content,
        sha,
      }),
    }
  );
}
