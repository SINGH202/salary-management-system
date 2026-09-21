/**
 * Express app factory — domain routes land in later commits.
 * Tests import this module; they never import server.ts.
 */
export function createApp(): { ready: true } {
  return { ready: true };
}
