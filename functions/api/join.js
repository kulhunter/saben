// POST /api/join
// Body: { name: string, roomId: string, answers: object }
export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await request.json();
    const roomId = data.roomId || 'SABEN_ROOM_1';
    const playerName = (data.name || '').trim();

    if (!playerName) {
      return new Response(JSON.stringify({ error: 'Falta el apodo' }), { status: 400, headers });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData) {
      roomData = { state: 'lobby', players: [], questions: [], currentQ: -1, answers: {} };
    }

    // Evita duplicados (por si el jugador recarga)
    const existing = roomData.players.find(
      p => p.name.toLowerCase() === playerName.toLowerCase()
    );

    const playerId = playerName.toLowerCase().replace(/\s+/g, '_');

    if (!existing) {
      roomData.players.push({ name: playerName, id: playerId, score: 0, answered: false });
    }

    // Guardar respuestas del cuestionario si vienen
    if (data.questionnaire) {
      if (!roomData.questionnaire) roomData.questionnaire = {};
      roomData.questionnaire[playerId] = {
        playerName,
        answers: data.questionnaire,
        ts: Date.now(),
      };
    }

    await env.SABEN_DB.put(roomId, JSON.stringify(roomData));

    return new Response(
      JSON.stringify({ success: true, playerId, state: roomData.state }),
      { headers }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Error en el servidor', detail: err.message }), {
      status: 500,
      headers,
    });
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
