import '@gol-smiles/tangerina-token/dist/tokens.css';
import '@gol-smiles/tangerina-fonts/dist/fonts.css';
import {defineCustomElements} from '@gol-smiles/tangerina-web-core/dist/components';

defineCustomElements();

const params = new URLSearchParams(location.search);
const component = params.get('c') || '';
const brand = params.get('brand') || 'gol';
const theme = params.get('theme') || 'light';
const background = params.get('background') || '';
const args = JSON.parse(params.get('args') || '{}') as Record<string, unknown>;
const slots = JSON.parse(params.get('slots') || '{}') as Record<
  string,
  string | {icon: string}
>;
const context = JSON.parse(params.get('context') || 'null') as {
  kind: 'form';
  id: string;
} | null;

document.documentElement.toggleAttribute('data-theme', theme === 'dark');
if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
if (brand !== 'gol') document.documentElement.setAttribute('data-brand', brand);
else document.documentElement.removeAttribute('data-brand');
document.body.style.background = background;

const root = document.getElementById('evidence-root')!;
const container = context?.kind === 'form'
  ? document.createElement('form')
  : document.createElement('div');
if (context?.kind === 'form') {
  container.id = context.id;
  container.addEventListener('submit', event => event.preventDefault());
}
const element = document.createElement(component) as HTMLElement & Record<string, unknown>;
Object.assign(element, args);
for (const [name, value] of Object.entries(slots)) {
  const slot = document.createElement('span');
  if (name) slot.setAttribute('slot', name);
  if (typeof value === 'string') slot.innerHTML = value;
  else slot.appendChild(document.createElement(`tgr-icon-${value.icon}`));
  element.appendChild(slot);
}
container.appendChild(element);
root.appendChild(container);
