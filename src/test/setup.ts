import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Motion measures/restores scroll during height transitions. jsdom has no layout;
// actual scroll and focus behavior is exercised in Playwright.
window.scrollTo = () => undefined;
