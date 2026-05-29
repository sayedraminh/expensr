"use client";

import {
  useConvexAuth,
  useQuery,
  type OptionalRestArgsOrSkip,
} from "convex/react";
import type {
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

export function useAuthenticatedQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): FunctionReturnType<Query> | undefined {
  const { isAuthenticated } = useConvexAuth();
  const queryArgs = isAuthenticated
    ? args
    : (["skip"] as OptionalRestArgsOrSkip<Query>);

  return useQuery(query, ...queryArgs);
}
