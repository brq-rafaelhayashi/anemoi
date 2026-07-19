import fs from 'node:fs';
import path from 'node:path';
import type {BrowserName, SupportMatrix} from './types.ts';

const ALLOWED = new Set<BrowserName>(['chromium', 'firefox', 'webkit']);

export function loadSupportMatrix(repo: string): SupportMatrix {
  const file = path.join(repo, 'packages', 'components', 'browser-support.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Matriz de Suporte invalida: browser-support.json ausente em ${file}.`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<SupportMatrix>;
  const required = Array.isArray(raw.required) ? raw.required : [];
  const optional = Array.isArray(raw.optional) ? raw.optional : [];
  const all = [...required, ...optional];
  const valid = raw.schemaVersion === 1
    && required.length > 0
    && all.every(browser => ALLOWED.has(browser as BrowserName))
    && new Set(all).size === all.length;
  if (!valid) {
    throw new Error(`Matriz de Suporte invalida em ${file}.`);
  }
  return {schemaVersion: 1, required, optional} as SupportMatrix;
}
