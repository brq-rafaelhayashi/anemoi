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

// Ícones dos assets — barrel completo; o mapeamento nome→export replica o
// toPascalCase do generate.mjs do assets-react (add → TgrIconAdd).
import * as TgrIcons from '@gol-smiles/tangerina-assets-react/icons';

function iconExportName(iconName: string): string {
  return (
    'TgrIcon' +
    iconName
      .replace(/^\d+[-_\s]?/, '')
      .replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/^(.)/, (_, c: string) => c.toUpperCase())
  );
}

// Lê querystring
const params = new URLSearchParams(location.search);
const component = params.get('c') ?? '';
const brand = params.get('brand') ?? 'gol';
const theme = params.get('theme') ?? 'light';
const background = params.get('background') ?? '';
const args = JSON.parse(decodeURIComponent(params.get('args') || '%7B%7D'));
// slots: mapa nome→HTML. Chave '' = default slot (sem atributo slot).
// Espelha o GenericStage.tsx do mfe-react do Koba: um <span slot> por entrada.
const slots: Record<string, string | { icon: string }> = JSON.parse(
  decodeURIComponent(params.get('slots') || '%7B%7D')
);

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
document.body.style.background = background;

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
  const slotChildren = Object.entries(slots).map(([name, value]) => {
    if (value !== null && typeof value === 'object') {
      const IconComp = (TgrIcons as Record<string, React.ComponentType<Record<string, unknown>>>)[
        iconExportName(value.icon)
      ];
      if (!IconComp) {
        return createElement(
          'span',
          { key: name || '__default__', ...(name ? { slot: name } : {}) },
          `Ícone não encontrado: ${value.icon}`
        );
      }
      return createElement(IconComp, {
        key: name || '__default__',
        ...(name ? { slot: name } : {}),
        'aria-hidden': 'true',
      });
    }
    return createElement('span', {
      key: name || '__default__',
      ...(name ? { slot: name } : {}),
      dangerouslySetInnerHTML: { __html: value ?? '' },
    });
  });
  root.render(createElement(Comp, args as React.ComponentProps<typeof Comp>, ...slotChildren));
}
