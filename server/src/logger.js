/**
 * Logger mínimo con marca de tiempo, nivel y prefijo.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let minLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function ts() {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 23);
}

function write(level, tag, args) {
  if (LEVELS[level] < minLevel) return;
  const msg = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.stack || a.message : JSON.stringify(a)))
    .join(' ');
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${ts()} ${level.toUpperCase().padEnd(5)} [${tag}] ${msg}\n`);
}

export function createLogger(tag) {
  return {
    tag,
    debug: (...a) => write('debug', tag, a),
    info: (...a) => write('info', tag, a),
    warn: (...a) => write('warn', tag, a),
    error: (...a) => write('error', tag, a),
  };
}
