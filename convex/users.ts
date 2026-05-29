import { mutation, query } from "./_generated/server";
import { requireUserIdentity } from "./authHelpers";

type UserProfile = {
  tokenIdentifier: string;
  subject?: string;
  issuer?: string;
  name?: string;
  email?: string;
  pictureUrl?: string;
  lastSeenAt: number;
};

function addIfPresent(
  target: UserProfile,
  key: keyof Omit<UserProfile, "tokenIdentifier" | "lastSeenAt">,
  value: string | undefined
) {
  if (value && value.trim() !== "") {
    target[key] = value;
  }
}

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserIdentity(ctx);

    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

export const upsertCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireUserIdentity(ctx);
    const now = Date.now();
    const profile: UserProfile = {
      tokenIdentifier: identity.tokenIdentifier,
      lastSeenAt: now,
    };

    addIfPresent(profile, "subject", identity.subject);
    addIfPresent(profile, "issuer", identity.issuer);
    addIfPresent(profile, "name", identity.name);
    addIfPresent(profile, "email", identity.email);
    addIfPresent(profile, "pictureUrl", identity.pictureUrl);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, profile);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      ...profile,
      createdAt: now,
    });
  },
});
