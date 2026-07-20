import type {SceneDefinition} from '../../../src/runner/types.ts';

const defaults = {
  label: 'Salvar', variant: 'primary', size: 'lg', type: 'button',
  disabled: false, loading: false, fullWidth: false, brand: false,
};

const scene = (id: string, name: string, args = {}, slots = {}, extra = {}): SceneDefinition => ({
  id, name, component: 'tgr-button', args: {...defaults, ...args}, slots, ...extra,
});

export const scenes: SceneDefinition[] = [
  scene('default', 'Default', {}, {}, {legacyStoryName: 'Default'}),
  scene('primary', 'Primary', {variant: 'primary'}, {}, {legacyStoryName: 'Primary'}),
  scene('secondary', 'Secondary', {variant: 'secondary'}, {}, {legacyStoryName: 'Secondary'}),
  scene('mini', 'Mini', {variant: 'mini', label: 'Ver mais'}, {}, {legacyStoryName: 'Mini'}),
  scene('disabled', 'Disabled', {disabled: true}, {}, {legacyStoryName: 'Disabled'}),
  scene('loading', 'Loading', {loading: true, label: 'Salvando'}, {}, {legacyStoryName: 'Loading'}),
  scene('with-icon', 'Com Icone', {label: 'Baixar'}, {
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" /></svg>',
  }, {legacyStoryName: 'Com Icone'}),
  scene('small', 'Small', {size: 'sm'}, {}, {legacyStoryName: 'Small'}),
  scene('full-width', 'Full Width', {fullWidth: true, label: 'Continuar'}, {}, {legacyStoryName: 'Full Width'}),
  scene('on-brand', 'On Brand', {brand: true, label: 'Entrar'}, {}, {legacyStoryName: 'On Brand'}),
  scene('submit', 'Submit', {type: 'submit', label: 'Enviar'}, {}, {context: {kind: 'form', id: 'submit-form'}}),
  scene('reset', 'Reset', {type: 'reset', label: 'Limpar'}, {}, {context: {kind: 'form', id: 'reset-form'}}),
  scene('slotted-label', 'Slotted Label', {label: 'Fallback'}, {'': 'Continuar'}),
];
