import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const publicRoot = new URL('./public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', publicRoot), 'utf8'));
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function pngDimensions(path) {
  const image = readFileSync(new URL(path, publicRoot));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.subarray(12, 16).toString(), 'IHDR');
  return `${image.readUInt32BE(16)}x${image.readUInt32BE(20)}`;
}

test('manifest launches standalone within its deployment directory', () => {
  assert.equal(manifest.name, 'Address Book');
  assert.equal(manifest.short_name, 'Address Book');
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.match(html, new RegExp(`<meta name="theme-color" content="${manifest.theme_color}"`));
  const deployedManifest = new URL('https://example.test/address-book/manifest.webmanifest');
  assert.equal(new URL(manifest.start_url, deployedManifest).pathname, '/address-book/');
});

test('manifest includes valid standard and maskable PNG installation icons', () => {
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some((icon) => icon.sizes === size && icon.purpose === 'any'));
  }
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512'));
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    assert.equal(pngDimensions(icon.src), icon.sizes);
  }
});

test('HTML links the manifest and Apple home-screen resources using the deployment base', () => {
  assert.match(html, /rel="manifest" href="%BASE_URL%manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="%BASE_URL%icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Address Book"/);
  assert.equal(pngDimensions('icons/apple-touch-icon.png'), '180x180');
});