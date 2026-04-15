export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const data = await request.json();
    const roomId = data.roomId || 'SABEN_ROOM_1';
    const playerName = data.name;

    if (!playerName) {
      return new Response(JSON.stringify({ error: 'Falta el nombre' }), { status: 400 });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData) {
      roomData = { state: 'lobby', players: [], current_question: null };
    }

    // Agregamos al jugador si no existe ya en la sala
    const playerExists = roomData.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (!playerExists) {
      roomData.players.push({ name: playerName, score: 0 });
      // Guardamos la sala actualizada en KV
      await env.SABEN_DB.put(roomId, JSON.stringify(roomData));
    }

    return new Response(JSON.stringify({ success: true, message: '¡Estás dentro!' }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Error en el servidor' }), { status: 500 });
  }
}
