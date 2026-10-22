import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REFOCUS_COALESCE_MS, onRefocus, type RefocusEnvironment } from './refocus';

/** A window and a document that only remember their listeners, and a clock the test moves. */
function fakeEnvironment() {
  const listeners = new Map<string, Set<() => void>>();
  const target = (name: string) => ({
    addEventListener: (type: string, listener: () => void) => { (listeners.get(`${name}:${type}`) ?? listeners.set(`${name}:${type}`, new Set()).get(`${name}:${type}`)!).add(listener); },
    removeEventListener: (type: string, listener: () => void) => { listeners.get(`${name}:${type}`)?.delete(listener); },
  });
  const state = { now: 1_000_000, visibility: 'visible' };
  const environment: RefocusEnvironment = {
    window: target('window'),
    document: { ...target('document'), get visibilityState() { return state.visibility; } },
    now: () => state.now,
  };
  const fire = (name: 'window:focus' | 'document:visibilitychange') => { for (const listener of [...(listeners.get(name) ?? [])]) listener(); };
  const count = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  return { environment, state, fire, count };
}

test('coming back to the tab calls back, by window focus and by the tab becoming visible', () => {
  const { environment, state, fire } = fakeEnvironment();
  let calls = 0;
  onRefocus(() => { calls += 1; }, environment);
  fire('window:focus');
  assert.equal(calls, 1);
  state.now += REFOCUS_COALESCE_MS;
  fire('document:visibilitychange');
  assert.equal(calls, 2);
});

test('the focus and visibility events of one switch to the tab call back once', () => {
  const { environment, state, fire } = fakeEnvironment();
  let calls = 0;
  onRefocus(() => { calls += 1; }, environment);
  fire('document:visibilitychange');
  state.now += 5;
  fire('window:focus');
  state.now += REFOCUS_COALESCE_MS - 10;
  fire('window:focus');
  assert.equal(calls, 1, 'events inside the coalescing time are one switch');
  state.now += 20;
  fire('window:focus');
  assert.equal(calls, 2, 'the next switch is a new one');
});

test('a hidden tab never calls back', () => {
  const { environment, state, fire } = fakeEnvironment();
  let calls = 0;
  onRefocus(() => { calls += 1; }, environment);
  state.visibility = 'hidden';
  fire('document:visibilitychange');
  fire('window:focus');
  assert.equal(calls, 0);
  state.visibility = 'visible';
  fire('document:visibilitychange');
  assert.equal(calls, 1);
});

test('the returned function removes both listeners', () => {
  const { environment, fire, count } = fakeEnvironment();
  let calls = 0;
  const stop = onRefocus(() => { calls += 1; }, environment);
  assert.equal(count(), 2);
  stop();
  assert.equal(count(), 0);
  fire('window:focus');
  fire('document:visibilitychange');
  assert.equal(calls, 0);
});

test('outside a browser it does nothing and can still be stopped', () => {
  const stop = onRefocus(() => assert.fail('no browser, no event'));
  assert.doesNotThrow(stop);
});
