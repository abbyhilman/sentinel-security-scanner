import { useCallback, useEffect, useRef, useState } from 'react';
import type { ZodType } from '@sentinel/contracts';
import { apiGet } from './api';

type Output<Schema extends ZodType<unknown>> = Schema extends ZodType<infer Value> ? Value : never;

type QueryState<T> = {
  key: string | null;
  data: T | null;
  error: Error | null;
  loading: boolean;
};

export function useApiQuery<Schema extends ZodType<unknown>>(
  key: string | null,
  path: string,
  schema: Schema,
) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = key === null ? null : `${key}\u0000${path}\u0000${attempt}`;
  const [state, setState] = useState<QueryState<Output<Schema>>>({
    key: requestKey,
    data: null,
    error: null,
    loading: key !== null,
  });
  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  useEffect(() => {
    let current = true;
    if (!key) {
      setState({ key: null, data: null, error: null, loading: false });
      return () => {
        current = false;
      };
    }

    setState({ key: requestKey, data: null, error: null, loading: true });
    void apiGet(path, schemaRef.current).then(
      (data) => {
        if (current) setState({ key: requestKey, data, error: null, loading: false });
      },
      (error: unknown) => {
        if (current) {
          setState({
            key: requestKey,
            data: null,
            error: error instanceof Error ? error : new Error('Permintaan gagal.'),
            loading: false,
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, key, path, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const visibleState =
    state.key === requestKey
      ? state
      : { key: requestKey, data: null, error: null, loading: requestKey !== null };
  return { ...visibleState, retry };
}

export type ApiPage<T> = {
  data: T[];
  page: { limit: number; nextCursor: string | null };
};

type PagesState<T> = {
  key: string | null;
  data: T[];
  nextCursor: string | null;
  error: Error | null;
  loading: boolean;
  loadingMore: boolean;
};

export function useApiPages<T>(
  key: string | null,
  loadPage: (cursor: string | null) => Promise<ApiPage<T>>,
) {
  const [attempt, setAttempt] = useState(0);
  const requestKey = key === null ? null : `${key}\u0000${attempt}`;
  const [state, setState] = useState<PagesState<T>>({
    key: requestKey,
    data: [],
    nextCursor: null,
    error: null,
    loading: key !== null,
    loadingMore: false,
  });
  const loaderRef = useRef(loadPage);
  const generationRef = useRef(0);
  loaderRef.current = loadPage;

  useEffect(() => {
    let current = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (!key) {
      setState({
        key: null,
        data: [],
        nextCursor: null,
        error: null,
        loading: false,
        loadingMore: false,
      });
      return () => {
        current = false;
      };
    }

    setState({
      key: requestKey,
      data: [],
      nextCursor: null,
      error: null,
      loading: true,
      loadingMore: false,
    });
    void loaderRef.current(null).then(
      (page) => {
        if (current) {
          setState({
            key: requestKey,
            data: page.data,
            nextCursor: page.page.nextCursor,
            error: null,
            loading: false,
            loadingMore: false,
          });
        }
      },
      (error: unknown) => {
        if (current) {
          setState({
            key: requestKey,
            data: [],
            nextCursor: null,
            error: error instanceof Error ? error : new Error('Permintaan gagal.'),
            loading: false,
            loadingMore: false,
          });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [attempt, key, requestKey]);

  const loadMore = useCallback(async () => {
    if (state.key !== requestKey || !state.nextCursor || state.loadingMore) return;
    const generation = generationRef.current;
    const cursor = state.nextCursor;
    setState((current) => ({ ...current, loadingMore: true, error: null }));
    try {
      const page = await loaderRef.current(cursor);
      if (generation !== generationRef.current) return;
      setState((current) => ({
        ...current,
        data: [...current.data, ...page.data],
        nextCursor: page.page.nextCursor,
        loadingMore: false,
      }));
    } catch (error) {
      if (generation !== generationRef.current) return;
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error : new Error('Permintaan gagal.'),
        loadingMore: false,
      }));
    }
  }, [requestKey, state.key, state.loadingMore, state.nextCursor]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const visibleState =
    state.key === requestKey
      ? state
      : {
          key: requestKey,
          data: [],
          nextCursor: null,
          error: null,
          loading: requestKey !== null,
          loadingMore: false,
        };
  return { ...visibleState, loadMore, retry };
}
