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

function angularInputAliases(node: ts.TypeNode, className: string) {
  if (!ts.isTypeLiteralNode(node)) {
    throw new Error(`Wrapper Angular ${className} possui mapping de inputs nao reconhecido.`);
  }
  return node.members.map(member => {
    if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type)) {
      throw new Error(`Wrapper Angular ${className} possui mapping de inputs nao reconhecido.`);
    }
    const alias = member.type.members.find(item => propertyName(item.name) === 'alias');
    if (!alias || !ts.isPropertySignature(alias) || !alias.type
      || !ts.isLiteralTypeNode(alias.type) || !ts.isStringLiteral(alias.type.literal)) {
      throw new Error(`Wrapper Angular ${className} possui mapping de inputs nao reconhecido.`);
    }
    return alias.type.literal.text;
  }).sort();
}

function angularOutputAliases(node: ts.TypeNode, className: string) {
  if (!ts.isTypeLiteralNode(node)) {
    throw new Error(`Wrapper Angular ${className} possui mapping de outputs nao reconhecido.`);
  }
  return node.members.map(member => {
    if (!ts.isPropertySignature(member) || !member.type
      || !ts.isLiteralTypeNode(member.type) || !ts.isStringLiteral(member.type.literal)) {
      throw new Error(`Wrapper Angular ${className} possui mapping de outputs nao reconhecido.`);
    }
    return member.type.literal.text;
  }).sort();
}

function reactSurface(file: string, exportName: string) {
  const source = parseTypes(file);
  const aliases = new Map<string, ts.TypeAliasDeclaration>();
  const declarations = new Map<string, ts.VariableDeclaration>();
  const inlineExports = new Set<string>();
  const namedExportTargets = new Map<string, string>();
  source.forEachChild(node => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node);
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && !node.moduleSpecifier
      && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        if (!element.isTypeOnly) {
          namedExportTargets.set(element.name.text, element.propertyName?.text || element.name.text);
        }
      }
    }
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      declarations.set(declaration.name.text, declaration);
      if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        inlineExports.add(declaration.name.text);
      }
    }
  });
  const localName = inlineExports.has(exportName)
    ? exportName
    : namedExportTargets.get(exportName);
  if (!localName) {
    throw new Error(`Wrapper React nao exporta ${exportName}.`);
  }
  const localDeclaration = declarations.get(localName);
  if (!localDeclaration) {
    throw new Error(`Wrapper React exporta ${exportName} sem declarar ${localName}.`);
  }
  const declarationType = localDeclaration.type;
  if (!declarationType || !ts.isTypeReferenceNode(declarationType)
    || !ts.isIdentifier(declarationType.typeName)
    || declarationType.typeName.text !== 'StencilReactComponent'
    || declarationType.typeArguments?.length !== 2) {
    throw new Error(`Wrapper React ${exportName} possui formato de eventos nao reconhecido.`);
  }
  const eventType = declarationType.typeArguments[1];
  if (!ts.isTypeReferenceNode(eventType) || !ts.isIdentifier(eventType.typeName)) {
    throw new Error(`Wrapper React ${exportName} possui formato de eventos nao reconhecido.`);
  }
  const eventTypeName = eventType.typeName.text;
  const alias = aliases.get(eventTypeName);
  if (!alias || !ts.isTypeLiteralNode(alias.type)) {
    throw new Error(`Wrapper React ${exportName} possui formato de eventos nao reconhecido.`);
  }
  const events = alias.type.members.map(member => {
    const name = propertyName(member.name);
    if (!name || !ts.isPropertySignature(member) || !member.type
      || !ts.isTypeReferenceNode(member.type) || !ts.isIdentifier(member.type.typeName)
      || member.type.typeName.text !== 'EventName' || member.type.typeArguments?.length !== 1) {
      throw new Error(`Wrapper React ${exportName} possui formato de eventos nao reconhecido.`);
    }
    return name;
  });
  return {exportName, events: events.sort()};
}

function angularSurface(file: string, className: string, component: string) {
  const source = parseTypes(file);
  let selector = '';
  let inputs: string[] = [];
  let outputs: string[] = [];
  let projectableSlots: string[] = [];
  source.forEachChild(node => {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      const cmp = node.members.find(member => propertyName(member.name) === 'ɵcmp');
      if (cmp && ts.isPropertyDeclaration(cmp) && cmp.type && ts.isTypeReferenceNode(cmp.type)) {
        const args = cmp.type.typeArguments || [];
        if (args[1] && ts.isLiteralTypeNode(args[1]) && ts.isStringLiteral(args[1].literal)) {
          selector = args[1].literal.text;
        }
        if (!args[3]) {
          throw new Error(`Wrapper Angular ${className} possui mapping de inputs nao reconhecido.`);
        }
        inputs = angularInputAliases(args[3], className);
        if (!args[4]) {
          throw new Error(`Wrapper Angular ${className} possui mapping de outputs nao reconhecido.`);
        }
        outputs = angularOutputAliases(args[4], className);
        if (args[6] && ts.isTupleTypeNode(args[6])) {
          projectableSlots = args[6].elements
            .filter(ts.isLiteralTypeNode)
            .map(item => ts.isStringLiteral(item.literal) ? item.literal.text : '')
            .filter(Boolean)
            .sort();
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
  const named = (items: CemNamedItem[] = [], label: string) => sortNamed(items.map(item => {
    const type = item.type?.text;
    if (!type) throw new Error(`Custom Elements Manifest declara ${label} ${item.name} sem tipo.`);
    return {name: item.name, type};
  }));
  const exportName = pascalCase(component);
  return {
    component,
    wc: {
      attributes: named(declaration.attributes, 'atributo'),
      properties: named(
        (declaration.members || []).filter(item => item.kind === 'field'),
        'propriedade',
      ),
      events: named(declaration.events, 'evento'),
      slots: (declaration.slots || []).map(slot => slot.name || '').sort(),
    },
    react: reactSurface(reactPath, exportName),
    angular: angularSurface(angularPath, exportName, component),
  };
}
