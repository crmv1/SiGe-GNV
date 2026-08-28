// whatsapp/server.js

const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

const SESSION = 'gnv-taller';
const PORT = 21465;

const BACKEND_URL = 'http://127.0.0.1/backend';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const OLLAMA_MODEL = 'vcgas-bot';

// Ignorar mensajes antiguos
const BOT_STARTED_AT = Math.floor(Date.now() / 1000);
const MAX_MESSAGE_AGE_SECONDS = 15;

// Cola anti-baneo
const DELAY_MIN = 20 * 1000;
const DELAY_MAX = 40 * 1000;
const SLEEP_AFTER_MIN = 10;
const SLEEP_AFTER_MAX = 15;
const SLEEP_MIN = 10 * 60 * 1000;
const SLEEP_MAX = 15 * 60 * 1000;

// Agrupar mensajes
const BUFFER_TIME = 8000;
const messageBuffers = {};

let clientWpp = null;
const messageQueue = [];

let queueRunning = false;
let messagesSent = 0;
let sleeping = false;
let nextSleepAt = randomInt(SLEEP_AFTER_MIN, SLEEP_AFTER_MAX);

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitUntilAwake() {
  return new Promise(resolve => {
    const check = setInterval(() => {
      if (!sleeping) {
        clearInterval(check);
        resolve();
      }
    }, 5000);
  });
}

// ============================================================
// COLA ANTI-BANEO
// ============================================================

function enqueueMessage(to, text) {
  return new Promise((resolve, reject) => {
    messageQueue.push({ to, text, resolve, reject });

    console.log(`[Cola] Encolado para ${to} | Pendientes: ${messageQueue.length}`);

    if (!queueRunning) processQueue();
  });
}

async function processQueue() {
  if (queueRunning) return;

  queueRunning = true;

  while (messageQueue.length > 0) {
    if (sleeping) {
      await waitUntilAwake();
    }

    const item = messageQueue.shift();

    try {
      await clientWpp.sendText(item.to, item.text);
      messagesSent++;

      console.log(`[Cola] Enviado a ${item.to} | Total: ${messagesSent}/${nextSleepAt}`);
      item.resolve({ status: 'success' });

    } catch (err) {
      console.error('[Cola] Error:', err);
      item.reject(err);
    }

    if (messagesSent >= nextSleepAt) {
      const sleepMs = randomInt(SLEEP_MIN, SLEEP_MAX);

      console.log(`\n[Cola] Durmiendo ${Math.round(sleepMs / 60000)} minutos...\n`);

      sleeping = true;

      setTimeout(() => {
        sleeping = false;
        messagesSent = 0;
        nextSleepAt = randomInt(SLEEP_AFTER_MIN, SLEEP_AFTER_MAX);

        console.log(`\n[Cola] Despierto. Próximo descanso en ${nextSleepAt} mensajes.\n`);
      }, sleepMs);
    }

    if (messageQueue.length > 0) {
      const delay = randomInt(DELAY_MIN, DELAY_MAX);

      console.log(`[Cola] Esperando ${Math.round(delay / 1000)} segundos...`);
      await sleep(delay);
    }
  }

  queueRunning = false;
}

// ============================================================
// RESPUESTAS OFICIALES BONITAS
// ============================================================

