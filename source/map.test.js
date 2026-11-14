import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const initialization = source.slice(source.indexOf('async function initializeAddressMap()'), source.indexOf('function createContactPopup(')).replaceAll('import(', 'loadModule(');
const mapPage = source.slice(source.indexOf('function mapPage()'), source.indexOf('function destroyAddressMap()'));
const navigation = source.slice(source.indexOf('function navigation()'), source.indexOf('function contactsPage()'));

function mapHarness({ contact = false, geolocation } = {}) {
  const calls = { locations: [], geocoding: [], graphics: [], toasts: [] };
  const popup = {};
  const entry = { id: 'contact', name: 'Test Contact', home: 'Home address', business: 'Work address' };
  const location = { longitude: -117.1956, latitude: 34.0564 };
  const mapElement = {
    viewOnReady: async () => {},
    view: {
      goTo: async (target) => calls.locations.push(target),
      graphics: { add: (graphic) => calls.graphics.push(graphic) },
    },
    querySelector: () => popup,
  };
  const context = {
    arcgisApiKey: 'test-key',
    mapGeneration: 0,
    mapContactId: contact ? entry.id : null,
    mapLocationType: 'home',
    addressMapView: null,
    contacts: [entry],
    settings: { mapType: 'imagery' },
    navigator: { geolocation },
    document: { querySelector: () => mapElement },
    console,
    GEOCODING_URL: 'https://example.test/geocode',
    addressLine: (address) => address,
    displayName: (person) => person.name,
    escapeHtml: (value) => value,
    createContactPopup: () => {},
    showToast: (message) => calls.toasts.push(message),
    loadModule: async (path) => {
      if (path.endsWith('/Map.js') || path.endsWith('/Graphic.js')) {
        return { default: class { constructor(options) { Object.assign(this, options); } } };
      }
      if (path.endsWith('/locator.js')) {
        return {
          addressToLocations: async (url, options) => {
            calls.geocoding.push(options.address.SingleLine);
            return [{ location }];
          },
        };
      }
      return {};
    },
  };
  runInNewContext(`${initialization}\n${mapPage}\n${navigation}`, context);
  return { calls, context, mapElement, popup, location };
}

test('navigation puts the Map pin between the divider and Settings', () => {
  const { context } = mapHarness();
  context.selectedId = null;
  context.icon = (name) => `<svg data-icon="${name}"></svg>`;
  assert.match(context.navigation(), /nav-divider"><\/span><button class="nav-action" data-page="map"><svg data-icon="pin"><\/svg><span>Map<\/span><\/button><button class="nav-action" data-page="settings">/);
});

test('Map navigation clears the previous contact before rendering', () => {
  const { context } = mapHarness({ contact: true });
  let click;
  let rendered = false;
  context.document = {
    querySelectorAll: () => [{
      dataset: { page: 'map' },
      addEventListener: (event, handler) => { click = handler; },
    }],
  };
  context.render = () => {
    assert.equal(context.mapContactId, null);
    assert.equal(context.activePage, 'map');
    rendered = true;
  };
  context.window = { scrollTo: () => {} };
  const binding = source.slice(source.indexOf("document.querySelectorAll('[data-page]')"), source.indexOf("document.querySelectorAll('[data-action]')"));
  runInNewContext(binding, context);
  click({ preventDefault() {} });
  assert.equal(rendered, true);
});

test('standalone map renders without a contact and uses device coordinates', async () => {
  let requests = 0;
  const { context, calls, mapElement, popup } = mapHarness({
    geolocation: { getCurrentPosition(resolve) {
      requests += 1;
      resolve({ coords: { longitude: -73.9857, latitude: 40.7484 } });
    } },
  });
  assert.match(context.mapPage(), /id="address-map"/);
  assert.match(context.mapPage(), /Map showing current location/);
  await context.initializeAddressMap();
  assert.equal(requests, 1);
  assert.deepEqual(Array.from(calls.locations[0].center), [-73.9857, 40.7484]);
  assert.equal(calls.locations[0].zoom, 17);
  assert.equal(mapElement.map.basemap, 'arcgis/imagery');
  assert.equal(calls.geocoding.length, 0);
  assert.equal(calls.graphics.length, 0);
  assert.equal(popup.open, undefined);
});

test('opening a map offline reports that an Internet connection is required', async () => {
  const { context, calls, mapElement } = mapHarness({ contact: true });
  context.navigator.onLine = false;
  await context.initializeAddressMap();
  assert.deepEqual(calls.toasts, ['Maps require an Internet connection.']);
  assert.equal(calls.geocoding.length, 0);
  assert.equal(mapElement.map, undefined);
});

for (const type of ['home', 'business']) {
  test(`${type} contact map geocodes its address and opens its popup without device location`, async () => {
    const { context, calls, popup, location } = mapHarness({
      contact: true,
      geolocation: { getCurrentPosition() { assert.fail('Contact maps must not request device location'); } },
    });
    context.mapLocationType = type;
    assert.match(context.mapPage(), /Test Contact's address/);
    await context.initializeAddressMap();
    assert.deepEqual(calls.geocoding, [type === 'home' ? 'Home address' : 'Work address']);
    assert.equal(calls.locations[0].center, location);
    assert.equal(calls.graphics.length, 1);
    assert.equal(popup.open, true);
    assert.equal(popup.location, location);
  });
}

for (const geolocation of [undefined, { getCurrentPosition(resolve, reject) { reject(new Error('Permission denied')); } }]) {
  test(`unavailable device location keeps the map searchable (${geolocation ? 'denied' : 'unsupported'})`, async () => {
    const { context, calls, mapElement } = mapHarness({ geolocation });
    await context.initializeAddressMap();
    assert.equal(calls.locations.length, 0);
    assert.equal(calls.geocoding.length, 0);
    assert.equal(mapElement.map.basemap, 'arcgis/imagery');
    assert.match(calls.toasts[0], /Current location unavailable/);
  });
}

test('a device location response cannot move a map after navigation away', async () => {
  let resolvePosition;
  const { context, calls } = mapHarness({
    geolocation: { getCurrentPosition(resolve) { resolvePosition = resolve; } },
  });
  const pending = context.initializeAddressMap();
  while (!resolvePosition) await Promise.resolve();
  context.mapGeneration += 1;
  resolvePosition({ coords: { longitude: 12, latitude: 34 } });
  await pending;
  assert.equal(calls.locations.length, 0);
  assert.equal(calls.toasts.length, 0);
});