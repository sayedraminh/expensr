const clerkIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkIssuerDomain) {
  throw new Error(
    "Missing CLERK_JWT_ISSUER_DOMAIN. Set it to your Clerk issuer URL."
  );
}

const authConfig = {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
