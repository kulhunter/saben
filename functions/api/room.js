// GET /api/room?id=SABEN_ROOM_1&playerId=xxx
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const roomId = url.searchParams.get('id') || 'SABEN_ROOM_1';
  const playerId = url.searchParams.get('playerId') || '';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });

  if (!roomData) {
    roomData = { state: 'lobby', players: [], questions: [], currentQ: -1 };
  }

  // Construir respuesta adaptada al jugador
  const resp = {
    state: roomData.state,          // 'lobby' | 'question' | 'reveal' | 'ranking' | 'end'
    players: roomData.players.map(p => ({ name: p.name, score: p.score })),
    currentQ: roomData.currentQ,
    totalQ: roomData.questions ? roomData.questions.length : 0,
  };

  // Si hay pregunta activa, enviamos los datos (sin revelar correcta hasta reveal)
  if (roomData.state === 'question' || roomData.state === 'reveal') {
    const q = roomData.questions && roomData.questions[roomData.currentQ];
    if (q) {
      resp.question = {
        text: q.text,
        options: q.options,               // [{ letter, text, icon }]
        correctLetter: roomData.state === 'reveal' ? q.correctLetter : undefined,
        timeLimit: q.timeLimit || 15,
        startedAt: roomData.questionStartedAt,
        category: q.category || '',
        author: q.author || '',
      };
    }

    // Contar votos para esta pregunta
    if (roomData.answers && roomData.currentQ >= 0) {
      let vc = 0;
      roomData.players.forEach(p => {
        const key = `${roomData.currentQ}_${p.id}`;
        if (roomData.answers[key]) vc++;
      });
      resp.voteCount = vc;
    }

    // ¿Ya respondió este jugador?
    if (playerId && roomData.answers) {
      const key = `${roomData.currentQ}_${playerId}`;
      resp.myAnswer = roomData.answers[key] || null;
    }
  }

  if (roomData.state === 'reveal' || roomData.state === 'ranking' || roomData.state === 'end') {
    resp.scores = roomData.players
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }

  // Para reveal: quién respondió qué
  if (roomData.state === 'reveal' && roomData.answers && roomData.currentQ >= 0) {
    resp.reveals = [];
    roomData.players.forEach(p => {
      const key = `${roomData.currentQ}_${p.id}`;
      const ans = roomData.answers[key];
      if (ans) {
        resp.reveals.push({ name: p.name, letter: ans.letter, correct: ans.correct, pts: ans.pts });
      }
    });
  }

  return new Response(JSON.stringify(resp), { headers });
}
