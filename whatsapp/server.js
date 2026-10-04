// whatsapp/server.js

const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());

const SESSION = 'gnv-taller';
const PORT = process.env.WPPCONNECT_PORT || 21465;

// API Node.js/Express (produccion: https://...)
// Esta instancia local NO se conecta a MariaDB ni a PHP.
// Solo consume endpoints protegidos por API Key.
const API_URL = process.env.API_URL || 'http://localhost:3100';
const API_KEY = process.env.WHATSAPP_INTEGRATION_API_KEY || '';

if (!API_KEY) {
  console.error('[config] Falta WHATSAPP_INTEGRATION_API_KEY en el .env. Cerrando.');
  console.error('          Copiar .env.example a .env y completar la clave.');
  process.exit(1);
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'vcgas-bot';

// Cada cuanto consulta la API las notificaciones pendientes.
const POLL_MS = Number(process.env.POLL_INTERVAL_MS) || 60000;

// Donde guardar el QR. Antes apuntaba a C:\xampp\htdocs, que ya no
// se usa. Si se deja vacio se guarda en whatsapp/qr_gnv.png.
const QR_PATH = process.env.QR_PATH || '';

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
    // 1. Primero consultar la API online para resolver placas
    const res = await axios.post(
      `${API_URL}/api/public/chatbot`,
      {
        from,
        text: texto,
        body: texto
      },
      {
        headers: { 'X-API-Key': API_KEY },
        timeout: 15000
      }
    );

    const data = res.data;
    respuesta = data.respuesta ?? null;

    // Si encontró placa, responde con datos reales de MariaDB
    if (respuesta) {
      console.log('[BD] Respuesta desde la API online');
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
      const destino = QR_PATH || path.join(__dirname, 'qr_gnv.png');
      fs.writeFileSync(destino, Buffer.from(base64Qr.replace(/^data:image\/png;base64,/, ''), 'base64'));
      console.log(`[wpp.connect] QR guardado en ${destino}`);
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

  // Endpoint para enviar mensajes desde la API online
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
    console.log(`API online: ${API_URL}`);
    console.log(`Cola: ${DELAY_MIN / 1000}-${DELAY_MAX / 1000}s entre mensajes`);
    console.log(`Descanso: cada ${SLEEP_AFTER_MIN}-${SLEEP_AFTER_MAX} mensajes`);
    console.log(`Dormir: ${SLEEP_MIN / 60000}-${SLEEP_MAX / 60000} minutos\n`);

    iniciarPollerNotificaciones();
  });
}

// ============================================================
// NOTIFICACIONES PROGRAMADAS
// ============================================================
//
// Antes el backend PHP generaba y enviaba los recordatorios
// llamando directo a este servidor por HTTP.
//
// Ahora el backend solo GENERA las notificaciones y las guarda
// en MariaDB. Este proceso las consume por la API y reporta el
// resultado. Asi la base de datos es la unica fuente de verdad.
//
// Esta instancia NO tiene credenciales de MariaDB: solo la API Key.

// Cliente HTTP con la API Key en cada peticion.
function apiClient() {
  return axios.create({
    baseURL: API_URL,
    headers: { 'X-API-Key': API_KEY },
    timeout: 20000
  });
}

async function procesarNotificacionesPendientes() {
  const http = apiClient();

  try {
    const res = await http.get('/api/integrations/whatsapp/pendientes?limite=5');
    const notificaciones = res.data?.notificaciones || [];

    if (notificaciones.length === 0) return;

    console.log(`[Recordatorios] ${notificaciones.length} pendiente(s) en la API`);

    for (const n of notificaciones) {
      const numero = String(n.telefono || '').replace(/[^0-9]/g, '');

      if (!numero) {
        await http.post(`/api/integrations/whatsapp/notificaciones/${n.id_notificacion}/error`, {
          detalle: 'La notificacion no tiene telefono'
        }).catch(() => {});
        continue;
      }

      try {
        // enqueueMessage respeta el retardo anti-baneo: no se salta.
        await enqueueMessage(`${numero}@c.us`, n.mensaje);

        await http.post(`/api/integrations/whatsapp/notificaciones/${n.id_notificacion}/enviada`);

        console.log(`[Recordatorios] Enviada #${n.id_notificacion} (${n.tipo})`);

      } catch (err) {
        console.error(`[Recordatorios] Fallo #${n.id_notificacion}:`, err.message);

        await http.post(`/api/integrations/whatsapp/notificaciones/${n.id_notificacion}/error`, {
          detalle: err.message
        }).catch(() => {});
      }
    }

  } catch (err) {
    // Si la API no responde, se reintenta en el siguiente ciclo.
    // No se marca ninguna notificacion: asi no se pierden avisos.
    console.error('[Recordatorios] No se pudo consultar la API:', err.message);
  }
}

function iniciarPollerNotificaciones() {
  setTimeout(async () => {
    await procesarNotificacionesPendientes();
    setInterval(procesarNotificacionesPendientes, POLL_MS);
  }, 10000);

  console.log(`Poller de notificaciones: cada ${Math.round(POLL_MS / 1000)}s`);
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