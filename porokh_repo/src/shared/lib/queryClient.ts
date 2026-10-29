import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { StorageUtils, AnyStorageKey } from '../utils/storage'; 
import { STORAGE_KEYS } from '../constants/storageKeys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours caching for offline support
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// Adapter to map StorageUtils to the required Storage interface safely
const storageAdapter: Storage = {
  getItem: (key: string) => {
    const data = StorageUtils.get(key as AnyStorageKey);
    // React Query expects a string back from getItem
    return data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
  },
  setItem: (key: string, value: string) => {
    try {
      const parsedValue = JSON.parse(value);
      StorageUtils.set(key as AnyStorageKey, parsedValue);
    } catch (e) {
      StorageUtils.set(key as AnyStorageKey, value as any);
    }
  },
  removeItem: (key: string) => {
    StorageUtils.remove(key as AnyStorageKey);
  },
  clear: () => {
    if (typeof StorageUtils.clear === 'function') {
      StorageUtils.clear();
    }
  },
  key: () => null,
  length: 0,
};

export const localStoragePersister = createSyncStoragePersister({
  storage: storageAdapter,
  key: STORAGE_KEYS.REACT_QUERY_CACHE,
});
