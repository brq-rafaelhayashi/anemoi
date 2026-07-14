const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runSource = fs.readFileSync(path.join(__dirname, '../src/run.js'), 'utf8');

test('marca o estagio story-args imediatamente antes da resolucao CSF', () => {
  assert.match(
    runSource,
    /stage = 'story-args';\s+const argsById = await resolveStoryArgs\(repo, stories\);/,
  );
});
