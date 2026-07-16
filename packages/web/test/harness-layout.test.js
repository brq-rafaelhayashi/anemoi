const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const harnesses = [
  ['react', path.join(__dirname, '..', 'harness', 'react', 'index.html')],
  ['angular', path.join(__dirname, '..', 'harness', 'angular', 'src', 'index.html')],
];

for (const [framework, sourcePath] of harnesses) {
  test(`${framework} replica o layout padded do Storybook`, () => {
    const html = fs.readFileSync(sourcePath, 'utf8');
    assert.match(html, /body\s*\{\s*margin:\s*0;\s*padding:\s*1rem;\s*\}/);
  });
}
