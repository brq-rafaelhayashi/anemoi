import '@gol-smiles/tangerina-token/dist/tokens.css';
import '@gol-smiles/tangerina-fonts/dist/fonts.css';
import {defineCustomElements} from '@gol-smiles/tangerina-web-core/dist/components';
import {iconTag, parseSceneQuery} from '../../scene-query';

defineCustomElements();

const params = new URLSearchParams(location.search);
const component = params.get('c') || '';
const brand = params.get('brand') || 'gol';
const theme = params.get('theme') || 'light';
const background = params.get('background') || '';
const {args, slots, context} = parseSceneQuery(params);

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
  if (typeof value === 'string') slot.textContent = value;
  else {
    const icon = document.createElement(iconTag(value.icon));
    icon.setAttribute('aria-hidden', 'true');
    slot.appendChild(icon);
  }
  element.appendChild(slot);
}
container.appendChild(element);
root.appendChild(container);
