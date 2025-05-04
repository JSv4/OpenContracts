// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock static assets for tests
vi.mock(/\.(css|less|scss|sass|png|jpg|jpeg|gif|svg|webp)$/i, () => {
  // Return an object with a default export, simulating the asset import
  // You can customize the mock value if needed (e.g., return an empty object or specific string)
  return { default: "mock-asset" };
});
