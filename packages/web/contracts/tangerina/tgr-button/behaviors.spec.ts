import {test, expect} from '../../../src/runner/fixtures.ts';
import {readRunPlan} from '../../../src/runner/runPlan.ts';
import type {BehaviorScripts} from '../../../src/runner/types.ts';
import {contract} from './contract.ts';
import {scenes} from './scenes.ts';

function clicked(detail: unknown) {
  return Boolean((detail as {clicked?: boolean} | undefined)?.clicked);
}

const scripts: BehaviorScripts = {
  activation: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.click();
    const events = (await readEvents()).map(event => ({name: event.name, detail: {clicked: clicked(event.detail)}}));
    const observation = {
      focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element),
      events,
      visibility: {button: await button.isVisible()},
      state: {disabled: await button.isDisabled()},
    };
    return {observation, assert: value => {
      expect(value.events).toEqual([{name: 'tgrClick', detail: {clicked: true}}]);
      expect(value.visibility.button).toBe(true);
    }};
  },
  disabled: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.evaluate((element: HTMLButtonElement) => element.click());
    const observation = {
      focus: false,
      events: await readEvents(),
      visibility: {button: await button.isVisible()},
      state: {disabled: await button.isDisabled()},
    };
    return {observation, assert: value => {
      expect(value.state.disabled).toBe(true);
      expect(value.events).toEqual([]);
    }};
  },
  loading: async ({root, page, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvando'});
    await button.focus();
    await page.keyboard.press('Enter');
    const observation = {
      focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element),
      events: await readEvents(),
      visibility: {button: await button.isVisible()},
      state: {ariaBusy: await button.getAttribute('aria-busy'), disabled: await button.isDisabled()},
    };
    return {observation, assert: value => {
      expect(value.focus).toBe(true);
      expect(value.events).toEqual([]);
      expect(value.state).toEqual({ariaBusy: 'true', disabled: false});
    }};
  },
  submit: async ({root, listen, readEvents}) => {
    await listen(['tgrClick', 'submit']);
    await root.getByRole('button', {name: 'Enviar'}).click();
    const button = root.getByRole('button', {name: 'Enviar'});
    const events = (await readEvents()).map(event => event.name === 'tgrClick'
      ? {name: event.name, detail: {clicked: clicked(event.detail)}}
      : {name: event.name});
    const observation = {
      focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element),
      events,
      visibility: {button: await button.isVisible()},
      state: {submitted: events.some(event => event.name === 'submit')},
    };
    return {observation, assert: value => expect(value.state.submitted).toBe(true)};
  },
  reset: async ({root, listen, readEvents}) => {
    await listen(['tgrClick', 'reset']);
    await root.getByRole('button', {name: 'Limpar'}).click();
    const button = root.getByRole('button', {name: 'Limpar'});
    const events = (await readEvents()).map(event => event.name === 'tgrClick'
      ? {name: event.name, detail: {clicked: clicked(event.detail)}}
      : {name: event.name});
    const observation = {
      focus: await button.evaluate(element => (element.getRootNode() as ShadowRoot).activeElement === element),
      events,
      visibility: {button: await button.isVisible()},
      state: {reset: events.some(event => event.name === 'reset')},
    };
    return {observation, assert: value => expect(value.state.reset).toBe(true)};
  },
  'slotted-label': async ({root}) => {
    const button = root.getByRole('button', {name: 'Continuar'});
    const observation = {
      focus: false,
      events: [],
      visibility: {button: await button.isVisible()},
      state: {matchedAccessibleName: true},
    };
    return {observation, assert: value => {
      expect(value.visibility.button).toBe(true);
      expect(value.state.matchedAccessibleName).toBe(true);
    }};
  },
};

const plan = readRunPlan();
const sceneById = new Map(scenes.map(scene => [scene.id, scene]));
for (const planned of plan.scenes) {
  test(planned.cellId, async ({anemoi}) => {
    if (!sceneById.has(planned.id)) throw new Error(`Cena nao declarada: ${planned.id}.`);
    await anemoi.runScene({contract, scene: planned, scripts});
  });
}
