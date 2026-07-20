export type SceneSlotValue = string | {icon: string};
export type SceneContext = {kind: 'form'; id: string} | null;

export interface ParsedSceneQuery {
  args: Record<string, unknown>;
  slots: Record<string, SceneSlotValue>;
  context: SceneContext;
}

const SAFE_IDENTIFIER = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseParam(params: URLSearchParams, name: string, fallback: string): unknown {
  return JSON.parse(params.get(name) ?? fallback);
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`${label} invalido: ${JSON.stringify(value)}`);
  }
}

function parseSlots(value: unknown): Record<string, SceneSlotValue> {
  if (!isRecord(value)) throw new Error('Slots invalidos: esperado objeto.');

  const slots: Record<string, SceneSlotValue> = {};
  for (const [name, slotValue] of Object.entries(value)) {
    if (name) assertSafeIdentifier(name, 'Nome de slot');
    if (typeof slotValue === 'string') {
      slots[name] = slotValue;
      continue;
    }
    if (
      !isRecord(slotValue) ||
      Object.keys(slotValue).length !== 1 ||
      typeof slotValue['icon'] !== 'string'
    ) {
      throw new Error(`Valor do slot ${JSON.stringify(name)} invalido.`);
    }
    assertSafeIdentifier(slotValue['icon'], 'Nome de icone');
    slots[name] = {icon: slotValue['icon']};
  }
  return slots;
}

function parseContext(value: unknown): SceneContext {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    value['kind'] !== 'form' ||
    typeof value['id'] !== 'string' ||
    value['id'].length === 0
  ) {
    throw new Error('Contexto invalido: esperado form com id.');
  }
  return {kind: 'form', id: value['id']};
}

export function iconTag(icon: string): string {
  assertSafeIdentifier(icon, 'Nome de icone');
  return `tgr-icon-${icon}`;
}

export function parseSceneQuery(params: URLSearchParams): ParsedSceneQuery {
  const args = parseParam(params, 'args', '{}');
  if (!isRecord(args)) throw new Error('Args invalidos: esperado objeto.');
  return {
    args,
    slots: parseSlots(parseParam(params, 'slots', '{}')),
    context: parseContext(parseParam(params, 'context', 'null')),
  };
}
