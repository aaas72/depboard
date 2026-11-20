import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * jsdom has no layout: every element measures 0×0, so a virtualized grid would render no rows.
 * Give elements the size of a laptop screen, which is what the virtualizer measures.
 */
const WIDTH = 1280;
const HEIGHT = 720;

Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => WIDTH },
  offsetHeight: { configurable: true, get: () => HEIGHT },
  clientWidth: { configurable: true, get: () => WIDTH },
  clientHeight: { configurable: true, get: () => HEIGHT },
});
HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, WIDTH, HEIGHT);
// jsdom has no scrolling either; the grid scrolls the active cell into view.
HTMLElement.prototype.scrollTo = function scrollTo() {};

afterEach(() => {
  cleanup();
});
