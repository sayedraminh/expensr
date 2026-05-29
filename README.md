# Extracker

Expense and revenue tracking app built with Next.js, Convex, and Clerk.

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
