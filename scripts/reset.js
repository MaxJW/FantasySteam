/**
 * Full database reset and re-seed.
 *
 * Deletes ALL Firestore data (games, leagues, users), then calls
 * populate-games to re-fetch from IGDB and writes a fresh games.json
 * with all scores zeroed.
 *
 * Usage:
 *   node scripts/reset.js --confirm              # required safety flag
 *   node scripts/reset.js --confirm --year 2026  # passes --year to populate-games
 *
 * THIS IS DESTRUCTIVE. Only intended for development / fresh-start scenarios.
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_JSON_PATH = join(__dirname, '..', 'src/lib/assets/games.json');

/* ------------------------------------------------------------------ */
/*  Safety gate                                                        */
/* ------------------------------------------------------------------ */

if (!process.argv.includes('--confirm')) {
	console.error(
		'This will DELETE ALL Firestore data and re-seed from scratch.\n' + 'Pass --confirm to proceed.'
	);
	process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  Firebase                                                           */
/* ------------------------------------------------------------------ */

function initFirebase() {
	const envCred = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (envCred) {
		admin.initializeApp({ credential: admin.credential.cert(JSON.parse(envCred)) });
	} else {
		const keyPath = join(__dirname, '..', 'service-account.json');
		if (!existsSync(keyPath)) {
			console.error('No service-account.json found and FIREBASE_SERVICE_ACCOUNT not set.');
			process.exit(1);
		}
		admin.initializeApp({
			credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8')))
		});
	}
	return admin.firestore();
}

/* ------------------------------------------------------------------ */
/*  Recursive collection deletion                                      */
/* ------------------------------------------------------------------ */

const BATCH_SIZE = 400;

async function deleteCollection(db, collectionPath) {
	const collRef = db.collection(collectionPath);
	let totalDeleted = 0;

	while (true) {
		const snap = await collRef.limit(BATCH_SIZE).get();
		if (snap.empty) break;

		const batch = db.batch();
		for (const doc of snap.docs) {
			batch.delete(doc.ref);
		}
		await batch.commit();
		totalDeleted += snap.size;
	}

	return totalDeleted;
}

async function deleteCollectionWithSubs(db, collectionPath, subcollections) {
	const snap = await db.collection(collectionPath).get();
	let totalDeleted = 0;

	for (const doc of snap.docs) {
		for (const sub of subcollections) {
			const subPath = `${collectionPath}/${doc.id}/${sub}`;
			totalDeleted += await deleteCollection(db, subPath);
		}
	}

	totalDeleted += await deleteCollection(db, collectionPath);
	return totalDeleted;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	console.log('\n=== FULL RESET ===\n');
	console.log('WARNING: Deleting all Firestore data...\n');

	const db = initFirebase();

	// 1. Delete games (with history subcollection)
	console.log('Deleting games...');
	const gamesDeleted = await deleteCollectionWithSubs(db, 'games', ['history']);
	console.log(`  Deleted ${gamesDeleted} documents from games`);

	// 2. Delete leagues (with teams, drafts, scoring subcollections)
	console.log('Deleting leagues...');
	const leaguesDeleted = await deleteCollectionWithSubs(db, 'leagues', [
		'teams',
		'drafts',
		'scoring'
	]);
	console.log(`  Deleted ${leaguesDeleted} documents from leagues`);

	// 3. Delete users
	console.log('Deleting users...');
	const usersDeleted = await deleteCollection(db, 'users');
	console.log(`  Deleted ${usersDeleted} documents from users`);

	console.log(
		`\nFirestore cleared: ${gamesDeleted + leaguesDeleted + usersDeleted} total documents removed.`
	);

	// 4. Re-populate games from IGDB
	console.log('\n--- Re-populating games from IGDB ---\n');
	const yearArg = process.argv.includes('--year')
		? `--year ${process.argv[process.argv.indexOf('--year') + 1]}`
		: '';
	const populateCmd = `node ${join(__dirname, 'populate-games.js')} ${yearArg}`.trim();

	try {
		execSync(populateCmd, { stdio: 'inherit', env: process.env });
	} catch (err) {
		console.error('populate-games failed:', err.message);
		console.error('You may need to run it separately with valid TWITCH credentials.');
	}

	// 5. Zero out all scores in the freshly written games.json
	if (existsSync(GAMES_JSON_PATH)) {
		const data = JSON.parse(readFileSync(GAMES_JSON_PATH, 'utf8'));
		if (Array.isArray(data.games)) {
			data.games.forEach((g) => (g.score = 0));
			writeFileSync(GAMES_JSON_PATH, JSON.stringify(data, null, '\t'), 'utf8');
			console.log(`\nZeroed scores for ${data.games.length} games in games.json`);
		}
	}

	console.log('\n=== Reset complete ===\n');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
