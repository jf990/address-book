import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

let faviconRoot;

export default defineConfig({
  plugins: [{
    name: 'copy-favicons',
    apply: 'build',
    configResolved(config) {
      faviconRoot = config.root;
    },
    writeBundle(outputOptions) {
      for (const entry of readdirSync(faviconRoot, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.startsWith('favicon.')) {
          copyFileSync(resolve(faviconRoot, entry.name), resolve(outputOptions.dir, entry.name));
        }
      }
    },
  }],
});