const isProd = process.env.NODE_ENV === 'production';

const fmt = (level, msg, meta) => {
  const entry = { level, msg, ts: new Date().toISOString(), ...meta };
  return isProd ? JSON.stringify(entry) : `[${level.toUpperCase()}] ${msg}${Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''}`;
};

const logger = {
  info:  (msg, meta = {}) => console.log(fmt('info', msg, meta)),
  warn:  (msg, meta = {}) => console.warn(fmt('warn', msg, meta)),
  error: (msg, meta = {}) => console.error(fmt('error', msg, meta)),
  http:  (msg, meta = {}) => { if (process.env.NODE_ENV !== 'test') console.log(fmt('http', msg, meta)); },
  debug: (msg, meta = {}) => { if (!isProd) console.log(fmt('debug', msg, meta)); },
};

module.exports = logger;
