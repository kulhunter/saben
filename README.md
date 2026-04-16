# 🎮 SABEN.cl — El juego de trivia familiar

Plataforma de trivia personalizada para eventos y reuniones. La pantalla grande muestra las preguntas, los jugadores participan desde sus teléfonos.

## 🚀 Cómo subir a Cloudflare Pages

### 1. Crear el KV Namespace

```bash
npx wrangler kv:namespace create SABEN_DB
```

Copia el `id` que te entrega y pégalo en `wrangler.toml` donde dice `TU_KV_NAMESPACE_ID_AQUI`.

### 2. Activar Cloudflare AI

En el dashboard de Cloudflare → Workers & Pages → tu proyecto → Settings → Functions → habilita **Workers AI**.
Asegúrate de que el binding en `wrangler.toml` diga `binding = "AI"`.

### 3. Subir el proyecto

**Opción A — GitHub (recomendado):**
1. Sube este repo a GitHub
2. En Cloudflare Pages → Create a project → Connect to Git
3. Framework preset: **None**
4. Build command: (vacío)
5. Output directory: `/`

**Opción B — Wrangler CLI:**
```bash
npx wrangler pages deploy . --project-name saben
```

### 4. Variables de entorno en Cloudflare Dashboard

Ve a Settings → Environment Variables y agrega:
- `HOST_KEY` = `SABEN2025` (o la clave que quieras)

---

## 🎮 Cómo jugar

### El Anfitrión:
1. Abre `saben.cl` en el computador o TV
2. Ingresa la **clave de anfitrión** (por defecto: `SABEN2025`)
3. Espera que los jugadores se unan escaneando el QR
4. Presiona **¡ZAP! EMPEZAR SHOW** cuando todos estén listos

### Los Jugadores:
1. Escanean el QR o entran a `saben.cl/player.html`
2. Escriben su apodo
3. Responden el **cuestionario de 10 preguntas personales** (esto genera las trivias del juego)
4. Esperan que el anfitrión inicie
5. ¡Responden con los botones de colores mirando la pantalla grande!

---

## 🏗️ Arquitectura

```
/
├── index.html          → Pantalla del Anfitrión (proyecta en TV)
├── player.html         → Control del Jugador (celular)
├── styles.css          → Estilos retro-noventeros
├── wrangler.toml       → Config de Cloudflare
└── functions/
    └── api/
        ├── join.js     → POST: registrar jugador + cuestionario
        ├── room.js     → GET: estado actual del juego (polling)
        ├── vote.js     → POST: enviar voto + calcular puntos
        ├── start.js    → POST: iniciar juego + generar preguntas con IA
        └── next.js     → POST: avanzar entre etapas
```

## ⚙️ Flujo del estado del juego (KV)

```
lobby → question → reveal → question → ... → reveal → end
                          ↘ ranking ↗
```

## 🤖 Generación de preguntas con IA

Al iniciar el juego, `start.js` lee los cuestionarios de todos los jugadores y llama a **Cloudflare AI (Llama 3.1 8B)** para generar 10 preguntas personalizadas y divertidas basadas en sus respuestas.

Si la IA falla o no hay cuestionarios, usa un set de 10 preguntas de cultura general como respaldo.

## 🔑 Puntuación

- Máximo **1000 puntos** por respuesta correcta (en el primer segundo)
- Mínimo **100 puntos** si responde correcta pero en el último segundo
- **0 puntos** si responde mal o no responde

---

Creado con ❤️ por [dan.tagle.cl](https://dan.tagle.cl)