function obtenerRespuestaOficial(texto) {
  const t = texto.toLowerCase();

  if (
    t.includes('recalificacion') ||
    t.includes('recalificación') ||
    t.includes('recalificar') ||
    t.includes('cilindro')
  ) {
    return `🔧 *RECALIFICACIÓN DE CILINDRO POR EL ESTADO*  
_Validez: 5 años_

📄 *Requisitos:*

• 2 fotocopias de carnet  
• 2 fotocopias de RUAT  
• Fotocopia de factura de luz o agua  
  de los últimos 3 meses  
• Fotocopia de SOAT vigente  
• Documento antiguo del gas  

⚠️ *Importante:*  
Si el RUAT no está a su nombre, debe traer:  
• Poder o minuta de compra y venta  

⏱ *Tiempo aproximado:*  
2 a 3 días  

💰 *Transporte del cilindro:*  
Entre 40 y 50 Bs, dependiendo el tamaño.`;
  }

  if (
    t.includes('instalacion') ||
    t.includes('instalación') ||
    t.includes('conversion') ||
    t.includes('conversión') ||
    t.includes('poner gas') ||
    t.includes('instalar gnv') ||
    t.includes('instalar gas')
  ) {
    return `🚗 *INSTALACIÓN DE GNV POR EL ESTADO*

📄 *Requisitos:*

• 2 fotocopias de carnet  
• 2 fotocopias de RUAT  
• Fotocopia de factura de luz o agua  
  de los últimos 3 meses  
• Fotocopia de SOAT vigente  

⚠️ *Importante:*  
Si el RUAT no está a su nombre, debe traer:  
• Poder o minuta de compra y venta  

⏱ *Tiempo aproximado:*  
• 3ra generación: día y medio  
• 5ta generación: 2 días`;
  }

  if (
    t.includes('inspeccion') ||
    t.includes('inspección') ||
    t.includes('anual')
  ) {
    return `🔍 *INSPECCIÓN ANUAL*

📄 *Requisitos:*

• Carnet  
• Documento antiguo del gas  

⏱ *Tiempo aproximado:*  
15 minutos.`;
  }

  if (
    t.includes('horario') ||
    t.includes('atienden') ||
    t.includes('abren') ||
    t.includes('hora')
  ) {
    return `🕒 *HORARIOS DE ATENCIÓN*

*Lunes a viernes:*  
08:30 a 12:30  
14:00 a 18:00  

*Sábados:*  
08:30 a 13:30`;
  }

  if (
    t.includes('ubicacion') ||
    t.includes('ubicación') ||
    t.includes('direccion') ||
    t.includes('dirección') ||
    t.includes('donde estan') ||
    t.includes('dónde están') ||
    t.includes('maps')
  ) {
    return `📍 *TALLER VC GAS*

*Dirección:*  
Av. América Oeste #1516  
casi Av. Juan de la Rosa  

🗺 *Ubicación:*  
https://maps.app.goo.gl/8JwRZKJ5EtUfMBUz5`;
  }

  if (
    t.includes('cita') ||
    t.includes('agendar') ||
    t.includes('reservar') ||
    t.includes('turno')
  ) {
    return `📅 *AGENDAR CITA*

Puede agendar su cita por este mismo WhatsApp.

También puede hacerlo de forma presencial en el taller.`;
  }

  return null;
}

// ============================================================
// IA CONTROLADA SOLO PARA CONVERSACIÓN GENERAL
// ============================================================

