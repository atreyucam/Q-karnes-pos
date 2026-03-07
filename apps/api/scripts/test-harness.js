/* eslint-disable no-console */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectThrows(fn, contains) {
  try {
    await fn();
    return { ok: false, error: 'No lanzó error' };
  } catch (error) {
    const msg = String(error.message || error);
    if (contains && !msg.includes(contains)) {
      return { ok: false, error: `Mensaje inesperado: ${msg}` };
    }
    return { ok: true, error: msg };
  }
}

function printSuiteReport(title, results) {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  const passed = sorted.filter((r) => r.ok).length;
  const failed = sorted.length - passed;

  console.log(`\n=== ${title} ===`);
  for (const r of sorted) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.id}] ${r.name}${r.detail ? ` -> ${r.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  return { sorted, passed, failed, total: sorted.length };
}

module.exports = {
  assert,
  expectThrows,
  printSuiteReport
};
