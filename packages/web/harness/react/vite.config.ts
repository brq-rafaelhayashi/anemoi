import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repo = process.env.DS_REPO;

if (!repo) {
  throw new Error('DS_REPO must point to the configured tangerina-web-core checkout.');
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gol-smiles/tangerina-react': path.join(
        repo,
        'packages/components-react/dist/index.mjs'
      ),
      // dir-alias: cobre subpaths como /dist/components e /dist/components/tgr-button.js
      '@gol-smiles/tangerina-web-core': path.join(repo, 'packages/components'),
      '@gol-smiles/tangerina-token': path.join(repo, 'packages/tokens'),
      '@gol-smiles/tangerina-fonts': path.join(repo, 'packages/fonts'),
    },
  },
  build: { emptyOutDir: true },
});
