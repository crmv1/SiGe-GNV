// ============================================================
//  src/utils/logger.js
//  Log unico. Oculta credenciales, tokens y datos sensibles.
// ============================================================

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'db_password',
  'jwt_secret',
  'secret',
  'token',
  'authorization',
  'api_key',
  'whatsapp_integration_api_key',
  'codigo',
  'codigo_hash',
  'expo_push_token',
  'telefono',
  'celular',
  'ci',
  'correo',
  'email',
]);

/** Reemplaza valores sensibles por un marcador antes de loguear. */
export function redact(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[oculto]' : redact(val);
  }
  return out;
}

function stamp() {
  return new Date().toISOString();
}

export const logger = {
  info(message, meta) {
    console.log(`[${stamp()}] [INFO ] ${message}`, meta ? redact(meta) : '');
  },
  warn(message, meta) {
    console.warn(`[${stamp()}] [WARN ] ${message}`, meta ? redact(meta) : '');
  },
  error(message, meta) {
    console.error(`[${stamp()}] [ERROR] ${message}`, meta ? redact(meta) : '');
  },
};

export default logger;
