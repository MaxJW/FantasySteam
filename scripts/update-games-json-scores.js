/**
 * Update games.json with current score from Firestore.
 * Run this to backfill or refresh score on each game in lib/assets/games.json
 * so the browse games page can show score without hitting Firestore.
 *
 * Usage: node scripts/update-games-json-scores.js
 * Requires: FIREBASE_SERVICE_ACCOUNT env or service-account.json in project root.
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- Firebase Setup ---------- */
const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
if (cred) {
	admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
} else {
	const keyPath = join(__dirname, '..', 'service-account.json');
	admin.initializeApp({
		credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8')))
	});
}

const db = admin.firestore();

async function main() {
	const gamesPath = join(__dirname, '..', 'src/lib/assets/games.json');
	const full = JSON.parse(readFileSync(gamesPath, 'utf8'));

	if (!Array.isArray(full.games)) {
		console.error('games.json has no "games" array.');
		process.exit(1);
	}

	console.log(`Updating scores for ${full.games.length} games from Firestore...`);

	const snap = await db.collection('games').get();
	const scoreById = {};
	snap.docs.forEach((d) => {
		const score = d.data().metrics?.score;
		if (score != null) scoreById[d.ref.id] = score;
	});

	let updated = 0;
	full.games.forEach((g) => {
		const score = scoreById[g.id];
		const prev = g.score;
		g.score = score ?? null;
		if (score != null) updated++;
	});

	writeFileSync(gamesPath, JSON.stringify(full, null, '\t'), 'utf8');
	console.log(`Done. Wrote scores for ${updated} games to ${gamesPath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
