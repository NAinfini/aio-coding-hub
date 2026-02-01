import { vi } from "vitest";

export const init = vi.fn(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
}));
