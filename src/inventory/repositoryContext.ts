import { createContext, useContext } from 'react';
import { getRepository, type Repository } from '../db';

/** The repository the screens read and write through. Tests provide their own. */
export const RepositoryContext = createContext<Repository | null>(null);

export function useRepository(): Repository {
  return useContext(RepositoryContext) ?? getRepository();
}
