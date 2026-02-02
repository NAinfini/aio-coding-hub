// Usage: Shared MSW server for Vitest (Node.js) tests.

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
