/**
 * Structured logging with field redaction.
 *
 * PRD Part II §12.2 requires field redaction in logs, and §12.3 says to avoid
 * raw AI request logs by default. Anything that looks like personal data,
 * precise location or a secret is redacted before it reaches the output.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

/** Keys whose values are never written to a log line. */
const REDACTED_KEYS = new Set([
  'email',
  'phone',
  'phone_e164',
  'password',
  'token',
  'apiKey',
  'api_key',
  'authorization',
  'cookie',
  'sessionToken',
  'subscription',
  'emergencyContact',
  'message',
  'chat',
  'prompt',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'coordinates',
  'medicalNotes',
  'accessibility_preferences',
]);

function redact(fields: Fields): Fields {
  const output: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACTED_KEYS.has(key)) {
      output[key] = '[redacted]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = redact(value as Fields);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function emit(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...redact(fields),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, fields);
  },
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};
