// ============================================================
//  src/config/env.js
//  Carga y validacion de variables de entorno.
//  Falla al arrancar si falta algo obligatorio, para no subir
//  el proceso con una configuracion incompleta.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const missing = [];

function required(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (fallback !== undefined) return fallback;
    missing.push(name);
    return '';
  }

  return String(raw).trim();
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'si', 'on'].includes(String(raw).trim().toLowerCase());
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number.parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

if (missing.length > 0) {
  const list = missing.map((m) => `  - ${m}`).join('\n');
  throw new Error(
    `Faltan variables de entorno obligatorias en .env:\n${list}\n\n` +
      'Copia .env.example a .env y completalas. No se muestran valores por seguridad.'
  );
}

const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
const isProduction = nodeEnv === 'production';

// --- Seguridad del JWT en produccion --------------------------------
const jwtSecret = required('JWT_SECRET');

if (isProduction) {
  if (jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET es demasiado corto para produccion. Usa al menos 32 caracteres.'
    );
  }
  if (jwtSecret.includes('cambiar_por')) {
    throw new Error('JWT_SECRET sigue con el valor de ejemplo de .env.example.');
  }
}

// --- SSL de MariaDB ---------------------------------------------------
const dbSslEnabled = bool('DB_SSL', false);

function resolveSslCa() {
  if (!dbSslEnabled) return undefined;

  const caPath = process.env.DB_SSL_CA_PATH?.trim();
  const caContent = process.env.DB_SSL_CA?.trim();

  if (caPath) {
    const abs = path.isAbsolute(caPath) ? caPath : path.join(ROOT, caPath);
    if (!fs.existsSync(abs)) {
      throw new Error(`DB_SSL_CA_PATH no apunta a un archivo existente: ${abs}`);
    }
    return fs.readFileSync(abs, 'utf8');
  }

  if (caContent) return caContent;

  return undefined;
}

const dbSslCa = resolveSslCa();

// --- CORS ------------------------------------------------------------
const corsOrigins = required('CORS_ORIGINS', 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (isProduction && corsOrigins.includes('*')) {
  throw new Error('CORS_ORIGINS no puede ser "*" en produccion.');
}

const whatsappApiKey = required('WHATSAPP_INTEGRATION_API_KEY');

if (isProduction && whatsappApiKey.includes('cambiar_por')) {
  throw new Error('WHATSAPP_INTEGRATION_API_KEY sigue con el valor de ejemplo.');
}

export const env = Object.freeze({
  root: ROOT,
  nodeEnv,
  isProduction,
  port: int('PORT', 3100),
  corsOrigins,
  whatsappApiKey,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '8h',
  cronRecordatorios: process.env.CRON_RECORDATORIOS?.trim() || '*/30 * * * *',
  // Zona horaria del taller. Importa para calcular bien el aviso
  // de 10 dias antes de cada fecha.
  tz: process.env.TZ_TALLER?.trim() || 'America/La_Paz',
  db: Object.freeze({
    host: required('DB_HOST', 'localhost'),
    port: int('DB_PORT', 3306),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD ?? '',
    database: required('DB_NAME', 'gnv_taller'),
    ssl: dbSslEnabled,
    sslCa: dbSslCa,
  }),
});

export default env;
