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
    if (!questions || questions.length === 0) {
        return new Response(JSON.stringify({ error: 'No se pudieron generar preguntas' }), { status: 500, headers });
    }

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
  const playersWithAnswers = roomData.players.filter(p => p.questionnaire && Object.keys(p.questionnaire).length > 0);

  if (playersWithAnswers.length > 0) {
    try {
      const questions = await generateWithAI(playersWithAnswers, env);
      if (questions && questions.length >= 5) return questions;
    } catch (e) {
      console.error('AI Error:', e.message);
    }
  }

  // Fallback
  return FALLBACK_QUESTIONS.sort(() => Math.random() - 0.5).slice(0, 10);
}

async function generateWithAI(players, env) {
  const rawData = players.map(p => ({
    name: p.name,
    answers: p.questionnaire
  }));

  const systemPrompt = `Eres un generador de JSON rápido para un juego de trivia.
TAREA: Generar 10 preguntas DIVERTIDAS y sarcásticas basadas EXCLUSIVAMENTE en las respuestas de los jugadores.
CADA PREGUNTA debe incluir el nombre de un jugador y referirse a algo que respondió.
FORMATO JSON (Array de objetos):
[
  {
    "text": "¿Quién de los presentes confesó que su talento inútil es ser un ninja?",
    "options": [
      {"letter": "A", "text": "Juan", "icon": "🎭"},
      {"letter": "B", "text": "Pedro", "icon": "🕵️"},
      {"letter": "C", "text": "Maria", "icon": "🔥"},
      {"letter": "D", "text": "Lucia", "icon": "🤡"}
    ],
    "correctLetter": "A",
    "category": "Secreto",
    "author": "Juan"
  }
]
REGLA: RESPONDE SOLO EL JSON. SIN COMENTARIOS. SIN MARKDOWN.`;

  const userPrompt = `JUGADORES Y RESPUESTAS:\n${JSON.stringify(rawData)}\n\nGenera 10 preguntas AHORA en JSON.`;

  // Llama 3.1 8B es MUCHO más rápido que 70B
  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 3000
  });

  const raw = (response.response || '').trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI no retornó JSON');

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.map(q => ({
    ...q,
    timeLimit: 15,
    options: q.options.map((opt, i) => ({
      ...opt,
      letter: ['A','B','C','D'][i],
      icon: opt.icon || ['🔷','❤️','⚡','🌿'][i]
    }))
  }));
}

const FALLBACK_QUESTIONS = [
  {
    text: '¿Cuál es la capital de Chile?',
    options: [
      { letter: 'A', text: 'Valparaíso', icon: '🚢' },
      { letter: 'B', text: 'Concepción', icon: '🌊' },
      { letter: 'C', text: 'Santiago', icon: '🏙️' },
      { letter: 'D', text: 'Antofagasta', icon: '🌵' },
    ],
    correctLetter: 'C',
    category: 'Geografía',
    timeLimit: 15,
  },
  {
    text: '¿Quién pintó la Mona Lisa?',
    options: [
      { letter: 'A', text: 'Picasso', icon: '🎨' },
      { letter: 'B', text: 'Miguel Ángel', icon: '✝️' },
      { letter: 'C', text: 'Da Vinci', icon: '🖼️' },
      { letter: 'D', text: 'Dalí', icon: '🕰️' },
    ],
    correctLetter: 'C',
    category: 'Arte',
    timeLimit: 12,
  },
  {
    text: '¿En qué país se originó la pizza?',
    options: [
      { letter: 'A', text: 'Francia', icon: '🇫🇷' },
      { letter: 'B', text: 'Italia', icon: '🇮🇹' },
      { letter: 'C', text: 'Grecia', icon: '🇬🇷' },
      { letter: 'D', text: 'España', icon: '🇪🇸' },
    ],
    correctLetter: 'B',
    category: 'Gastronomía',
    timeLimit: 10,
  }
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
