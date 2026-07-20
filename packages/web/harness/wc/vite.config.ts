import {defineConfig} from 'vite';
import path from 'node:path';

const repo = process.env.DS_REPO;
if (!repo) throw new Error('DS_REPO must point to the configured tangerina-web-core checkout.');

export default defineConfig({
  resolve: {
    alias: {
      '@gol-smiles/tangerina-web-core': path.join(repo, 'packages/components'),
      '@gol-smiles/tangerina-token': path.join(repo, 'packages/tokens'),
      '@gol-smiles/tangerina-fonts': path.join(repo, 'packages/fonts'),
    },
  },
  build: {emptyOutDir: true},
});
