// POST /api/create — Crear sala con PIN único
// Body: { hostKey }
// Returns: { success, pin }
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await request.json();
    const hostKey = data.hostKey || '';
    const validKey = env.HOST_KEY || 'SABEN2025';

    if (hostKey !== validKey) {
      return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 403, headers });
    }

    // Generar PIN único (intentar hasta 10 veces)
    let pin, existing;
    for (let attempt = 0; attempt < 10; attempt++) {
      pin = Math.floor(1000 + Math.random() * 9000).toString();
      existing = await env.SABEN_DB.get(pin, { type: 'json' });
      if (!existing) break;
      if (attempt === 9) existing = true; // marcamos fallo
    }

    if (existing) {
      return new Response(JSON.stringify({ error: 'No se pudo generar PIN único, intenta de nuevo' }), { status: 500, headers });
    }

    // Crear sala vacía con TTL de 24 horas
    const roomData = {
      state: 'lobby',
      players: [],
      questions: [],
      currentQ: -1,
      answers: {},
      questionnaire: {},
      createdAt: Date.now(),
    };

    await env.SABEN_DB.put(pin, JSON.stringify(roomData), { expirationTtl: 86400 });

    return new Response(JSON.stringify({ success: true, pin }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
