// POST /api/start  — El anfitrión inicia el juego
// Body: { roomId, hostKey }
//
// Genera preguntas personalizadas ultra-creativas a partir de
// los cuestionarios usando Cloudflare AI con prompt mejorado.

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

    // Seguridad básica
    const hostKey = data.hostKey || '';
    const validKey = env.HOST_KEY || HOST_KEY;
    if (hostKey !== validKey) {
      return new Response(JSON.stringify({ error: 'Clave incorrecta' }), { status: 403, headers });
    }

    let roomData = await env.SABEN_DB.get(roomId, { type: 'json' });
    if (!roomData) {
      return new Response(JSON.stringify({ error: 'Sala no encontrada' }), { status: 404, headers });
    }

    if (roomData.state !== 'lobby') {
      return new Response(JSON.stringify({ error: 'El juego ya comenzó' }), { status: 409, headers });
    }

    // ── Generar preguntas ─────────────────────────────────────────
    const questions = await generateQuestions(roomData, env);

    roomData.questions = questions;
    roomData.currentQ = 0;
    roomData.state = 'question';
    roomData.questionStartedAt = Date.now();
    roomData.answers = {};
    // Resetear answered en jugadores
    roomData.players.forEach(p => { p.answered = false; });

    await env.SABEN_DB.put(roomId, JSON.stringify(roomData));

    return new Response(JSON.stringify({ success: true, totalQ: questions.length }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}

// ── Generador de preguntas ────────────────────────────────────────────────
async function generateQuestions(roomData, env) {
  const questionnaire = roomData.questionnaire || {};
  const playerEntries = Object.values(questionnaire);

  // Si hay respuestas de cuestionario, intentar generar preguntas personalizadas
  if (playerEntries.length > 0) {
    try {
      const questions = await generateWithAI(playerEntries, roomData.players, env);
      if (questions && questions.length >= 5) return shuffle(questions);
    } catch (e) {
      console.error('AI generation failed, using fallback:', e.message);
    }
  }

  // Fallback: preguntas genéricas de cultura general
  return shuffle(FALLBACK_QUESTIONS).slice(0, 10);
}

async function generateWithAI(playerEntries, players, env) {
  const playerNames = players.map(p => p.name);
  const namesStr = playerNames.join(', ');

  const context = playerEntries.map(entry => {
    let parts = [`★ JUGADOR: ${entry.playerName}`];
    for (let q in entry.answers) {
      parts.push(`  → ${q}: ${entry.answers[q]}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const prompt = `Eres el DIRECTOR CREATIVO de "SABEN", el juego social más exitoso de Latinoamérica. Tu trabajo es crear preguntas de trivia HILARANTES y PERSONALIZADAS basadas en lo que los jugadores revelaron sobre sí mismos.

JUGADORES Y SUS SECRETOS:
${context}

TODOS LOS JUGADORES: ${namesStr}

═══════════════════════════════════════
TIPOS DE PREGUNTAS — Usa TODOS estos tipos bien mezclados:

🕵️ DETECTIVE — "¿Quién de nosotros confesó que [cita textual]?"
   Opciones: nombres de jugadores reales. Solo uno dijo eso.

🧟 ZOMBIE — "Si ${playerNames[0] || 'alguien'} fuera zombi, basándonos en lo que sabemos, ¿qué haría primero?"
   Opciones: acciones graciosas inventadas basadas en sus respuestas.

🤥 VERDAD O MENTIRA — "¿Cuál de estas es VERDAD sobre [nombre]?"
   3 opciones inventadas pero creíbles + 1 sacada de sus respuestas reales.

🔮 MÁS PROBABLE — "¿Quién es MÁS PROBABLE que [situación absurda/graciosa]?"
   Opciones: nombres de jugadores, basándonos en sus personalidades.

💀 DILEMA EXTREMO — "Si solo pudiéramos salvar a UNO de un meteorito, ¿quién sería más útil para la humanidad según sus talentos?"
   Opciones: nombres de jugadores.

🍽️ DATOS CRUZADOS — "¿Cuál es la comida favorita de [nombre]?" o "¿Qué le da más miedo a [nombre]?"
   Opciones: respuestas REALES de distintos jugadores, solo una corresponde al jugador mencionado.

🎭 INTERCAMBIO — "Si [nombre1] y [nombre2] intercambiaran vidas por un día, ¿qué haría [nombre1] primero?"
   Opciones: situaciones cómicas basadas en la personalidad de cada uno.

😱 PESADILLA — "¿Cuál sería la PEOR pesadilla de [nombre] según lo que nos contó?"
   Opciones basadas en sus miedos/fobias/respuestas.

🎲 SITUACIÓN LOCA — "Estamos todos en un reality show. ¿Quién sería eliminado primero y por qué?"
   Opciones: nombres con razones graciosas.

═══════════════════════════════════════

REGLAS ESTRICTAS:
1. Genera EXACTAMENTE 15 preguntas
2. Cada pregunta tiene 4 opciones (A, B, C, D), SOLO UNA es correcta
3. Usa los NOMBRES REALES de los jugadores en las opciones siempre que se pueda
4. Las preguntas deben hacer REÍR A CARCAJADAS — humor absurdo, situaciones extremas
5. Incluye EMOJIS creativos en el texto de las preguntas
6. Las opciones incorrectas deben ser graciosas Y creíbles
7. Varía el timeLimit: 15 para preguntas directas, 20 para las que requieren pensar
8. Cada opción DEBE tener un emoji como "icon"
9. NO repitas el mismo tipo de pregunta dos veces seguidas
10. MEZCLA preguntas sobre TODOS los jugadores — no favorezcas a ninguno

FORMATO — Responde ÚNICAMENTE con un array JSON válido. Sin markdown. Sin explicaciones. Sin \`\`\`:
[{"text":"¿pregunta?","options":[{"letter":"A","text":"opción","icon":"🎯"},{"letter":"B","text":"opción","icon":"💀"},{"letter":"C","text":"opción","icon":"🔥"},{"letter":"D","text":"opción","icon":"😂"}],"correctLetter":"A","category":"Detective","author":"NombreJugador","timeLimit":15}]`;

  // Intentar con modelo grande primero, fallback a modelo pequeño
  let response;
  const messages = [
    { role: 'system', content: 'Eres un generador de JSON perfecto. SOLO respondes con JSON válido. Sin markdown. Sin explicaciones. Sin comentarios. Sin ```.' },
    { role: 'user', content: prompt }
  ];

  try {
    response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      max_tokens: 4096,
      temperature: 0.85,
    });
  } catch (modelErr) {
    // Fallback al modelo más pequeño
    response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages,
      max_tokens: 3500,
      temperature: 0.8,
    });
  }

  const raw = (response.response || '').trim();

  // Extraer JSON aunque haya texto extra
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta de AI');

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    // Intentar limpiar JSON malformado
    const cleaned = jsonMatch[0]
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/[\x00-\x1F\x7F]/g, ' ');
    parsed = JSON.parse(cleaned);
  }

  // Validar y normalizar cada pregunta
  const letters = ['A', 'B', 'C', 'D'];
  const defaultIcons = ['🔷', '❤️', '⚡', '🌿'];

  return parsed
    .filter(q => q && q.text && q.options && q.options.length === 4 && q.correctLetter)
    .map(q => ({
      text: q.text,
      correctLetter: q.correctLetter,
      category: q.category || 'Trivia',
      author: q.author || '',
      timeLimit: q.timeLimit || 15,
      options: q.options.map((opt, i) => ({
        letter: letters[i],
        text: opt.text || `Opción ${letters[i]}`,
        icon: opt.icon || defaultIcons[i],
      })),
    }));
}