async function consultarIAConversacionLibre(mensajeUsuario) {
  try {
    const prompt = `
Eres el asistente oficial del Taller VC GAS.

Datos oficiales:
- Ubicación: Av. América Oeste #1516 casi Avenida Juan de la Rosa
- Maps: https://maps.app.goo.gl/8JwRZKJ5EtUfMBUz5
- Horario lunes a viernes: 08:30 a 12:30 y 14:00 a 18:00
- Sábados: 08:30 a 13:30
- Citas por WhatsApp al mismo número o presencial

Reglas:
- No inventes requisitos.
- No inventes precios.
- No respondas en inglés.
- Responde corto, amable y claro.
- Si no sabes algo, di: "Para más información comuníquese directamente con el taller."

Cliente:
${mensajeUsuario}
`;

    const response = await axios.post(
      `${OLLAMA_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          num_predict: 100,
          temperature: 0.1
        }
      },
      {
        timeout: 180000
      }
    );

    return response.data?.response?.trim() || null;

  } catch (err) {
    console.error('[IA-Ollama] Error:', err.message);
    return null;
  }
}

// ============================================================
// PROCESAR MENSAJE
// ============================================================

async function procesarMensaje(from, texto) {
  let respuesta = null;

  try {
    // 1. Primero consultar PHP/MySQL para placas
    const res = await axios.post(
      `${BACKEND_URL}/chatbot_webhook.php`,
      {
        event: 'onmessage',
        from,
        text: texto,
        body: texto
      },
      {
        timeout: 15000
      }
    );

    const data = res.data;
    respuesta = data.respuesta ?? null;

    // Si encontró placa, responde con datos reales de MySQL
    if (respuesta) {
      console.log('[BD] Respuesta desde MySQL');
      await enqueueMessage(from, respuesta);
      return;
    }

    // 2. Respuestas oficiales exactas del taller
    const respuestaOficial = obtenerRespuestaOficial(texto);

    if (respuestaOficial) {
      console.log('[Respuesta oficial] Enviando información validada del taller');
      await enqueueMessage(from, respuestaOficial);
      return;
    }

    // 3. IA solo para conversación general
    console.log('[IA] Conversación libre controlada...');
    respuesta = await consultarIAConversacionLibre(texto);

    if (!respuesta) {
      respuesta =
        '👋 Hola, soy el asistente del *Taller VC Gas*.\n\n' +
        'Puedo ayudarte con:\n' +
        '• Consulta por placa\n' +
        '• Recalificación\n' +
        '• Inspección anual\n' +
        '• Instalación GNV\n' +
        '• Horarios y ubicación\n\n' +
        'Escríbeme tu consulta 😊';
    }

    await enqueueMessage(from, respuesta);

  } catch (err) {
    console.error('[Chatbot] Error:', err.message);

    await enqueueMessage(
      from,
      'Servicio no disponible momentáneamente. Comunícate directamente con el taller.'
    );
  }
}

// ============================================================
// WPP CONNECT
// ============================================================

wppconnect.create({
  session: SESSION,

  catchQR: (base64Qr, asciiQR) => {
    console.log('\n================ QR WHATSAPP ================\n');
    console.log(asciiQR);
    console.log('\nEscanea este QR desde WhatsApp > Dispositivos vinculados.\n');

    try {
      fs.writeFileSync('C:\\xampp\\htdocs\\qr_gnv.png', Buffer.from(base64Qr.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log('[wpp.connect] QR guardado en http://localhost/qr_gnv.png (abrir y escanear).');
    } catch (e) {
      console.error('[wpp.connect] No se pudo guardar el QR:', e.message);
    }
  },

  statusFind: (statusSession) => {
    console.log('[wpp.connect] Estado:', statusSession);
  },

  headless: true,
  devtools: false,
  useChrome: true,
  debug: false,
  logQR: true,

  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ],

  disableWelcome: true,
  updatesLog: false,
  autoClose: 0,

  tokenStore: 'file',
  folderNameToken: './tokens'

}).then(client => {
  clientWpp = client;

  console.log('[wpp.connect] Sesión iniciada correctamente.');

  startServer(client);

}).catch(err => {
  console.error('[wpp.connect] Error:', err);
  process.exit(1);
});

// ============================================================
// SERVIDOR
// ============================================================

function startServer(client) {
  client.onMessage(async (message) => {
    const now = Math.floor(Date.now() / 1000);
    const msgTime = message.timestamp || 0;

    // Ignorar mensajes anteriores al inicio del bot
    if (msgTime < BOT_STARTED_AT) {
      console.log('[Filtro] Mensaje antiguo ignorado');
      return;
    }

    // Ignorar mensajes viejos cargados por WhatsApp
    if ((now - msgTime) > MAX_MESSAGE_AGE_SECONDS) {
      console.log('[Filtro] Mensaje viejo ignorado');
      return;
    }

    // Ignorar grupos y mensajes que no sean texto
    if (message.isGroupMsg) return;
    if (message.type !== 'chat') return;

    const texto = message.body?.trim();
    if (!texto) return;

    const from = message.from;

    console.log(`[Chatbot] Mensaje de ${from}: "${texto}"`);

    // Agrupar mensajes del mismo usuario por unos segundos
    if (!messageBuffers[from]) {
      messageBuffers[from] = {
        mensajes: [],
        timer: null
      };
    }

    messageBuffers[from].mensajes.push(texto);

    if (messageBuffers[from].timer) {
      clearTimeout(messageBuffers[from].timer);
    }

    messageBuffers[from].timer = setTimeout(async () => {
      const mensajesUnidos = messageBuffers[from].mensajes.join('\n');

      delete messageBuffers[from];

      console.log(`[Chatbot] Procesando mensaje agrupado de ${from}`);

      await procesarMensaje(from, mensajesUnidos);

    }, BUFFER_TIME);
  });

  // Endpoint para enviar mensajes desde PHP/recordatorios
  app.post('/api/:session/send-message', async (req, res) => {
    const { phone, message: msg } = req.body;

    if (!phone || !msg) {
      return res.status(400).json({
        status: 'error',
        message: 'Falta phone o message'
      });
    }

    const numero = phone.replace(/[^0-9]/g, '');

    enqueueMessage(`${numero}@c.us`, msg)
      .then(() => console.log(`[Recordatorio] Encolado para ${numero}`))
      .catch(e => console.error('[Recordatorio] Error:', e.message));

    res.json({ status: 'queued' });
  });

  // Estado del sistema
  app.get('/api/:session/status', async (req, res) => {
    try {
      const state = await client.getConnectionState();

      let ollamaActivo = false;

      try {
        await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
        ollamaActivo = true;
      } catch {}

      res.json({
        status: 'success',
        state,
        sleeping,
        queueLength: messageQueue.length,
        messagesSent,
        nextSleepAt,
        ollamaActivo
      });

    } catch {
      res.json({
        status: 'error',
        state: 'DISCONNECTED'
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`\nServidor en http://localhost:${PORT}`);
    console.log(`IA híbrida local: Ollama (${OLLAMA_MODEL})`);
    console.log(`Base de datos: PHP/MySQL para placas`);
    console.log(`Cola: ${DELAY_MIN / 1000}-${DELAY_MAX / 1000}s entre mensajes`);
    console.log(`Descanso: cada ${SLEEP_AFTER_MIN}-${SLEEP_AFTER_MAX} mensajes`);
    console.log(`Dormir: ${SLEEP_MIN / 60000}-${SLEEP_MAX / 60000} minutos\n`);
  });
}

// ============================================================
// CERRAR
// ============================================================

process.on('SIGINT', async () => {
  console.log('\nCerrando bot...');

  if (clientWpp) {
    await clientWpp.close();
  }

  process.exit(0);
});