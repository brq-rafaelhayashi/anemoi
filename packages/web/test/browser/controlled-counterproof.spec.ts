import {test, expect} from '../../src/runner/fixtures.ts';
import {readRunPlan} from '../../src/runner/runPlan.ts';
import type {BehaviorScripts, ContractDefinition} from '../../src/runner/types.ts';

const contract: ContractDefinition = {
  schemaVersion: 1,
  consumer: 'fixture',
  component: 'tgr-button',
  requiredBehaviors: ['activation-emits-tgr-click'],
  routes: [{id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']}],
};

const scripts: BehaviorScripts = {
  activation: async ({root, listen, readEvents}) => {
    await listen(['tgrClick']);
    const button = root.getByRole('button', {name: 'Salvar'});
    await button.click();
    const events = (await readEvents()).map(event => ({
      name: event.name,
      detail: {clicked: Boolean((event.detail as {clicked?: boolean} | undefined)?.clicked)},
    }));
    const observation = {focus: true, events, visibility: {button: await button.isVisible()}, state: {}};
    return {
      observation,
      assert: value => expect(value.events).toEqual([{name: 'tgrClick', detail: {clicked: true}}]),
    };
  },
};

const plan = readRunPlan();
for (const scene of plan.scenes) {
  test(scene.cellId, async ({anemoi}) => {
    await anemoi.runScene({contract, scene, scripts});
  });
}
