export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // Por ahora usaremos una sala global de prueba, luego puedes hacerlo dinámico
  const roomId = url.searchParams.get('id') || 'SABEN_ROOM_1';
  
  // Leer los datos desde Cloudflare KV (SABEN_DB)
  let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
  
  // Si la sala no existe, la creamos vacía
  if (!roomData) {
    roomData = { state: 'lobby', players: [], current_question: null };
  }
  
  return new Response(JSON.stringify(roomData), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
