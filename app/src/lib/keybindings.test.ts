import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interceptedBindings, HOTKEY_INTERCEPTIONS, activeKeyActions } from './keybindings.ts';

test('the AMD/IME clashes are only reported on Windows', () => {
  assert.equal(interceptedBindings({}, 'mac').length, 0);
  assert.equal(interceptedBindings({}, 'linux').length, 0);
  assert.ok(interceptedBindings({}, 'windows').length >= 8);
});

test('every listed chord belongs to an action that ships with it', () => {
  const defaults = new Set(activeKeyActions('windows').flatMap((a) => a.defaults));
  for (const h of HOTKEY_INTERCEPTIONS) {
    assert.ok(defaults.has(h.combo), `${h.combo} is not a default of any action`);
  }
});

test('no alternative lands on a chord another action already owns', () => {
  const owners = new Map<string, string>();
  for (const a of activeKeyActions('windows')) for (const c of a.defaults) owners.set(c, a.id);
  for (const b of interceptedBindings({}, 'windows')) {
    const owner = owners.get(b.alternative);
    assert.ok(!owner || owner === b.action.id, `${b.alternative} is taken by ${owner}`);
  }
});

test('a binding the user already moved is left alone', () => {
  const before = interceptedBindings({}, 'windows').map((b) => b.action.id);
  assert.ok(before.includes('file.import'));
  const after = interceptedBindings({ 'file.import': 'Mod+Alt+Shift+L' }, 'windows').map(
    (b) => b.action.id,
  );
  assert.ok(!after.includes('file.import'));
});

test('an unbound action is not reported', () => {
  const after = interceptedBindings({ 'view.toggleReading': null }, 'windows').map(
    (b) => b.action.id,
  );
  assert.ok(!after.includes('view.toggleReading'));
});

test('the preset would leave nothing intercepted', () => {
  const overrides: Record<string, string> = {};
  for (const b of interceptedBindings({}, 'windows')) overrides[b.action.id] = b.alternative;
  assert.deepEqual(interceptedBindings(overrides, 'windows'), []);
});
