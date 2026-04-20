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
  const qMap = roomData.questionnaire || {};
  const players = roomData.players || [];
  const playerNames = players.map(p => p.name);

  const playersWithAnswers = players.map(p => {
    const qData = qMap[p.id];
    return {
      name: p.name,
      answers: qData ? qData.answers : null
    };
  }).filter(p => p.answers && Object.keys(p.answers).length > 0);

  if (playersWithAnswers.length > 0) {
    try {
      const aiQuestions = await generateWithAI(playersWithAnswers, playerNames, env);
      if (aiQuestions && aiQuestions.length >= 5) {
        return aiQuestions;
      }
    } catch (e) {
      console.error('AI Error:', e.message);
    }
  }

  return FALLBACK_QUESTIONS.sort(() => Math.random() - 0.5).slice(0, 10);
}

async function generateWithAI(playerData, playerNames, env) {
  const systemPrompt = `Eres un generador de JSON para un juego de trivia social.
REGLA DE ORO: No uses marcadores de posición como "...". Escribe la respuesta real del jugador en la pregunta.
REGLA DE ORO 2: Solo usa nombres de la lista de jugadores que te daré para las opciones. NO INVENTES NOMBRES.

TAREA: Crear 10 preguntas basadas en las respuestas dadas.
Ejemplo de flujo:
- Si Juan dijo que su miedo es "las arañas", la pregunta es: "¿Quién confesó que su mayor miedo son las arañas?".
- Las opciones A, B, C, D deben ser nombres reales de la lista. Una debe ser Juan.

LISTA DE NOMBRES PERMITIDOS: ${playerNames.join(', ')}

FORMATO JSON:
[
  {
    "text": "¿Quién dijo que su talento inútil es cantar ópera?",
    "options": [
      {"letter": "A", "text": "NombreReal1", "icon": "🎤"},
      {"letter": "B", "text": "NombreReal2", "icon": "🕵️"},
      {"letter": "C", "text": "NombreReal3", "icon": "🔥"},
      {"letter": "D", "text": "NombreReal4", "icon": "🤡"}
    ],
    "correctLetter": "A",
    "category": "Talentos",
    "author": "NombreReal1"
  }
]`;

  const userPrompt = `RESPUESTAS DE LOS JUGADORES:\n${JSON.stringify(playerData)}\n\nGenera 10 preguntas usando SOLO esos nombres en las opciones.`;

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 4000
    });

    const raw = (response.response || '').trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    let parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;

    // Validación post-generación para evitar alucinaciones de nombres
    return parsed.map((q) => {
      // Si el autor no está en la lista de nombres, algo anda mal, pero intentamos salvarlo
      const validAuthor = playerNames.includes(q.author) ? q.author : playerNames[0];
      
      // Limpiar opciones para que solo contengan nombres reales
      const cleanedOptions = q.options.map((opt, i) => {
        let name = opt.text;
        // Si el nombre no es real, ponemos uno de la lista al azar (evitando duplicados en la misma pregunta si es posible)
        if (!playerNames.includes(name)) {
          name = playerNames[i % playerNames.length];
        }
        return {
          letter: ['A','B','C','D'][i],
          text: name,
          icon: opt.icon || ['🔷','❤️','⚡','🌿'][i]
        };
      });

      // Asegurar que la respuesta correcta sea el autor
      const correctIdx = cleanedOptions.findIndex(o => o.text === validAuthor);
      const correctLetter = correctIdx !== -1 ? ['A','B','C','D'][correctIdx] : 'A';

      return {
        text: q.text.replace('打击', '').replace('...', ' (tu respuesta) '), // Limpieza básica
        options: cleanedOptions,
        correctLetter: correctLetter,
        category: q.category || 'Trivia',
        author: validAuthor,
        timeLimit: 15
      };
    });
  } catch (e) {
    return null;
  }
}

const FALLBACK_QUESTIONS = [
  { text: '¿Quién es más probable que se pierda en un supermercado?', options: [{letter:'A',text:'Anfitrión',icon:'🛒'},{letter:'B',text:'Jugador 1',icon:'🕵️'},{letter:'C',text:'Jugador 2',icon:'🤡'},{letter:'D',text:'Nadie',icon:'🏃'}], correctLetter:'B', category:'Random', timeLimit:15 },
  { text: '¿Qué animal siempre tiene hambre?', options: [{letter:'A',text:'Perro',icon:'🐶'},{letter:'B',text:'Gato',icon:'🐱'},{letter:'C',text:'Oso',icon:'🐻'},{letter:'D',text:'Tiburón',icon:'🦈'}], correctLetter:'A', category:'Naturaleza', timeLimit:15 },
  { text: '¿Cuál es la capital de los memes?', options: [{letter:'A',text:'Reddit',icon:'🤖'},{letter:'B',text:'Twitter',icon:'🐦'},{letter:'C',text:'Instagram',icon:'📸'},{letter:'D',text:'TikTok',icon:'🎵'}], correctLetter:'A', category:'Internet', timeLimit:15 },
  { text: '¿Quién pintó la Mona Lisa?', options: [{letter:'A',text:'Picasso',icon:'🎨'},{letter:'B',text:'Da Vinci',icon:'🖼️'},{letter:'C',text:'Dalí',icon:'🕰️'},{letter:'D',text:'Velázquez',icon:'🖌️'}], correctLetter:'B', category:'Arte', timeLimit:15 },
  { text: '¿Hacia dónde va el sol al atardecer?', options: [{letter:'A',text:'Norte',icon:'⬆️'},{letter:'B',text:'Sur',icon:'⬇️'},{letter:'C',text:'Este',icon:'➡️'},{letter:'D',text:'Oeste',icon:'⬅️'}], correctLetter:'D', category:'Ciencia', timeLimit:15 }
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
