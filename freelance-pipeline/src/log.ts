/* Логи: время, уровень, модуль. Секреты сюда не попадают — за этим следят вызывающие. */
type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN = (process.env.LOG_LEVEL as Level) || 'info';

function write(level: Level, mod: string, msg: string, extra?: unknown) {
  if (ORDER[level] < ORDER[MIN]) return;
  const t = new Date().toISOString().slice(11, 19);
  const line = `${t} ${level.toUpperCase().padEnd(5)} [${mod}] ${msg}`;
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(line + (extra !== undefined ? ' ' + safe(extra) : '') + '\n');
}
function safe(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v, (k, x) =>
      /token|key|secret|session|password/i.test(k) ? '[скрыто]' : x);
  } catch { return String(v); }
}

export const log = (mod: string) => ({
  debug: (m: string, e?: unknown) => write('debug', mod, m, e),
  info: (m: string, e?: unknown) => write('info', mod, m, e),
  warn: (m: string, e?: unknown) => write('warn', mod, m, e),
  error: (m: string, e?: unknown) => write('error', mod, m, e instanceof Error ? e.message : e),
});
