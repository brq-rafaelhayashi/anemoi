import {defineContract} from '../../../src/runner/contracts.ts';

export const contract = defineContract({
  schemaVersion: 1,
  consumer: 'tangerina',
  component: 'tgr-button',
  requiredBehaviors: [
    'activation-emits-tgr-click',
    'disabled-blocks-activation',
    'loading-blocks-activation',
    'loading-remains-focusable',
    'submit-emits-form-submit',
    'reset-emits-form-reset',
    'slotted-content-defines-name',
  ],
  routes: [
    {id: 'activation', sceneId: 'primary', covers: ['activation-emits-tgr-click']},
    {id: 'disabled', sceneId: 'disabled', covers: ['disabled-blocks-activation']},
    {id: 'loading', sceneId: 'loading', covers: ['loading-blocks-activation', 'loading-remains-focusable']},
    {id: 'submit', sceneId: 'submit', covers: ['submit-emits-form-submit']},
    {id: 'reset', sceneId: 'reset', covers: ['reset-emits-form-reset']},
    {id: 'slotted-label', sceneId: 'slotted-label', covers: ['slotted-content-defines-name']},
  ],
});
