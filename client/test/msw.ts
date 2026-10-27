import { setupServer } from 'msw/node';

// API mocks for component tests. A test adds handlers with server.use(...); any request without a
// handler fails the test (see setup.ts).
export const server = setupServer();
