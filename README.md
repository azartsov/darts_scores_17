# DartMaster Pro (`darts_scores_17`)

Multiplayer darts scorer built with Next.js 16, React 19 and Firebase.

## Stack

- Next.js 16 (App Router, TypeScript)
- React 19
- Firebase Auth + Firestore
- Tailwind + Radix/shadcn UI
- i18n: English/Russian

## Quick start

```bash
. "$HOME/.nvm/nvm.sh"
nvm use 24
cd /Users/username/Work/DartsScore/darts_scores_17/my-app
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev` — start development server
- `npm run build` — increments app version then builds production bundle
- `npm run start` — run production server
- `npm run lint` — run ESLint
- `npm run test` — run unit tests (Vitest)

## Environment

Create `.env.local` with Firebase public variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Architecture overview

### Core flow

The app uses centralized `GameState` and four phases:

1. `setup`
2. `playing`
3. `legFinished`
4. `finished`

Main orchestrator: `app/page.tsx`.

### Core modules

- `lib/game-types.ts` — domain types + checkout maps
- `lib/game-engine.ts` — pure turn-processing engine (`applyTurn`)
- `lib/game-storage.ts` — `sessionStorage` persistence for in-progress game
- `lib/game-firestore.tsx` — save/load stats, Elo, backup/restore
- `lib/auth-context.tsx` — auth and guest mode
- `lib/i18n/*` — translations and language context

### UI structure

- `components/game-setup.tsx` — match setup
- `components/game-board.tsx` — active board container
- `components/scoring-input.tsx` — dart input + projection
- `components/victory-screen.tsx` — final results
- `components/leg-transition.tsx` — between legs
- `components/stats-modal.tsx` — ranking/history/Elo + backup/restore

## Testing

Unit tests are in:

- `lib/game-engine.test.ts`
- `lib/game-firestore.test.ts`

Run:

```bash
npm run test
```

## Development notes

- Build automatically updates `lib/version.ts` via `scripts/update-version.js`.
- For game-rule changes, prefer editing pure logic in `lib/game-engine.ts` and add/adjust tests first.
- Keep translation keys in sync for both `en` and `ru` in `lib/i18n/translations.ts`.
