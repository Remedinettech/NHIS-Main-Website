import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_FOCUS_WATCH_MS, focusPageHeading, type Focusable, type RouteFocusEnvironment } from './routeFocus';

/** A page that only knows which element holds the focus, and lets the test replace the heading, press keys and move the clock. */
function fakePage() {
  const body = { name: 'body' };
  let active: unknown = body;
  let heading: (Focusable & { name: string }) | null = null;
  const log: string[] = [];
  const elements = new Map<string, Focusable & { name: string }>();
  const get = (name: string) => {
    let created = elements.get(name);
    if (!created) {
      const next: Focusable & { name: string } = { name, focus: () => { active = next; log.push(`focus ${name}`); } };
      elements.set(name, next);
      created = next;
    }
    return created;
  };

  const contentListeners = new Set<() => void>();
  const inputListeners = new Set<() => void>();
  const timers: Array<{ at: number; callback: () => void; live: boolean }> = [];
  let now = 0;
  const main = get('main');

  const environment: RouteFocusEnvironment = {
    heading: () => heading,
    active: () => active,
    main,
    body,
    onContentChange: (callback) => { contentListeners.add(callback); return () => contentListeners.delete(callback); },
    onVisitorInput: (callback) => { inputListeners.add(callback); return () => inputListeners.delete(callback); },
    after: (ms, callback) => { const timer = { at: now + ms, callback, live: true }; timers.push(timer); return () => { timer.live = false; }; },
  };
  return {
    environment, log, main,
    get active() { return active; },
    /** The page draws a heading: a new element replaces the old one (which is removed from the page; the focus falls to the body). */
    drawHeading(name: string) {
      if (active === heading) active = body;
      heading = get(name);
      for (const callback of [...contentListeners]) callback();
    },
    /** The visitor puts the focus on some other element. */
    visitorFocuses(name: string) { active = get(name); },
    press() { for (const callback of [...inputListeners]) callback(); },
    wait(ms: number) { now += ms; for (const timer of timers) if (timer.live && timer.at <= now) { timer.live = false; timer.callback(); } },
    listeners: () => contentListeners.size + inputListeners.size,
  };
}

test('the heading gets the focus at once; without a heading main holds it', () => {
  const page = fakePage();
  page.drawHeading('h1 first');
  focusPageHeading(page.environment);
  assert.equal((page.active as { name: string }).name, 'h1 first');

  const waiting = fakePage();
  focusPageHeading(waiting.environment);
  assert.equal(waiting.active, waiting.main, 'no heading yet: focus main, as before');
});

test('a heading that replaces the first one when the text arrives gets the focus, which would have fallen to the body', () => {
  const page = fakePage();
  page.drawHeading('h1 loading');
  focusPageHeading(page.environment);
  page.drawHeading('h1 loaded');
  assert.equal((page.active as { name: string }).name, 'h1 loaded');
  assert.deepEqual(page.log, ['focus h1 loading', 'focus h1 loaded']);
});

test('while the page has no heading yet, main holds the focus and the first heading takes it over', () => {
  const page = fakePage();
  focusPageHeading(page.environment);
  assert.equal(page.active, page.main);
  page.drawHeading('h1');
  assert.equal((page.active as { name: string }).name, 'h1');
});

test('focus that the visitor moved is never taken back', () => {
  const page = fakePage();
  page.drawHeading('h1 loading');
  focusPageHeading(page.environment);
  page.visitorFocuses('search field');
  page.drawHeading('h1 loaded');
  assert.equal((page.active as { name: string }).name, 'search field');
});

test('the first key or pointer press ends the watch', () => {
  const page = fakePage();
  page.drawHeading('h1 loading');
  focusPageHeading(page.environment);
  page.press();
  assert.equal(page.listeners(), 0, 'every listener is removed');
  page.drawHeading('h1 loaded');
  assert.equal(page.active, (page.environment.body), 'nothing is focused any more: the visitor has taken over');
});

test('the watch ends after the time limit and leaves no listener behind', () => {
  const page = fakePage();
  page.drawHeading('h1 loading');
  const stop = focusPageHeading(page.environment);
  page.wait(ROUTE_FOCUS_WATCH_MS - 1);
  page.drawHeading('h1 slow');
  assert.equal((page.active as { name: string }).name, 'h1 slow', 'a slow page still gets its heading focused');
  page.wait(1);
  assert.equal(page.listeners(), 0);
  page.drawHeading('h1 much too late');
  assert.ok(!page.log.includes('focus h1 much too late'), 'after the watch the focus is not given again');
  assert.doesNotThrow(stop, 'stopping twice is harmless');
});

test('the returned function ends the watch at a new route change', () => {
  const page = fakePage();
  page.drawHeading('h1');
  const stop = focusPageHeading(page.environment);
  stop();
  assert.equal(page.listeners(), 0);
});

test('outside a browser it does nothing and can still be stopped', () => {
  assert.doesNotThrow(focusPageHeading(undefined));
});
