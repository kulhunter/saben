// POST /api/start  — El anfitrión inicia el juego
// Body: { roomId, hostKey }

const HOST_KEY = 'SABEN2025';

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const data = await request.json();
    const roomId = data.roomId || 'SABEN_ROOM_1';
    const hostKey = data.hostKey || '';
    const validKey = env.HOST_KEY || HOST_KEY;

    if (hostKey !== validKey) {
      return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 403, headers });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada' }), { status: 404, headers });
    }

    // ── Generar preguntas ─────────────────────────────────────────
    const questions = await generateQuestions(roomData, env);

    roomData.questions = questions;
    roomData.currentQ = 0;
    roomData.state = 'question';
    roomData.questionStartedAt = Date.now();
    roomData.answers = {};
    roomData.players.forEach(p => { p.answered = false; });

    await env.SABEN_DB.put(roomId, JSON.stringify(roomData));

    return new Response(JSON.stringify({ success: true, totalQ: questions.length }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

async function generateQuestions(roomData, env) {
  // Las respuestas están en roomData.questionnaire[playerId]
  const qMap = roomData.questionnaire || {};
  const playersWithAnswers = roomData.players.map(p => {
    const qData = qMap[p.id];
    return {
      name: p.name,
      answers: qData ? qData.answers : null
    };
  }).filter(p => p.answers && Object.keys(p.answers).length > 0);

  console.log(`Jugadores con datos para IA: ${playersWithAnswers.length}`);

  if (playersWithAnswers.length > 0) {
    try {
      const aiQuestions = await generateWithAI(playersWithAnswers, env);
      if (aiQuestions && aiQuestions.length >= 5) {
        return aiQuestions;
      }
    } catch (e) {
      console.error('AI Error:', e.message);
    }
  }

  // FALLBACK: Genericas si falla la IA
  return FALLBACK_QUESTIONS.sort(() => Math.random() - 0.5).slice(0, 10);
}

async function generateWithAI(playerData, env) {
  const systemPrompt = `Eres un generador de juegos de trivia experto.
TAREA: Generar EXACTAMENTE 10 preguntas UNICAS basadas 100% en las respuestas de los jugadores.
CADA PREGUNTA debe:
1. Basarse en una respuesta real de los jugadores proporcionados.
2. Mencionar el nombre de un jugador en la pregunta.
3. Ser MUY graciosa, sarcástica o sorprendente.
4. Tener 4 opciones (A, B, C, D) donde UNA es correcta (la del jugador) y las otras 3 son otros nombres de jugadores de la lista.

REGLA DE ORO: Las preguntas deben ser del tipo "¿Quién dijo que su película favorita es...?" o "¿A quién de los presentes le da miedo...?". 
NO INVENTES DATOS GENÉRICOS.

FORMATO JSON (Array de objetos): 
[
  {
    "text": "¿Quién de los presentes confesó que su talento inútil es...?",
    "options": [
      {"letter": "A", "text": "Juan", "icon": "🎭"},
      {"letter": "B", "text": "Maria", "icon": "🕵️"},
      {"letter": "C", "text": "Pedro", "icon": "🔥"},
      {"letter": "D", "text": "Ana", "icon": "🤡"}
    ],
    "correctLetter": "A",
    "category": "Secretos",
    "author": "Juan"
  }
]
SOLO RESPONDE EL JSON. SIN MARKDOWN.`;

  const userPrompt = `AQUÍ ESTÁN LOS JUGADORES Y SUS RESPUESTAS:\n${JSON.stringify(playerData)}\n\nGenera 10 preguntas ahora.`;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 3500
    });

    const raw = (response.response || '').trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;

    return parsed.map((q, idx) => ({
      text: q.text,
      options: q.options.map((opt, i) => ({
        letter: ['A','B','C','D'][i],
        text: opt.text,
        icon: opt.icon || ['🔷','❤️','⚡','🌿'][i]
      })),
      correctLetter: q.correctLetter || 'A',
      category: q.category || 'Trivia',
      author: q.author || '',
      timeLimit: 15
    }));
  } catch (e) {
    console.error("AI Generation Error:", e);
    return null;
  }
}

