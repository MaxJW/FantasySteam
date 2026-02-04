/**
 * Remove from gameLists and games any entries whose release date year is after
 * the list's year (e.g. games in the 2026 list that release in 2030).
 * Requires: FIREBASE_SERVICE_ACCOUNT (or service-account.json).
 * Loads .env from project root if present.
 * Usage: node scripts/delete-future-year-games.js [year]
 *   year: optional; default is current year. Use "all" to process every gameList doc.
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function initFirebase() {
	const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (cred) {
		admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
	} else {
		const keyPath = join(__dirname, '..', 'service-account.json');
		admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
	}
	return admin.firestore();
}

function releaseYearFromDate(releaseDate) {
	if (!releaseDate || typeof releaseDate !== 'string') return null;
	const y = parseInt(releaseDate.slice(0, 4), 10);
	return Number.isNaN(y) ? null : y;
}

async function processYear(db, year) {
	const listRef = db.collection('gameLists').doc(String(year));
	const snap = await listRef.get();
	if (!snap.exists) {
		console.log(`No gameList for year ${year}, skipping.`);
		return { kept: 0, removed: 0, deleted: 0 };
	}

	const data = snap.data();
	const games = Array.isArray(data?.games) ? data.games : [];
	if (games.length === 0) {
		console.log(`GameList ${year} has no games, skipping.`);
		return { kept: 0, removed: 0, deleted: 0 };
	}

	const toKeep = [];
	const toRemove = [];
	for (const entry of games) {
		const rYear = releaseYearFromDate(entry?.releaseDate);
		if (rYear == null || rYear <= year) {
			toKeep.push(entry);
		} else {
			toRemove.push(entry);
		}
	}

	if (toRemove.length === 0) {
		console.log(`GameList ${year}: all ${games.length} entries within year, nothing to remove.`);
		return { kept: games.length, removed: 0, deleted: 0 };
	}

	const idsToDelete = toRemove.map((e) => e?.id).filter(Boolean);
	let deleted = 0;
	for (const id of idsToDelete) {
		await db.collection('games').doc(String(id)).delete();
		deleted++;
	}

	await listRef.set({
		games: toKeep,
		updatedAt: admin.firestore.FieldValue.serverTimestamp()
	});

	console.log(`GameList ${year}: kept ${toKeep.length}, removed ${toRemove.length} (release year > ${year}). Deleted ${deleted} docs from games.`);
	return { kept: toKeep.length, removed: toRemove.length, deleted };
}

async function main() {
	const yearArg = process.argv[2];
	const db = initFirebase();

	if (yearArg === 'all') {
		const listsSnap = await db.collection('gameLists').get();
		const years = listsSnap.docs
			.map((d) => parseInt(d.id, 10))
			.filter((y) => !Number.isNaN(y));
		if (years.length === 0) {
			console.log('No gameList documents found.');
			return;
		}
		console.log(`Processing years: ${years.join(', ')}`);
		let totalRemoved = 0;
		let totalDeleted = 0;
		for (const y of years.sort((a, b) => a - b)) {
			const result = await processYear(db, y);
			totalRemoved += result.removed;
			totalDeleted += result.deleted;
		}
		console.log(`Done. Total removed from lists: ${totalRemoved}, total game docs deleted: ${totalDeleted}.`);
		return;
	}

	const year = yearArg != null ? parseInt(yearArg, 10) : new Date().getFullYear();
	if (Number.isNaN(year)) {
		console.error('Invalid year. Use a number or "all".');
		process.exit(1);
	}
	await processYear(db, year);
	console.log('Done.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
