/**
 * Populate Firestore with upcoming Steam games from IGDB.
 * Requires: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, FIREBASE_SERVICE_ACCOUNT (or service-account.json).
 * Loads .env from project root if present. Run: node scripts/populate-games.js
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HIDDEN_APP_ID = '999999';
const STEAM_PLATFORM_ID = 6; // PC in IGDB; external_game_source 1 = Steam
const IGDB_RATE_LIMIT_MS = 300; // ~3–4 req/s max
const GAMES_PAGE_SIZE = 500;
const EXTERNAL_GAMES_BATCH = 200; // max game IDs per external_games request

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

async function getTwitchToken(clientId, clientSecret) {
	const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
	const res = await fetch(url, { method: 'POST' });
	if (!res.ok) throw new Error(`Twitch token failed: ${await res.text()}`);
	const data = await res.json();
	return data.access_token;
}

async function igdbPost(accessToken, clientId, endpoint, body) {
	const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
		method: 'POST',
		headers: {
			'Client-ID': clientId,
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'text/plain',
			Accept: 'application/json'
		},
		body
	});
	if (!res.ok) throw new Error(`IGDB ${endpoint} failed: ${res.status} ${await res.text()}`);
	return res.json();
}

function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

/** Delete all documents in a collection (batches of 500). */
async function deleteCollection(db, collectionName) {
	const col = db.collection(collectionName);
	let deleted = 0;
	while (true) {
		const snap = await col.limit(500).get();
		if (snap.empty) break;
		const batch = db.batch();
		snap.docs.forEach((d) => batch.delete(d.ref));
		await batch.commit();
		deleted += snap.size;
		console.log(`Deleted ${deleted} docs from ${collectionName}...`);
	}
	console.log(`Cleared ${collectionName} (${deleted} total).`);
}

// First release date: from start of current year (include upcoming and recent)
function releaseDateFilter() {
	const start = new Date(new Date().getFullYear(), 0, 1);
	return Math.floor(start.getTime() / 1000);
}

