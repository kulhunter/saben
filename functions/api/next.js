// POST /api/next — Avanzar: reveal → ranking/next question
// Body: { roomId, hostKey, action: 'reveal' | 'next' }
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await request.json();
    const roomId = data.roomId || 'SABEN_ROOM_1';
    const action = data.action || 'reveal'; // 'reveal' | 'next'
    const hostKey = data.hostKey || '';
    const validKey = env.HOST_KEY || 'SABEN2025';

    if (hostKey !== validKey) {
      return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 403, headers });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada' }), { status: 404, headers });
    }

    if (action === 'reveal') {
      // question → reveal
      if (roomData.state !== 'question') {
        return new Response(JSON.stringify({ error: 'Estado incorrecto' }), { status: 409, headers });
      }
      roomData.state = 'reveal';
      // Resetear answered
      roomData.players.forEach(p => { p.answered = false; });

    } else if (action === 'next') {
      if (roomData.state === 'reveal') {
        roomData.state = 'ranking';
      } else if (roomData.state === 'ranking') {
        const nextIndex = roomData.currentQ + 1;
        if (nextIndex < roomData.questions.length) {
          roomData.currentQ = nextIndex;
          roomData.state = 'question';
          roomData.questionStartedAt = Date.now();
          roomData.players.forEach(p => { p.answered = false; });
        } else {
          roomData.state = 'end';
        }
      }

    } else if (action === 'ranking') {
      roomData.state = 'ranking';
    } else if (action === 'regenerate') {
      // Nueva ronda: mantener jugadores y cuestionarios, resetear puntajes
      roomData.state = 'lobby';
      roomData.currentQ = -1;
      roomData.answers = {};
      roomData.questions = [];
      roomData.players.forEach(p => { p.score = 0; p.answered = false; });
    } else if (action === 'reset') {
      // Reiniciar la sala completamente
      roomData = { state: 'lobby', players: [], questions: [], currentQ: -1, answers: {}, questionnaire: {} };
    }

    await env.SABEN_DB.put(roomId, JSON.stringify(roomData));

    return new Response(JSON.stringify({ success: true, state: roomData.state }), { headers });
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
