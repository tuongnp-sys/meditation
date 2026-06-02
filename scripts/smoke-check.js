#!/usr/bin/env node
/**
 * Lightweight smoke checks (no browser). Run: node scripts/smoke-check.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mainJs = fs.readFileSync(path.join(root, 'frontend/js/main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const renderYaml = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');

const checks = [
  ['MOBILE_VIEWPORT_MQ', /MOBILE_VIEWPORT_MQ/],
  ['isCompactPlayMode', /function isCompactPlayMode/],
  ['measurePlayChrome', /function measurePlayChrome/],
  ['touch-down button', /id="touch-down"/],
  ['no float controls', () => !indexHtml.includes('game-controls-float')],
  ['render disk', /mountPath:.*backend\/data/],
];

let failed = 0;
for (const [name, test] of checks) {
  const ok = typeof test === 'function' ? test() : test.test(mainJs) || test.test(indexHtml) || test.test(renderYaml);
  if (!ok) {
    console.error(`FAIL: ${name}`);
    failed += 1;
  } else {
    console.log(`OK: ${name}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log('smoke-check: all passed');