async function main() {
	const clientId = process.env.TWITCH_CLIENT_ID;
	const clientSecret = process.env.TWITCH_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET');
		process.exit(1);
	}

	const db = initFirebase();

	console.log('Clearing games and gameLists collections...');
	await deleteCollection(db, 'games');
	await deleteCollection(db, 'gameLists');

	const token = await getTwitchToken(clientId, clientSecret);
	const since = releaseDateFilter();

	// 1) Fetch all games: PC platform, release date this year or later (paginate with offset)
	const games = [];
	let offset = 0;
	while (true) {
		const body = `fields name,first_release_date,cover,genres,summary,involved_companies; where platforms = (${STEAM_PLATFORM_ID}) & first_release_date >= ${since}; sort first_release_date asc; limit ${GAMES_PAGE_SIZE}; offset ${offset};`;
		const page = await igdbPost(token, clientId, 'games', body);
		await sleep(IGDB_RATE_LIMIT_MS);
		games.push(...page);
		if (page.length < GAMES_PAGE_SIZE) break;
		offset += GAMES_PAGE_SIZE;
		console.log(`Fetched ${games.length} games so far...`);
	}

	if (games.length === 0) {
		console.log('No games returned from IGDB.');
		return;
	}
	console.log(`Total games: ${games.length}`);

	const gameIds = games.map((g) => g.id).filter(Boolean);

	// 2) Get Steam app IDs from external_games (external_game_source 1 = Steam; category is deprecated)
	const gameIdToSteamAppId = new Map();
	for (let i = 0; i < gameIds.length; i += EXTERNAL_GAMES_BATCH) {
		const batch = gameIds.slice(i, i + EXTERNAL_GAMES_BATCH);
		const extBody = `fields game,uid,external_game_source; where game = (${batch.join(',')}) & external_game_source = 1;`;
		try {
			const externalGames = await igdbPost(token, clientId, 'external_games', extBody);
			for (const eg of externalGames) {
				if (eg.uid) gameIdToSteamAppId.set(eg.game, String(eg.uid));
			}
		} catch (e) {
			console.warn('external_games batch failed:', e.message);
		}
		await sleep(IGDB_RATE_LIMIT_MS);
	}

	// 3) Fetch cover image_ids for games that have cover (batch to avoid huge queries)
	const coverIds = [...new Set(games.map((g) => g.cover).filter(Boolean))];
	let coverMap = new Map();
	for (let i = 0; i < coverIds.length; i += EXTERNAL_GAMES_BATCH) {
		const batch = coverIds.slice(i, i + EXTERNAL_GAMES_BATCH);
		const coverBody = `fields id,image_id; where id = (${batch.join(',')});`;
		try {
			const covers = await igdbPost(token, clientId, 'covers', coverBody);
			for (const c of covers) {
				if (c.image_id) coverMap.set(c.id, c.image_id);
			}
		} catch (e) {
			console.warn('covers batch failed:', e.message);
		}
		await sleep(IGDB_RATE_LIMIT_MS);
	}

	// 4) Fetch genre names
	let genreMap = new Map();
	const genreIds = [...new Set(games.flatMap((g) => g.genres || []).filter(Boolean))];
	if (genreIds.length > 0) {
		const genreBody = `fields name; where id = (${genreIds.join(',')});`;
		try {
			const genres = await igdbPost(token, clientId, 'genres', genreBody);
			for (const g of genres) genreMap.set(g.id, g.name || '');
		} catch (e) {
			console.warn('genres query failed:', e.message);
		}
	}

	// 5) Resolve involved_companies -> company names
	const involvedCompanyIds = [...new Set(games.flatMap((g) => g.involved_companies || []).filter(Boolean))];
	const icIdToCompanyId = new Map();
	const companyIds = new Set();
	if (involvedCompanyIds.length > 0) {
		for (let i = 0; i < involvedCompanyIds.length; i += EXTERNAL_GAMES_BATCH) {
			const batch = involvedCompanyIds.slice(i, i + EXTERNAL_GAMES_BATCH);
			try {
				const icBody = `fields company; where id = (${batch.join(',')});`;
				const ics = await igdbPost(token, clientId, 'involved_companies', icBody);
				for (const ic of ics) {
					if (ic.company != null) {
						icIdToCompanyId.set(ic.id, ic.company);
						companyIds.add(ic.company);
					}
				}
			} catch (e) {
				console.warn('involved_companies batch failed:', e.message);
			}
			await sleep(IGDB_RATE_LIMIT_MS);
		}
	}
	let companyIdToName = new Map();
	const cids = [...companyIds];
	for (let i = 0; i < cids.length; i += EXTERNAL_GAMES_BATCH) {
		const batch = cids.slice(i, i + EXTERNAL_GAMES_BATCH);
		try {
			const companyBody = `fields name; where id = (${batch.join(',')});`;
			const companies = await igdbPost(token, clientId, 'companies', companyBody);
			for (const c of companies) companyIdToName.set(c.id, c.name || '');
		} catch (e) {
			console.warn('companies batch failed:', e.message);
		}
		await sleep(IGDB_RATE_LIMIT_MS);
	}

	// 6) Write all games keyed by IGDB id (steamAppId stored in doc; no games missed, easy to update later)
	let written = 0;
	for (const g of games) {
		if (g.id == null) continue;
		const steamAppId = gameIdToSteamAppId.get(g.id) ?? null;
		const isHidden = steamAppId === HIDDEN_APP_ID;
		const releaseDate = g.first_release_date
			? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
			: null;
		const coverImageId = g.cover && coverMap.get(g.cover);
		const coverUrl = coverImageId
			? `https://images.igdb.com/igdb/image/upload/t_cover_big/${coverImageId}.jpg`
			: null;
		const genreNames = (g.genres || []).map((id) => genreMap.get(id)).filter(Boolean);

		const companyNames = [...new Set(
			(g.involved_companies || [])
				.map((icId) => companyIdToName.get(icIdToCompanyId.get(icId)))
				.filter(Boolean)
		)];

		const doc = {
			name: g.name || 'Unknown',
			coverUrl,
			releaseDate,
			genres: genreNames,
			steamAppId,
			igdbId: g.id,
			isHidden,
			description: (g.summary || '').trim() || null,
			companies: companyNames.length ? companyNames : null
		};

		await db.collection('games').doc(String(g.id)).set(doc, { merge: true });
		written++;
	}

	// 7) Write yearly list doc (id = IGDB id; exclude hidden from picker list)
	const year = new Date().getFullYear();
	const listEntries = games
		.filter((g) => g.id != null)
		.filter((g) => gameIdToSteamAppId.get(g.id) !== HIDDEN_APP_ID)
		.map((g) => {
			const releaseDate = g.first_release_date
				? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
				: null;
			return { id: String(g.id), name: g.name || 'Unknown', releaseDate };
		})
		.sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''));
	await db.collection('gameLists').doc(String(year)).set({ games: listEntries, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
	console.log(`Written game list for ${year} (${listEntries.length} games).`);

	console.log(`Done. Written ${written} games (keyed by IGDB id, steamAppId in doc).`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
