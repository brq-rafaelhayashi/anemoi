import React, { createElement } from 'react';
import { createRoot } from 'react-dom/client';

// Tokens CSS e fonts
import '@gol-smiles/tangerina-token/dist/tokens.css';
import '@gol-smiles/tangerina-fonts/dist/fonts.css';

// Registra os custom elements (necessário pois o wrapper React não chama defineCustomElements)
import { defineCustomElements } from '@gol-smiles/tangerina-web-core/dist/components';
defineCustomElements();

// Todos os wrappers React
import * as Tgr from '@gol-smiles/tangerina-react';

// Lê querystring
const params = new URLSearchParams(location.search);
const component = params.get('c') ?? '';
const brand = params.get('brand') ?? 'gol';
const theme = params.get('theme') ?? 'light';
const args = JSON.parse(decodeURIComponent(params.get('args') || '%7B%7D'));

// Aplica brand/tema no <html> (convenção: gol = sem atributo, dark = data-theme="dark")
const htmlEl = document.documentElement;
if (brand && brand !== 'gol') {
  htmlEl.setAttribute('data-brand', brand);
} else {
  htmlEl.removeAttribute('data-brand');
}
if (theme === 'dark') {
  htmlEl.setAttribute('data-theme', 'dark');
} else {
  htmlEl.removeAttribute('data-theme');
}
document.body.style.background = theme === 'dark' ? '#211E1C' : '';

// Deriva o nome do export React: tgr-button → TgrButton
function toPascalCase(tagName: string): string {
  return (
    'Tgr' +
    tagName
      .replace(/^tgr-/, '')
      .replace(/(^|-)([a-z])/g, (_, __, ch: string) => ch.toUpperCase())
  );
}

const exportName = toPascalCase(component);
const Comp = (Tgr as Record<string, React.ComponentType<Record<string, unknown>>>)[exportName];

const rootEl = document.getElementById('evidence-root')!;
const root = createRoot(rootEl);

if (!Comp) {
  root.render(
    <div style={{ color: 'red', padding: '1rem', fontFamily: 'monospace' }}>
      Componente não encontrado: <strong>{exportName}</strong> (c={component}).<br />
      Exports disponíveis: {Object.keys(Tgr).join(', ')}
    </div>
  );
} else {
  root.render(createElement(Comp, args as React.ComponentProps<typeof Comp>));
}
