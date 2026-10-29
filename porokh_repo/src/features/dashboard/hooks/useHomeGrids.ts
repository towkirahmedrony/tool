import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/lib/apiClient';
import { QUERY_KEYS } from '@/shared/constants/storageKeys';

export interface GridItem {
  id: string;
  title: string;
  title_bn?: string | null;
  title_en?: string | null;
  icon_name: string;
  link: string | null;
  bg_color: string | null;
  color: string | null;
  serial_order?: number | null;
}

interface HomeGridsResponse {
  data?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toNullableString = (value: unknown): string | null => {
  return typeof value === 'string' ? value : null;
};

const sanitizeGridItem = (input: unknown): GridItem | null => {
  if (!isRecord(input)) return null;

  const id = toNullableString(input.id);
  const title = toNullableString(input.title);
  const iconName = toNullableString(input.icon_name);

  if (!id || !title || !iconName) {
    return null;
  }

  return {
    id,
    title,
    title_bn: toNullableString(input.title_bn),
    title_en: toNullableString(input.title_en),
    icon_name: iconName,
    link: toNullableString(input.link),
    bg_color: toNullableString(input.bg_color),
    color: toNullableString(input.color),
    serial_order: typeof input.serial_order === 'number' ? input.serial_order : null,
  };
};

const sanitizeGridItems = (input: unknown): GridItem[] => {
  if (!Array.isArray(input)) return [];

  return input
    .map(sanitizeGridItem)
    .filter((item): item is GridItem => item !== null)
    .sort((a, b) => (a.serial_order ?? Number.MAX_SAFE_INTEGER) - (b.serial_order ?? Number.MAX_SAFE_INTEGER));
};

export const useHomeGrids = () => {
  const query = useQuery({
    queryKey: QUERY_KEYS.HOME_GRIDS,
    queryFn: async (): Promise<GridItem[]> => {
      // 👈 এখানে /system থেকে /app-builder করা হয়েছে
      const { data } = await apiClient.get<HomeGridsResponse>('/app-builder/home-grids');
      return sanitizeGridItems(data?.data);
    },
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  const features = query.data ?? [];
  const loading = query.isLoading && features.length === 0;

  return {
    features,
    loading,
    isRefetching: query.isFetching && !query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
