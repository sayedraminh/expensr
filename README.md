# Extracker

Expense and revenue tracking app built with Next.js, Convex, and Clerk.
Expenses can be entered manually, imported from CSV, or synced from linked bank
accounts through Plaid.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Copy the environment template and fill in your local values:

```bash
cp .env.example .env.local
```

Run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Auth and Convex

Clerk is the source of truth for accounts. Convex stores a lightweight `users`
row the first time a signed-in user opens the app, and app data is scoped with
Convex's stable Clerk `tokenIdentifier`.

## Plaid

Set Plaid credentials in the Convex Dashboard environment variables:

```bash
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
# Optional: pass a Plaid Link customization with Account Select enabled.
PLAID_LINK_CUSTOMIZATION_NAME=
```

The app creates Plaid Link tokens from Convex, exchanges public tokens server
side, stores transaction sync cursors, and refreshes connected accounts every
six hours with Convex crons.

## Stripe

Users can connect Stripe from the Revenue page by pasting a restricted API key
that has Balance, Balance Transaction Sources, Charges and refunds, and Payment
Intents read access. The key is encrypted with
`STRIPE_KEY_ENCRYPTION_SECRET` and stored server-side in Convex. Stripe charge
and payment balance transactions are imported as revenue rows, and connected
Stripe keys refresh every six hours with Convex crons.

Set `STRIPE_KEY_ENCRYPTION_SECRET` in Convex to a random value at least 32
characters long before connecting Stripe. By default, the first sync backfills
all available Stripe charge balance transactions. Set `STRIPE_INITIAL_SYNC_DAYS`
in Convex if you want to limit the first sync window.