// ── Preguntas de respaldo (cuando la IA falla) ───────────────────────────
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
    text: '¿Cuántos planetas tiene nuestro sistema solar?',
    options: [
      { letter: 'A', text: '7', icon: '🪐' },
      { letter: 'B', text: '8', icon: '🌍' },
      { letter: 'C', text: '9', icon: '☄️' },
      { letter: 'D', text: '10', icon: '🔭' },
    ],
    correctLetter: 'B',
    category: 'Ciencia',
    timeLimit: 12,
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
    text: '¿Cuántos lados tiene un hexágono?',
    options: [
      { letter: 'A', text: '5', icon: '⭐' },
      { letter: 'B', text: '7', icon: '🌟' },
      { letter: 'C', text: '6', icon: '⬡' },
      { letter: 'D', text: '8', icon: '🔷' },
    ],
    correctLetter: 'C',
    category: 'Matemáticas',
    timeLimit: 10,
  },
  {
    text: '¿En qué año llegó el hombre a la Luna por primera vez?',
    options: [
      { letter: 'A', text: '1965', icon: '🌙' },
      { letter: 'B', text: '1972', icon: '🚀' },
      { letter: 'C', text: '1969', icon: '👨‍🚀' },
      { letter: 'D', text: '1971', icon: '🛸' },
    ],
    correctLetter: 'C',
    category: 'Historia',
    timeLimit: 15,
  },
  {
    text: '¿Cuál es el océano más grande del mundo?',
    options: [
      { letter: 'A', text: 'Atlántico', icon: '🌊' },
      { letter: 'B', text: 'Índico', icon: '🐬' },
      { letter: 'C', text: 'Ártico', icon: '🧊' },
      { letter: 'D', text: 'Pacífico', icon: '🦈' },
    ],
    correctLetter: 'D',
    category: 'Geografía',
    timeLimit: 12,
  },
  {
    text: '¿Qué animal es el más rápido en tierra?',
    options: [
      { letter: 'A', text: 'León', icon: '🦁' },
      { letter: 'B', text: 'Guepardo', icon: '🐆' },
      { letter: 'C', text: 'Galgo', icon: '🐕' },
      { letter: 'D', text: 'Caballo', icon: '🐎' },
    ],
    correctLetter: 'B',
    category: 'Naturaleza',
    timeLimit: 12,
  },
  {
    text: '¿Cuántos colores tiene el arcoíris?',
    options: [
      { letter: 'A', text: '5', icon: '🌈' },
      { letter: 'B', text: '8', icon: '🎨' },
      { letter: 'C', text: '6', icon: '🖌️' },
      { letter: 'D', text: '7', icon: '✨' },
    ],
    correctLetter: 'D',
    category: 'Ciencia',
    timeLimit: 10,
  },
  {
    text: '¿Cuál es el ingrediente principal del guacamole?',
    options: [
      { letter: 'A', text: 'Tomate', icon: '🍅' },
      { letter: 'B', text: 'Aguacate', icon: '🥑' },
      { letter: 'C', text: 'Cebolla', icon: '🧅' },
      { letter: 'D', text: 'Chile', icon: '🌶️' },
    ],
    correctLetter: 'B',
    category: 'Gastronomía',
    timeLimit: 10,
  },
  {
    text: '¿Cuántas cuerdas tiene una guitarra española estándar?',
    options: [
      { letter: 'A', text: '4', icon: '🎵' },
      { letter: 'B', text: '5', icon: '🎶' },
      { letter: 'C', text: '7', icon: '🎼' },
      { letter: 'D', text: '6', icon: '🎸' },
    ],
    correctLetter: 'D',
    category: 'Música',
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
  },
  {
    text: '¿Cuál es el hueso más largo del cuerpo humano?',
    options: [
      { letter: 'A', text: 'Tibia', icon: '🦴' },
      { letter: 'B', text: 'Húmero', icon: '💪' },
      { letter: 'C', text: 'Fémur', icon: '🦵' },
      { letter: 'D', text: 'Radio', icon: '🤲' },
    ],
    correctLetter: 'C',
    category: 'Ciencia',
    timeLimit: 15,
  },
  {
    text: '¿Qué planeta es conocido como el "planeta rojo"?',
    options: [
      { letter: 'A', text: 'Venus', icon: '✨' },
      { letter: 'B', text: 'Júpiter', icon: '🪐' },
      { letter: 'C', text: 'Marte', icon: '🔴' },
      { letter: 'D', text: 'Saturno', icon: '💫' },
    ],
    correctLetter: 'C',
    category: 'Ciencia',
    timeLimit: 10,
  },
  {
    text: '¿Cuál es el país más grande del mundo por superficie?',
    options: [
      { letter: 'A', text: 'China', icon: '🇨🇳' },
      { letter: 'B', text: 'Canadá', icon: '🇨🇦' },
      { letter: 'C', text: 'Rusia', icon: '🇷🇺' },
      { letter: 'D', text: 'Estados Unidos', icon: '🇺🇸' },
    ],
    correctLetter: 'C',
    category: 'Geografía',
    timeLimit: 15,
  },
  {
    text: '¿Quién escribió "Cien años de soledad"?',
    options: [
      { letter: 'A', text: 'Pablo Neruda', icon: '📝' },
      { letter: 'B', text: 'Gabriel García Márquez', icon: '📚' },
      { letter: 'C', text: 'Mario Vargas Llosa', icon: '🖊️' },
      { letter: 'D', text: 'Isabel Allende', icon: '📖' },
    ],
    correctLetter: 'B',
    category: 'Literatura',
    timeLimit: 15,
  },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
