# Fantasy Steam League

A static fantasy league web app: draft upcoming Steam games and score points from owner growth and peak CCU. Built with SvelteKit (static adapter), Firebase (Auth + Firestore), deployed to GitHub Pages.

## Developing

```sh
npm install
npm run dev
```

Optional: copy `.env.example` to `.env` and set `PUBLIC_FIREBASE_*` if you use a different Firebase project.

## Building

```sh
npm run build
```

Output is in `build/`. The app uses `paths.base: '/tga-league'` for GitHub Pages; if you deploy elsewhere, change or remove `base` in `svelte.config.js`.

## Deploy (GitHub Pages)

1. In the repo: **Settings → Pages → Build and deployment**: Source = **GitHub Actions**.
2. Push to `main`; the **Deploy to GitHub Pages** workflow builds and deploys.
3. Site will be at `https://<owner>.github.io/tga-league/`.

## Scripts

- **`npm run populate-games`** — Fetches upcoming Steam games from the IGDB API and writes them to Firestore `games/{steamAppId}`. Requires `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `FIREBASE_SERVICE_ACCOUNT` (or a `service-account.json` in the project root). Run manually or on a schedule to refresh the catalog. Games with Steam app ID `999999` are stored with `isHidden: true` and excluded from drafting.

- **`npm run update-scores`** — Fetches SteamSpy data for drafted games, writes metrics and daily history to Firestore, recalculates team scores. Requires `FIREBASE_SERVICE_ACCOUNT` (JSON string of the service account key) in the environment. A GitHub Action runs this daily at 6:00 UTC; add the secret in the repo **Settings → Secrets and variables → Actions**.

## Firestore rules

Deploy rules from the project root:

```sh
firebase deploy --only firestore:rules
```

Rule file: `firestore.rules`.

## License

Private / unlicensed.
