// Netlify serverless proxy
// Set these in Netlify Environment Variables:
// QUOTEX_CANDLES_ENDPOINT
// QUOTEX_DATA_API_KEY

exports.handler = async function(event) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  };

  const reply = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  if (event.httpMethod !== 'GET') {
    return reply(405, { error: 'Method not allowed' });
  }

  const endpoint = process.env.QUOTEX_CANDLES_ENDPOINT;
  const key = process.env.QUOTEX_DATA_API_KEY;

  if (!endpoint || !key) {
    return reply(503, {
      error: 'Provider not configured. Add QUOTEX_CANDLES_ENDPOINT and QUOTEX_DATA_API_KEY in Netlify environment variables.'
    });
  }

  const p = event.queryStringParameters || {};
  const pair = p.pair || 'EURUSD_otc';
  const tf = p.tf || 'M1';
  const limit = Math.min(500, Math.max(35, Number(p.limit) || 100));

  if (!/^[A-Z0-9_]+$/.test(pair) || !/^M(1|5|15)$/.test(tf)) {
    return reply(400, { error: 'Invalid pair or timeframe' });
  }

  const url = endpoint
    .replaceAll('{pair}', encodeURIComponent(pair))
    .replaceAll('{tf}', encodeURIComponent(tf))
    .replaceAll('{limit}', String(limit));

  try {
    const authHeader = process.env.QUOTEX_AUTH_HEADER || 'Authorization';
    const prefix = process.env.QUOTEX_AUTH_PREFIX ?? 'Bearer';

    const r = await fetch(url, {
      headers: {
        [authHeader]: prefix ? prefix + ' ' + key : key,
        'accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });

    const responseText = await r.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      return reply(502, {
        error: 'Provider returned HTML or invalid JSON (HTTP ' + r.status + '). Check endpoint URL and provider access.'
      });
    }

    if (!r.ok) {
      return reply(r.status, {
        error: data.error || data.message || ('Provider HTTP ' + r.status)
      });
    }

    return reply(200, data);

  } catch (e) {
    return reply(502, {
      error: 'Could not reach candle provider: ' + e.message
    });
  }
};
