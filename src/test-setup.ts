import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
  configurable: true,
  value: () => false,
});
Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
  configurable: true,
  value: () => undefined,
});
Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
  configurable: true,
  value: () => undefined,
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
