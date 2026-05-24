/* eslint-disable no-console */

async function run() {
  process.env.HARDENING_DURATION_MS = process.env.HARDENING_DURATION_MS || String(7_200_000);
  process.env.HARDENING_TARGET_OPS = process.env.HARDENING_TARGET_OPS || String(10_000);
  process.env.HARDENING_VALIDATE_EVERY = process.env.HARDENING_VALIDATE_EVERY || String(500);
  process.env.HARDENING_WINDOW_EVERY = process.env.HARDENING_WINDOW_EVERY || String(1000);
  process.env.HARDENING_HEAP_MARKS = process.env.HARDENING_HEAP_MARKS || '10,20,30,40,50,60,70,80,90,100';
  process.env.HARDENING_FORCE_GC = process.env.HARDENING_FORCE_GC || 'false';
  process.env.HARDENING_PROFILE_NAME = process.env.HARDENING_PROFILE_NAME || 'web-local-2h';
  process.env.HARDENING_REPORT_TITLE = process.env.HARDENING_REPORT_TITLE || 'WEB LOCAL HARDENING 2H REPORT';
  process.env.WEB_LOCAL = process.env.WEB_LOCAL || 'true';
  process.env.HOST = process.env.HOST || '127.0.0.1';
  process.env.PORT = process.env.PORT || '3000';
  // Load after env defaults so profile/file names are resolved correctly.
  const stress = require('./pos-stress-15m.cjs');
  const code = await stress.run();
  return code;
}

if (require.main === module) {
  run().then((code) => process.exit(code));
}

module.exports = { run };
