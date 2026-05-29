import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

export async function requireUserIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("You must be signed in to access this data.");
  }

  return identity;
}

export async function requireUserId(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await requireUserIdentity(ctx);
  return identity.tokenIdentifier;
}

export function assertOwner<T extends { userId?: string }>(
  doc: T | null,
  userId: string,
  message: string
): asserts doc is T {
  if (!doc || doc.userId !== userId) {
    throw new Error(message);
  }
}
