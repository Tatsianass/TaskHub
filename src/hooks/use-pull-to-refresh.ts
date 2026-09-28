import { useCallback, useState } from 'react';

/** `refreshing` / `onRefresh` props for a `RefreshControl` that awaits `refresh`. */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    console.log("[refresh-debug] onRefresh");
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return { refreshing, onRefresh };
}
