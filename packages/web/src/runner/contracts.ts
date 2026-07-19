import type {ContractDefinition, SceneDefinition} from './types.ts';

export function defineContract(definition: ContractDefinition): ContractDefinition {
  return definition;
}

function invalidId(id: string): boolean {
  return typeof id !== 'string' || id.trim() === '' || id !== id.trim();
}

export function validateContract(contract: ContractDefinition, scenes: SceneDefinition[]) {
  const sceneIds = new Set<string>();
  for (const scene of scenes) {
    if (invalidId(scene.id)) throw new Error(`ID de Cena invalido: ${JSON.stringify(scene.id)}.`);
    if (sceneIds.has(scene.id)) throw new Error(`Cena duplicada: ${scene.id}.`);
    sceneIds.add(scene.id);
  }

  const requiredSet = new Set<string>();
  for (const behavior of contract.requiredBehaviors) {
    if (invalidId(behavior)) {
      throw new Error(`ID de comportamento obrigatorio invalido: ${JSON.stringify(behavior)}.`);
    }
    if (requiredSet.has(behavior)) {
      throw new Error(`Comportamento obrigatorio duplicado: ${behavior}.`);
    }
    requiredSet.add(behavior);
  }

  const required = [...contract.requiredBehaviors].sort();
  const routeIds = new Set<string>();
  const coveredSet = new Set<string>();

  for (const route of contract.routes) {
    if (invalidId(route.id)) throw new Error(`ID de Roteiro invalido: ${JSON.stringify(route.id)}.`);
    if (routeIds.has(route.id)) throw new Error(`Roteiro duplicado: ${route.id}.`);
    routeIds.add(route.id);
    if (invalidId(route.sceneId)) {
      throw new Error(`Roteiro ${route.id} possui referencia de Cena invalida: ${JSON.stringify(route.sceneId)}.`);
    }
    if (!sceneIds.has(route.sceneId)) throw new Error(`Cena inexistente no Roteiro ${route.id}: ${route.sceneId}.`);
    if (route.covers.length === 0) throw new Error(`Roteiro ${route.id} nao referencia comportamentos.`);
    const routeBehaviors = new Set<string>();
    for (const behavior of route.covers) {
      if (invalidId(behavior)) {
        throw new Error(`Roteiro ${route.id} possui referencia de comportamento invalida: ${JSON.stringify(behavior)}.`);
      }
      if (routeBehaviors.has(behavior)) {
        throw new Error(`Roteiro ${route.id} possui referencia de comportamento duplicada: ${behavior}.`);
      }
      routeBehaviors.add(behavior);
      if (!requiredSet.has(behavior)) {
        throw new Error(`Roteiro ${route.id} cobre comportamento nao declarado: ${behavior}.`);
      }
      coveredSet.add(behavior);
    }
  }

  const covered = [...coveredSet].sort();
  return {required, covered, missing: required.filter(id => !coveredSet.has(id))};
}