const FALLBACK_QUESTIONS = [
  { text: '¿Quién es más probable que se pierda en un supermercado?', options: [{letter:'A',text:'Anfitrión',icon:'🛒'},{letter:'B',text:'Jugador 1',icon:'🕵️'},{letter:'C',text:'Jugador 2',icon:'🤡'},{letter:'D',text:'Nadie',icon:'🏃'}], correctLetter:'B', category:'Random', timeLimit:15 },
  { text: '¿Qué animal siempre tiene hambre?', options: [{letter:'A',text:'Perro',icon:'🐶'},{letter:'B',text:'Gato',icon:'🐱'},{letter:'C',text:'Oso',icon:'🐻'},{letter:'D',text:'Tiburón',icon:'🦈'}], correctLetter:'A', category:'Naturaleza', timeLimit:15 },
  { text: '¿Cuál es la capital de los memes?', options: [{letter:'A',text:'Reddit',icon:'🤖'},{letter:'B',text:'Twitter',icon:'🐦'},{letter:'C',text:'Instagram',icon:'📸'},{letter:'D',text:'TikTok',icon:'🎵'}], correctLetter:'A', category:'Internet', timeLimit:15 },
  { text: '¿Quién pintó la Mona Lisa?', options: [{letter:'A',text:'Picasso',icon:'🎨'},{letter:'B',text:'Da Vinci',icon:'🖼️'},{letter:'C',text:'Dalí',icon:'🕰️'},{letter:'D',text:'Velázquez',icon:'🖌️'}], correctLetter:'B', category:'Arte', timeLimit:15 },
  { text: '¿Hacia dónde va el sol al atardecer?', options: [{letter:'A',text:'Norte',icon:'⬆️'},{letter:'B',text:'Sur',icon:'⬇️'},{letter:'C',text:'Este',icon:'➡️'},{letter:'D',text:'Oeste',icon:'⬅️'}], correctLetter:'D', category:'Ciencia', timeLimit:15 },
  { text: '¿Qué fruta tiene las semillas por fuera?', options: [{letter:'A',text:'Manzana',icon:'🍎'},{letter:'B',text:'Frutilla',icon:'🍓'},{letter:'C',text:'Pera',icon:'🍐'},{letter:'D',text:'Uva',icon:'🍇'}], correctLetter:'B', category:'Naturaleza', timeLimit:15 },
  { text: '¿Cuál es el color del caballo blanco de Napoleón?', options: [{letter:'A',text:'Negro',icon:'⚫'},{letter:'B',text:'Café',icon:'🟤'},{letter:'C',text:'Blanco',icon:'⚪'},{letter:'D',text:'Gris',icon:'🔘'}], correctLetter:'C', category:'Historia', timeLimit:15 },
  { text: '¿En qué país se originó la pizza?', options: [{letter:'A',text:'Francia',icon:'🇫🇷'},{letter:'B',text:'Italia',icon:'🇮🇹'},{letter:'C',text:'Grecia',icon:'🇬🇷'},{letter:'D',text:'España',icon:'🇪🇸'}], correctLetter:'B', category:'Cocina', timeLimit:15 },
  { text: '¿Cuántos dedos tiene un humano en total (manos y pies)?', options: [{letter:'A',text:'10',icon:'🖐️'},{letter:'B',text:'15',icon:'🧤'},{letter:'C',text:'20',icon:'🦶'},{letter:'D',text:'25',icon:'👣'}], correctLetter:'C', category:'Cuerpo', timeLimit:15 },
  { text: '¿Qué planeta es el más cercano al sol?', options: [{letter:'A',text:'Marte',icon:'🔴'},{letter:'B',text:'Tierra',icon:'🌍'},{letter:'C',text:'Mercurio',icon:'🔥'},{letter:'D',text:'Venus',icon:'✨'}], correctLetter:'C', category:'Espacio', timeLimit:15 }
];

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
