import { toId } from '@storybook/csf';

// Carrega todos os arquivos de story do diretório de componentes via alias /stories
const allStories = import.meta.glob('/stories/**/*.stories.ts', { eager: true }) as Record<
  string,
  { default: { title: string; args?: Record<string, unknown> }; [key: string]: unknown }
>;

/**
 * Resolve os args combinados (meta.args + story.args) para um storyId e componente.
 * Varre todos os módulos de story, gera o id via toId(meta.title, exportName),
 * e retorna quando encontra o storyId procurado.
 */
export function resolveArgs(
  _component: string,
  storyId: string
): Record<string, unknown> {
  for (const [, mod] of Object.entries(allStories)) {
    const meta = mod.default;
    if (!meta?.title) continue;

    // Itera todos os exports nomeados (stories)
    for (const [exportName, story] of Object.entries(mod)) {
      if (exportName === 'default') continue;
      if (typeof story !== 'object' || story === null) continue;

      const id = toId(meta.title, exportName);
      if (id === storyId) {
        const storyObj = story as { args?: Record<string, unknown> };
        return {
          ...(meta.args ?? {}),
          ...(storyObj.args ?? {}),
        };
      }
    }
  }
  return {};
}
