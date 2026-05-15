import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // Each test starts with a fresh localStorage so token state never bleeds.
  if (typeof localStorage !== "undefined") localStorage.clear();
});
