const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// black-hole-simulator.js is a page module: a minimal document lets it load
// without running its DOMContentLoaded initialization.
const context = vm.createContext({ window: {}, document: { addEventListener() {} }, console });
for (const file of ['black-hole-physics.js', 'black-hole-simulation.js', 'content.js', 'black-hole-simulator.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), context);
}
const comparison = context.window.BlackHoleCodeComparison;
const OWN_METRICS = ['ownOrder', 'ownAnalyticError', 'ownEnergyDrift', 'ownCarterDrift', 'ownStepRate'];

test('Every published metric carries its value and the exact place in its source', () => {
  assert.ok(Array.isArray(comparison) && comparison.length === 6);
  const ids = new Set();
  for (const code of comparison) {
    for (const metric of code.metrics) {
      assert.ok(!ids.has(metric.id), `duplicate metric id ${metric.id}`);
      ids.add(metric.id);
      assert.ok(typeof metric.value === 'string' && metric.value.length > 0, `${metric.id}: value`);
      assert.match(metric.source.url, /^https:\/\//, `${metric.id}: source url`);
      assert.ok(metric.source.label && metric.source.locator, `${metric.id}: source label and locator`);
    }
  }
  assert.equal(comparison.find((code) => code.id === 'thisCode').metrics.length, 0,
    'this simulator is measured on the page, not quoted');
});

test('Every metric, published or measured, has Italian and English copy', () => {
  const ids = [...OWN_METRICS, ...comparison.flatMap((code) => code.metrics.map((metric) => metric.id))];
  for (const language of ['it', 'en']) {
    const copy = context.window.PORTFOLIO_CONTENT[language].blackHoleSimulator.codeComparison;
    for (const key of ['metricsTitle', 'metricsIntro', 'measuring', 'measuredHere', 'measuredOnDevice']) {
      assert.ok(copy[key], `${language}: ${key}`);
    }
    for (const key of ['code', 'quantity', 'value', 'conditions', 'source']) assert.ok(copy.metricsColumns[key], `${language}: metricsColumns.${key}`);
    for (const id of ids) {
      assert.ok(copy.metrics[id]?.quantity && copy.metrics[id]?.conditions, `${language}: metrics.${id}`);
    }
  }
});
