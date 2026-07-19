const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function subject() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/runner/behavior.ts')).href);
}

const route = {id: 'activation', sceneId: 'primary', covers: ['activate']};
const scene = {
  id: 'primary',
  cellId: 'primary-gol-light-sm',
  component: 'tgr-button',
  name: 'Primary',
  args: {},
  slots: {},
  brand: 'gol',
  theme: 'light',
  viewport: 'sm',
  width: 360,
};

const observation = count => ({
  focus: 'button',
  events: Array.from(
    {length: count},
    () => ({name: 'tgrClick', detail: {clicked: true}}),
  ),
  visibility: {button: true},
  state: {disabled: false},
});

function mountWith(values, calls = []) {
  return async (framework, mountedScene) => {
    calls.push({framework, scene: mountedScene});
    if (values[framework] instanceof Error) throw values[framework];
    return {
      page: {},
      root: {},
      listen: async () => {},
      readEvents: async () => [],
    };
  };
}

test('executeBehaviorRoute aprova conformidade e paridade exatas', async () => {
  const {executeBehaviorRoute} = await subject();
  const script = async () => ({
    observation: observation(1),
    assert: value => assert.equal(value.events.length, 1),
  });
  const result = await executeBehaviorRoute({
    route,
    scene,
    script,
    mount: mountWith({wc: 1, react: 1, angular: 1}),
  });
  assert.equal(result.frameworks.wc.conformance, 'passed');
  assert.equal(result.frameworks.react.conformance, 'passed');
  assert.equal(result.parity, 'passed');
});

test('resultado inesperado mas igual falha conformidade e preserva paridade', async () => {
  const {executeBehaviorRoute} = await subject();
  const script = async () => ({
    observation: observation(0),
    assert: value => assert.equal(value.events.length, 1),
  });
  const result = await executeBehaviorRoute({
    route,
    scene,
    script,
    mount: mountWith({wc: 1, react: 1, angular: 1}),
  });
  assert.deepEqual(
    Object.values(result.frameworks).map(value => value.conformance),
    ['failed', 'failed', 'failed'],
  );
  assert.equal(result.parity, 'passed');
});

test('observacoes diferentes falham paridade com diff estruturado', async () => {
  const {executeBehaviorRoute} = await subject();
  let index = 0;
  const script = async () => {
    index += 1;
    const current = observation(index === 2 ? 0 : 1);
    return {observation: current, assert: () => {}};
  };
  const result = await executeBehaviorRoute({
    route,
    scene,
    script,
    mount: mountWith({wc: 1, react: 1, angular: 1}),
  });
  assert.equal(result.parity, 'failed');
  assert.deepEqual(result.diff, [{
    framework: 'react',
    match: false,
    diff: [{
      path: 'events',
      reference: observation(1).events,
      against: [],
    }],
  }]);
});

test('paridade preserva ordem e contagem dos eventos', async () => {
  const {compareObservations} = await import(
    pathToFileURL(path.resolve(__dirname, '../src/runner/observation.ts')).href
  );
  const reference = observation(2);
  const reversed = structuredClone(reference);
  reversed.events = [
    {name: 'opened', detail: {index: 1}},
    {name: 'closed', detail: {index: 2}},
  ];
  const reordered = structuredClone(reversed);
  reordered.events.reverse();

  assert.equal(compareObservations(reference, observation(1)).match, false);
  assert.equal(compareObservations(reversed, reordered).match, false);
});

test('erro de um framework nao impede os demais e torna paridade nao comparavel', async () => {
  const {executeBehaviorRoute} = await subject();
  const calls = [];
  const script = async context => {
    calls.push(context);
    return {observation: observation(1), assert: () => {}};
  };
  const mountCalls = [];
  const result = await executeBehaviorRoute({
    route,
    scene,
    script,
    mount: mountWith({wc: 1, react: new Error('mount react'), angular: 1}, mountCalls),
  });
  assert.equal(result.frameworks.react.execution, 'error');
  assert.equal(result.frameworks.react.conformance, 'not-run');
  assert.equal(result.frameworks.angular.execution, 'passed');
  assert.equal(result.parity, 'not-comparable');
  assert.equal(calls.length, 2);
  assert.deepEqual(mountCalls.map(call => call.framework), ['wc', 'react', 'angular']);
  assert.ok(mountCalls.every(call => call.scene === scene));
  assert.ok(calls.every(context => context.scene === scene && !('framework' in context)));
});

test('envelope de observacao exige focus events visibility e state serializaveis', async () => {
  const {assertObservation} = await import(
    pathToFileURL(path.resolve(__dirname, '../src/runner/observation.ts')).href
  );
  assert.throws(
    () => assertObservation({events: [], visibility: {}, state: {}}),
    /Observacao Comportamental invalida/,
  );
  assert.throws(
    () => assertObservation({
      focus: false,
      events: [],
      visibility: {},
      state: {bad: undefined},
    }),
    /nao e serializavel/,
  );
});
