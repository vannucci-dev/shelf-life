import { createLocalRepository } from '../db';

/** A repository on a fresh in-memory database (fake-indexeddb is loaded in setup.ts). */
export function testRepository() {
  return createLocalRepository(`test-${crypto.randomUUID()}`);
}
