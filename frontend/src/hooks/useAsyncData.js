import { useCallback, useState } from 'react';

export function useAsyncData(initialData = null) {
  const [state, setState] = useState({
    data: initialData,
    loading: false,
    error: null,
  });

  const run = useCallback(async (fetcher) => {
    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const result = await fetcher();
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (error) {
      setState({ data: initialData, loading: false, error: error.message || 'Request failed' });
      throw error;
    }
  }, [initialData]);

  return {
    ...state,
    run,
  };
}
