import type {ContractDefinition, SceneDefinition} from './types.ts';

export function defineContract(definition: ContractDefinition): ContractDefinition {
  return definition;
}

export function validateContract(contract: ContractDefinition, scenes: SceneDefinition[]) {
  const sceneIds = new Set(scenes.map(scene => scene.id));
  const required = [...new Set(contract.requiredBehaviors)].sort();
  const requiredSet = new Set(required);
  const routeIds = new Set<string>();
  const coveredSet = new Set<string>();

  for (const route of contract.routes) {
    if (routeIds.has(route.id)) throw new Error(`Roteiro duplicado: ${route.id}.`);
    routeIds.add(route.id);
    if (!sceneIds.has(route.sceneId)) throw new Error(`Cena inexistente no Roteiro ${route.id}: ${route.sceneId}.`);
    for (const behavior of route.covers) {
      if (!requiredSet.has(behavior)) {
        throw new Error(`Roteiro ${route.id} cobre comportamento nao declarado: ${behavior}.`);
      }
      coveredSet.add(behavior);
    }
  }

  const covered = [...coveredSet].sort();
  return {required, covered, missing: required.filter(id => !coveredSet.has(id))};
}
