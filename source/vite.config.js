import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  }, VitePWA({
    manifest: false,
    injectRegister: 'script',
    registerType: 'prompt',
    includeAssets: ['favicon.ico', 'manifest.webmanifest', 'icons/*.png'],
    workbox: {
      globPatterns: ['**/*.{html,js,css,woff,woff2,ttf,png,gif,svg,ico,webmanifest}'],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      navigateFallback: 'index.html',
      runtimeCaching: [{
        urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'address-book-font-styles',
          expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      }, {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'address-book-font-files',
          expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      }],
    },
  })],
});