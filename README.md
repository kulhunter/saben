# 🎮 SABEN.cl — El mejor juego para fiestas y carretes

Plataforma de trivia personalizada con Inteligencia Artificial que transforma tus reuniones en un show tipo Kahoot. La pantalla central proyecta el juego y los participantes usan sus celulares como controles remotos.

## 🚀 Características Principales

- **Onboarding Interactivo**: Tutorial paso a paso para anfitriones y jugadores.
- **Motor de IA Avanzado**: Utiliza **Llama 3.3 70B** para generar preguntas hilarantes y personalizadas basadas en lo que los jugadores responden.
- **Salas Dinámicas**: Generación de PINs únicos de 4 dígitos con código QR automático.
- **Contador en Tiempo Real**: El anfitrión puede ver cuántos jugadores han votado en cada pregunta.
- **Nueva Ronda**: ¡No detengas la fiesta! Botón para iniciar una nueva partida manteniendo a los jugadores pero reseteando puntajes.
- **SEO Optimizado**: Completamente indexable con metadatos enriquecidos y sitemap.

## 🚀 Cómo desplegar en Cloudflare Pages

### 1. Preparar el KV Namespace

```bash
npx wrangler kv:namespace create SABEN_DB
```

Copia el `id` y pégalo en `wrangler.toml`.

### 2. Configurar Workers AI

En el dashboard de Cloudflare, habilita **Workers AI** en tu proyecto de Pages y asegúrate de tener acceso a los modelos de Llama. El binding debe llamarse `AI`.

### 3. Despliegue

Sube este repositorio a GitHub y conecta Cloudflare Pages. El framework es **None**, comando de build vacío y el output directory es `/`.

### 4. Variables de Entorno

Agrega `HOST_KEY` (ej: `SABEN2025`) en la configuración de Cloudflare.

---

## 🎮 Cómo se juega

### 1. El Anfitrión (TV/PC)
- Entra a `saben.cl` y crea una sala.
- Se generará un **PIN de 4 dígitos** y un **QR**.
- Espera a que los amigos se unan. Verás sus nombres aparecer en tiempo real.

### 2. Los Jugadores (Móvil)
- Escanean el QR o entran a `saben.cl` e ingresan el PIN.
- Responden una encuesta de **10 preguntas divertidas** sobre ellos mismos.
- ¡Sus respuestas alimentarán a la IA para crear el juego!

### 3. El Show
- El anfitrión inicia el juego.
- Aparecen preguntas basadas en las respuestas del grupo (Ej: "¿Quién de aquí dijo que comería a @Juan primero en un apocalipsis zombie?").
- Responde rápido para ganar más puntos. ¡Gana el que más sepa sobre sus amigos!

---

## 🏗️ Arquitectura Técnica

```
/
├── index.html          → Anfitrión (Onboarding + Dashboard + TV UI)
├── player.html         → Jugador (Encuesta + Control Remoto)
├── styles.css          → Sistema de diseño retro-comic
├── sitemap.xml         → SEO
├── robots.txt          → SEO
├── wrangler.toml       → Configuración Cloudflare
└── functions/api/
    ├── create.js       → Generación de PINs únicos
    ├── join.js         → Registro de jugadores
    ├── room.js         → Estado del juego (Polling con VoteCount)
    ├── vote.js         → Recepción de votos
    ├── start.js        → Motor de IA Llama 3.3 70B
    └── next.js         → Transición de estados (incluye 'regenerate')
```

## 🤖 El Cerebro (IA)

`start.js` analiza todos los cuestionarios y utiliza un prompt de ingeniería avanzada para forzar a la IA a ser creativa, sarcástica y divertida. Clasifica las preguntas en categorías como:
- **Detective**: Deducción sobre hechos reales del grupo.
- **Zombie Apocalypse**: Situaciones de supervivencia extrema.
- **The Grinch**: Opiniones impopulares.
- **Crush & Love**: Secretos y dilemas amorosos.

---

Creado con ❤️ por [dan.tagle.cl](https://dan.tagle.cl)
