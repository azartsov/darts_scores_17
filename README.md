# Darts Scorer Web (`darts-scorer-web`)

`Darts Scorer Web` is a multiplayer darts scorer built with Next.js 16, React 19, and Firebase.

The web app covers the full match loop for local and authenticated players, with persistent stats, Elo, history, and Firestore-backed cloud state.

## Current Feature Set

- multiplayer darts scorer for browser-based play
- match setup, scoring, leg-finished, and match-finished phases
- simple-out and double-out support
- ranking, history, Elo, and backup flows
- Firebase Auth with guest mode
- Firestore persistence for finished matches and user statistics
- English and Russian UI support
- PWA shell with build-version metadata

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Firebase Auth
- Firestore
- Tailwind CSS
- Radix UI / shadcn-style primitives
- Vitest

## Main Scripts

- `npm install` — install dependencies
- `npm run dev` — start the development server
- `npm run build` — sync build version and build the production bundle
- `npm run start` — start the production server
- `npm run lint` — run ESLint
- `npm run test` — run unit tests with Vitest

## Local Run

1. `. "$HOME/.nvm/nvm.sh"`
2. `nvm use 24`
3. `cd /Users/valeryazartsov/darts-scorer-web`
4. `npm install`
5. `npm run dev`
6. Open `http://localhost:3000`

## Environment

Create `.env.local` with Firebase public variables:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Runtime Structure

- `app/page.tsx` — top-level game orchestrator
- `lib/game-types.ts` — domain types and checkout maps
- `lib/game-engine.ts` — pure turn-processing engine
- `lib/game-storage.ts` — `sessionStorage` persistence for in-progress matches
- `lib/game-firestore.tsx` — save/load stats, Elo, and backup flows
- `lib/auth-context.tsx` — auth state and guest mode
- `lib/i18n/*` — translations and language context
- `components/game-setup.tsx` — match setup
- `components/game-board.tsx` — active game board container
- `components/scoring-input.tsx` — dart input and projection flow
- `components/victory-screen.tsx` — final match results
- `components/leg-transition.tsx` — between-leg transitions
- `components/stats-modal.tsx` — ranking, history, Elo, and backup UI

## Mobile Companion

The standalone Expo mobile app now lives in its own repository:

- `darts-scores-native`

The nested `expo-mobile` folder is not part of this web repository anymore.

## Testing

Current test coverage includes:

- `lib/game-engine.test.ts`
- `lib/game-firestore.test.ts`

Run all tests with `npm run test`.

## Project Notes

- Build version is updated through `scripts/update-version.js` and stored in `lib/version.ts`.
- Keep translation keys aligned across both `en` and `ru` locales.
- For game-rule changes, prefer editing pure logic in `lib/game-engine.ts` and updating tests first.
- EAS configuration is present for the current project state, but the dedicated mobile app is maintained in a separate repository.

## Changelog

Project-level updates are tracked in [CHANGELOG.md](CHANGELOG.md).
