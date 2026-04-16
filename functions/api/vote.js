// POST /api/vote
// Body: { roomId, playerId, letter }
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await request.json();
    const roomId = data.roomId || 'SABEN_ROOM_1';
    const { playerId, letter } = data;

    if (!playerId || !letter) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData || roomData.state !== 'question') {
      return new Response(JSON.stringify({ error: 'No hay pregunta activa' }), { status: 409, headers });
    }

    const qIndex = roomData.currentQ;
    const ansKey = `${qIndex}_${playerId}`;

    // Sólo se vota una vez
    if (roomData.answers && roomData.answers[ansKey]) {
      return new Response(JSON.stringify({ already: true }), { headers });
    }

    const q = roomData.questions[qIndex];
    const correct = letter === q.correctLetter;

    // Puntos: 1000 máx, decrece linealmente con el tiempo (mín 100 si respondió)
    const elapsed = (Date.now() - roomData.questionStartedAt) / 1000;
    const timeLimit = q.timeLimit || 15;
    const factor = Math.max(0, 1 - elapsed / timeLimit);
    const pts = correct ? Math.round(100 + factor * 900) : 0;

    if (!roomData.answers) roomData.answers = {};
    roomData.answers[ansKey] = { letter, correct, pts, ts: Date.now() };

    // Sumar puntos al jugador
    const player = roomData.players.find(p => p.id === playerId);
    if (player) {
      player.score += pts;
      player.answered = true;
    }

    await env.SABEN_DB.put(roomId, JSON.stringify(roomData));

    return new Response(JSON.stringify({ success: true, correct, pts }), { headers });
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
