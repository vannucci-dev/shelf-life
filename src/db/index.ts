import { ShelfLifeDB } from './schema';
import { createRepository, LOCAL_OWNER_ID, type Repository } from './repository';

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
