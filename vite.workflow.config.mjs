import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default {
  root,
  resolve: {
    alias: {
      '@sentinel/contracts': path.join(root, 'packages/contracts/src/index.ts'),
    },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: path.join(root, 'packages/scanner-adapters/src/workflow-runner.mjs'),
    outDir: path.join(root, 'templates/github-workflows'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'sentinel-runner.mjs',
      },
    },
  },
};
