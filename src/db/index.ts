import { ShelfLifeDB } from './schema';
import {
  createRepository,
  LOCAL_OWNER_ID,
  type Repository,
  type RepositoryOptions,
} from './repository';

export { createRepository, LOCAL_OWNER_ID, RepositoryError } from './repository';
export type {
  FinishReason,
  ItemPatch,
  NewItem,
  OverrideInput,
  Repository,
  RepositoryOptions,
} from './repository';
export type { OutboxEntry, SyncedTable } from './schema';

let repository: Repository | undefined;

/** The app-wide repository on the default database. Opens lazily on first use. */
export function getRepository(): Repository {
  repository ??= createRepository(new ShelfLifeDB(), { ownerId: LOCAL_OWNER_ID });
  return repository;
}

/** A repository on its own named database, e.g. a throwaway one per test. */
export function createLocalRepository(
  dbName: string,
  options: Partial<RepositoryOptions> = {},
): Repository {
  return createRepository(new ShelfLifeDB(dbName), { ownerId: LOCAL_OWNER_ID, ...options });
}
