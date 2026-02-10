import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Spinner } from "./Spinner";
import { ErrorState } from "./ErrorState";

export type QueryStateViewProps<T> = {
  query: UseQueryResult<T>;
  loading?: ReactNode;
  error?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
};

function defaultIsEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function QueryStateView<T>({
  query,
  loading,
  error,
  empty,
  isEmpty,
  children,
}: QueryStateViewProps<T>) {
  if (query.isLoading) {
    return (
      <>
        {loading ?? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        )}
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        {error ?? <ErrorState message={String(query.error)} onRetry={() => void query.refetch()} />}
      </>
    );
  }

  const data = query.data as T;
  const checkEmpty = isEmpty ?? defaultIsEmpty;

  if (checkEmpty(data)) {
    return <>{empty ?? null}</>;
  }

  return <>{children(data)}</>;
}
