// POST /api/start  — El anfitrión inicia el juego
// Body: { roomId, hostKey }
//
// Esta función genera las preguntas a partir de los cuestionarios
// de los jugadores usando la API de Cloudflare AI (o un fallback JSON).

const HOST_KEY = 'SABEN2025'; // Cämbialo en Cloudflare env vars si quieres

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
      const questions = await generateWithAI(playerEntries, env);
      if (questions && questions.length >= 5) return shuffle(questions);
    } catch (e) {
      console.error('AI generation failed, using fallback', e);
    }
  }

  // Fallback: preguntas genéricas de cultura general
  return shuffle(FALLBACK_QUESTIONS);
}

async function generateWithAI(playerEntries, env) {
  const context = playerEntries.map(entry => {
    let parts = [`== Jugador: ${entry.playerName} ==`];
    for (let q in entry.answers) {
      parts.push(`- ${q}: ${entry.answers[q]}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const prompt = `Eres el creador de un juego de trivia familiar en Chile. 
A continuación hay información personal que varios participantes escribieron sobre sí mismos:

${context}

Tu tarea: Crear EXACTAMENTE 20 preguntas de trivia que sean MUY DIVERTIDAS, variadas y originales basadas en esta información.
Tienes que hacer que se sienta como un juego de salón o fiesta (al estilo Kahoot / Jackbox).
Asegúrate de incluir HARTOS TIPOS DE PREGUNTAS DISTINTOS, por ejemplo:
1. "Descubre quién es": (ej: "¿Quién de nosotros es capaz de [respuesta del jugador]?")
2. "Verdadero o Falso": (ej: "¿Es cierto que [nombre] le tiene pánico a [respuesta]?") (Usa falso y verdad al azar).
3. "Adivina la mentira": Inventa 3 hechos súper falsos sobre alguien y pon su secreto real como la opción correcta (o viceversa).
4. El peor escenario: (ej: "Si tuviéramos que comer una sola cosa, a [nombre] le encantaría comer...")
5. Cosas locas y situaciones graciosas basadas estrictamente en la información de arriba.

REGLAS CRUCIALES:
- Cada pregunta debe referirse a los participantes y tener 4 opciones (A, B, C, D), SOLO UNA correcta.

Responde ÚNICAMENTE con un array JSON válido con este formato exacto (sin markdown, sin explicaciones):
[
  {
    "text": "¿Cuál es el lugar favorito de [nombre]?",
    "options": [
      {"letter":"A","text":"París","icon":"🗼"},
      {"letter":"B","text":"La playa","icon":"🏖️"},
      {"letter":"C","text":"Las montañas","icon":"⛰️"},
      {"letter":"D","text":"Su cama","icon":"🛏️"}
    ],
    "correctLetter": "B",
    "category": "Sobre [nombre]",
    "author": "[nombre]",
    "timeLimit": 15
  }
]`;

  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: 'Responde SOLO con JSON válido, sin markdown.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 3000,
    temperature: 0.8,
  });

  const raw = (response.response || '').trim();
  // Extraer el JSON aunque haya texto extra
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No se encontró JSON en la respuesta de AI');

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed;
}

// ── Preguntas de respaldo ─────────────────────────────────────────────────
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
