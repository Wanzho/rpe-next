import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorPlayback } from '../src/application/playback.mjs';
import { wheelUnits } from '../src/core/edit-grid.mjs';
import { DEFAULT_HOTKEYS, migratePreferences, shortcutAction } from '../src/core/preferences.mjs';
import { validateHotkeys } from '../src/core/hotkey-settings.mjs';
import { readEditorPreferences, writeEditorPreferences } from '../src/platform/editor-preferences.mjs';

function playback() {
  const audio = { time: 10, duration: 120, rate: 1, pauses: 0,
    pause() { this.pauses++; }, seek(time) { this.time = time; } };
  return { audio, player: new EditorPlayback(audio, { stop() {} }, () => {}) };
}
const settings = { scrollSpeed: 5, scrollAcceleration: true };
test('equal trackpad distance produces equal movement regardless of event frequency', () => {
  const a = playback(), b = playback();
  a.player.wheel({ deltaY: -100, deltaMode: 0 }, settings, 0);
  for (let i = 0; i < 200; i++) b.player.wheel({ deltaY: -0.5, deltaMode: 0 }, settings, i / 50);
  assert.ok(Math.abs(a.audio.time - b.audio.time) < 1e-10);
  assert.ok(b.audio.time > 10);
});
test('wheel units normalize pixel, line and page input', () => {
  assert.equal(wheelUnits({ deltaY: 100, deltaMode: 0 }), 1);
  assert.equal(wheelUnits({ deltaY: 3, deltaMode: 1 }), 1);
  assert.equal(wheelUnits({ deltaY: 1, deltaMode: 2 }), 1);
});
test('zero, invalid, horizontal and pinch gestures do not pause playback', () => {
  const { audio, player } = playback();
  for (const event of [{ deltaY: 0 }, { deltaY: NaN }, { deltaY: Infinity }, { deltaY: 1, deltaX: 20 }, { deltaY: -2, ctrlKey: true }]) player.wheel(event, settings, 0);
  assert.equal(audio.time, 10); assert.equal(audio.pauses, 0);
});
test('legacy steps remain available and Alt retains its speed multiplier', () => {
  const a = playback(), b = playback(), c = playback();
  a.player.wheel({ deltaY: -1 }, { ...settings, smoothScrolling: false }, 0);
  b.player.wheel({ deltaY: -100 }, settings, 0);
  c.player.wheel({ deltaY: -100, altKey: true }, settings, 0);
  assert.equal(a.audio.time, b.audio.time);
  assert.ok(Math.abs((c.audio.time - 10) / (b.audio.time - 10) - 5) < 1e-10);
});
test('smooth scrolling preference survives reload in both states', () => {
  let value; const storage = { getItem: () => value, setItem: (key, next) => { value = next; } };
  for (const smoothScrolling of [true, false]) {
    writeEditorPreferences({ smoothScrolling }, storage);
    assert.deepEqual(readEditorPreferences(storage), { smoothScrolling });
  }
});
test('navigation and settings shortcuts can be rebound, cleared and migrated', () => {
  assert.equal(validateHotkeys(DEFAULT_HOTKEYS).valid, true);
  const defaults = migratePreferences();
  assert.equal(shortcutAction({ key: 'ArrowUp', altKey: true }, defaults), 'PreviousLine');
  assert.equal(shortcutAction({ key: 'ArrowDown', altKey: true }, defaults), 'NextLine');
  assert.equal(shortcutAction({ key: 'K', metaKey: true, shiftKey: true }, defaults), 'OpenHotkeySettings');
  const custom = migratePreferences('{}', 'PreviousLine F6\nNextLine NONE\nOpenHotkeySettings F7');
  assert.equal(shortcutAction({ key: 'F6' }, custom), 'PreviousLine');
  assert.equal(shortcutAction({ key: 'ArrowUp', altKey: true }, custom), undefined);
  assert.equal(shortcutAction({ key: 'ArrowDown', altKey: true }, custom), undefined);
  assert.equal(shortcutAction({ key: 'F7' }, custom), 'OpenHotkeySettings');
  assert.equal(validateHotkeys({ ...DEFAULT_HOTKEYS, PreviousLine: 'Q' }).valid, false);
});
