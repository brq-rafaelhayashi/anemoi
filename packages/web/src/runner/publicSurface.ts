import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type NamedType = {name: string; type: string};

export interface PublicSurface {
  component: string;
  wc: {
    attributes: NamedType[];
    properties: NamedType[];
    events: NamedType[];
    slots: string[];
  };
  react: {exportName: string; events: string[]};
  angular: {
    selector: string;
    inputs: string[];
    outputs: string[];
    projectableSlots: string[];
  };
}

interface CemNamedItem {
  name: string;
  type?: {text?: string};
}

interface CemDeclaration {
  tagName?: string;
  attributes?: CemNamedItem[];
  members?: Array<CemNamedItem & {kind?: string}>;
  events?: CemNamedItem[];
  slots?: Array<{name?: string}>;
}

interface CemModule {
  declarations?: CemDeclaration[];
}

interface CustomElementsManifest {
  modules?: CemModule[];
}

function sortNamed(values: NamedType[]) {
  return values.sort((a, b) => a.name.localeCompare(b.name));
}

function pascalCase(component: string) {
  return component.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
}

function parseTypes(file: string) {
  const sourceText = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function propertyName(node: ts.PropertyName | undefined) {
  if (!node) return '';
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : '';
}

function reactSurface(file: string, exportName: string) {
  const source = parseTypes(file);
  let found = false;
  let eventTypeName = '';
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  source.forEachChild(node => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node);
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) continue;
      found = true;
      if (declaration.type && ts.isTypeReferenceNode(declaration.type)) {
        const eventType = declaration.type.typeArguments?.[1];
        if (eventType && ts.isTypeReferenceNode(eventType) && ts.isIdentifier(eventType.typeName)) {
          eventTypeName = eventType.typeName.text;
        }
      }
    }
  });
  if (!found) throw new Error(`Wrapper React nao exporta ${exportName}.`);
  const alias = aliases.get(eventTypeName);
  const events = alias && ts.isTypeLiteralNode(alias.type)
    ? alias.type.members.map(member => propertyName(member.name)).filter(Boolean).sort()
    : [];
  return {exportName, events};
}

function angularSurface(file: string, className: string, component: string) {
  const source = parseTypes(file);
  let selector = '';
  let inputs: string[] = [];
  let projectableSlots: string[] = [];
  const outputs: string[] = [];
  source.forEachChild(node => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      const cmp = node.members.find(member => propertyName(member.name) === 'ɵcmp');
      if (cmp && ts.isPropertyDeclaration(cmp) && cmp.type && ts.isTypeReferenceNode(cmp.type)) {
        const args = cmp.type.typeArguments || [];
        if (args[1] && ts.isLiteralTypeNode(args[1]) && ts.isStringLiteral(args[1].literal)) {
          selector = args[1].literal.text;
        }
        if (args[3] && ts.isTypeLiteralNode(args[3])) {
          inputs = args[3].members.map(member => propertyName(member.name)).filter(Boolean).sort();
        }
        if (args[6] && ts.isTupleTypeNode(args[6])) {
          projectableSlots = args[6].elements
            .filter(ts.isLiteralTypeNode)
            .map(item => ts.isStringLiteral(item.literal) ? item.literal.text : '')
            .filter(Boolean)
            .sort();
        }
      }
    }
    if (ts.isInterfaceDeclaration(node) && node.name.text === className) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member)
          && member.type
          && member.type.getText(source).startsWith('EventEmitter<')) {
          outputs.push(propertyName(member.name));
        }
      }
    }
  });
  if (selector !== component) throw new Error(`Wrapper Angular nao expoe o seletor ${component}.`);
  return {selector, inputs, outputs: outputs.sort(), projectableSlots};
}

export function readPublicSurface(
  repo: string,
  component: string,
  overrides: {cemPath?: string; reactPath?: string; angularPath?: string} = {},
): PublicSurface {
  const cemPath = overrides.cemPath || path.join(repo, 'packages/components/custom-elements.json');
  const reactPath = overrides.reactPath || path.join(repo, 'packages/components-react/dist/index.d.ts');
  const angularPath = overrides.angularPath || path.join(repo, 'packages/components-angular/dist/index.d.ts');
  const cem = JSON.parse(fs.readFileSync(cemPath, 'utf8')) as CustomElementsManifest;
  const declaration = (cem.modules || []).flatMap(module => module.declarations || [])
    .find(item => item.tagName === component);
  if (!declaration) throw new Error(`Custom Elements Manifest nao declara ${component}.`);
  const named = (items: CemNamedItem[] = []) =>
    sortNamed(items.map(item => ({name: item.name, type: item.type?.text || 'unknown'})));
  const exportName = pascalCase(component);
  return {
    component,
    wc: {
      attributes: named(declaration.attributes),
      properties: named((declaration.members || []).filter(item => item.kind === 'field')),
      events: named(declaration.events),
      slots: (declaration.slots || []).map(slot => slot.name || '').sort(),
    },
    react: reactSurface(reactPath, exportName),
    angular: angularSurface(angularPath, exportName, component),
  };
}
