/**
 * Fetch upcoming Steam games from IGDB and write to src/lib/assets/games.json.
 *
 * Scores are stored in Firestore (meta/scores), not in games.json.
 *
 * Usage:
 *   node scripts/populate-games.js              # auto-detect year (Dec → next year)
 *   node scripts/populate-games.js --year 2026  # explicit year
 *
 * Requires: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET env vars (or .env file).
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_JSON_PATH = join(__dirname, '..', 'src/lib/assets/games.json');

const HIDDEN_APP_ID = '999999';
const STEAM_PLATFORM_ID = 6;
const PAGE_SIZE = 500;
const BATCH_SIZE = 200;
const RATE_LIMIT_MS = 300;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseYear() {
	const idx = process.argv.indexOf('--year');
	if (idx !== -1 && process.argv[idx + 1]) {
		const y = parseInt(process.argv[idx + 1], 10);
		if (!Number.isNaN(y)) return y;
	}
	const now = new Date();
	return now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
}

function log(msg) {
	console.log(`  ${msg}`);
}

/* ------------------------------------------------------------------ */
/*  IGDB / Twitch                                                      */
/* ------------------------------------------------------------------ */

async function getTwitchToken(clientId, clientSecret) {
	const url = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
	const res = await fetch(url, { method: 'POST' });
	if (!res.ok) throw new Error(`Twitch token failed: ${await res.text()}`);
	return (await res.json()).access_token;
}

async function igdb(token, clientId, endpoint, body) {
	const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
		method: 'POST',
		headers: {
			'Client-ID': clientId,
			Authorization: `Bearer ${token}`,
			'Content-Type': 'text/plain',
			Accept: 'application/json'
		},
		body
	});
	if (!res.ok) throw new Error(`IGDB ${endpoint}: ${res.status} ${await res.text()}`);
	return res.json();
}

/* ------------------------------------------------------------------ */
/*  Batched IGDB helpers                                               */
/* ------------------------------------------------------------------ */

async function fetchAllGames(token, clientId, since, until) {
	const games = [];
	let offset = 0;
	while (true) {
		const body = `fields name,first_release_date,cover,genres,summary,involved_companies;
where platforms = (${STEAM_PLATFORM_ID})
& first_release_date >= ${since}
& first_release_date <= ${until}
& version_parent = null
& parent_game = null;
sort first_release_date asc;
limit ${PAGE_SIZE}; offset ${offset};`;
		const page = await igdb(token, clientId, 'games', body);
		await sleep(RATE_LIMIT_MS);
		games.push(...page);
		if (page.length < PAGE_SIZE) break;
		offset += PAGE_SIZE;
	}
	return games;
}

async function fetchSteamAppIds(token, clientId, gameIds) {
	const map = new Map();
	for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
		const batch = gameIds.slice(i, i + BATCH_SIZE);
		try {
			const rows = await igdb(
				token,
				clientId,
				'external_games',
				`fields game,uid; where game = (${batch.join(',')}) & external_game_source = 1; limit ${BATCH_SIZE};`
			);
			for (const r of rows) if (r.uid) map.set(r.game, String(r.uid));
		} catch (e) {
			console.warn(`  external_games batch error: ${e.message}`);
		}
		await sleep(RATE_LIMIT_MS);
	}
	return map;
}

async function fetchCovers(token, clientId, coverIds) {
	const map = new Map();
	for (let i = 0; i < coverIds.length; i += BATCH_SIZE) {
		const batch = coverIds.slice(i, i + BATCH_SIZE);
		try {
			const rows = await igdb(
				token,
				clientId,
				'covers',
				`fields id,image_id; where id = (${batch.join(',')}); limit ${BATCH_SIZE};`
			);
			for (const r of rows) {
				if (r.image_id)
					map.set(r.id, `https://images.igdb.com/igdb/image/upload/t_cover_big/${r.image_id}.webp`);
			}
		} catch (e) {
			console.warn(`  covers batch error: ${e.message}`);
		}
		await sleep(RATE_LIMIT_MS);
	}
	return map;
}

async function fetchGenres(token, clientId, genreIds) {
	const map = new Map();
	for (let i = 0; i < genreIds.length; i += BATCH_SIZE) {
		const batch = genreIds.slice(i, i + BATCH_SIZE);
		try {
			const rows = await igdb(
				token,
				clientId,
				'genres',
				`fields name; where id = (${batch.join(',')}); limit ${BATCH_SIZE};`
			);
			for (const r of rows) if (r.name) map.set(r.id, r.name);
		} catch (e) {
			console.warn(`  genres batch error: ${e.message}`);
		}
		await sleep(RATE_LIMIT_MS);
	}
	return map;
}

async function fetchCompanies(token, clientId, involvedCompanyIds) {
	const icToCompany = new Map();
	const companyIds = new Set();

	for (let i = 0; i < involvedCompanyIds.length; i += BATCH_SIZE) {
		const batch = involvedCompanyIds.slice(i, i + BATCH_SIZE);
		try {
			const rows = await igdb(
				token,
				clientId,
				'involved_companies',
				`fields company; where id = (${batch.join(',')}); limit ${BATCH_SIZE};`
			);
			for (const r of rows) {
				if (r.company != null) {
					icToCompany.set(r.id, r.company);
					companyIds.add(r.company);
				}
			}
		} catch (e) {
			console.warn(`  involved_companies batch error: ${e.message}`);
		}
		await sleep(RATE_LIMIT_MS);
	}

	const nameMap = new Map();
	const cids = [...companyIds];
	for (let i = 0; i < cids.length; i += BATCH_SIZE) {
		const batch = cids.slice(i, i + BATCH_SIZE);
		try {
			const rows = await igdb(
				token,
				clientId,
				'companies',
				`fields name; where id = (${batch.join(',')}); limit ${BATCH_SIZE};`
			);
			for (const r of rows) if (r.name) nameMap.set(r.id, r.name);
		} catch (e) {
			console.warn(`  companies batch error: ${e.message}`);
		}
		await sleep(RATE_LIMIT_MS);
	}

	return { icToCompany, nameMap };
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	const year = parseYear();
	const clientId = process.env.TWITCH_CLIENT_ID;
	const clientSecret = process.env.TWITCH_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error('Missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET');
		process.exit(1);
	}

	console.log(`\n=== populate-games for ${year} ===\n`);

	const token = await getTwitchToken(clientId, clientSecret);
	const since = Math.floor(new Date(year, 0, 1).getTime() / 1000);
	const until = Math.floor(new Date(year, 11, 31, 23, 59, 59).getTime() / 1000);
	log(`Twitch token OK  |  ${year}-01-01 → ${year}-12-31`);

	// 1. Games
	log('Fetching games...');
	const rawGames = await fetchAllGames(token, clientId, since, until);
	log(`${rawGames.length} games from IGDB`);

	// 2. Steam app IDs
	const gameIds = rawGames.map((g) => g.id).filter(Boolean);
	const steamIds = await fetchSteamAppIds(token, clientId, gameIds);
	log(`${steamIds.size} Steam app IDs resolved`);

	// 3. Covers
	const coverIds = [...new Set(rawGames.map((g) => g.cover).filter(Boolean))];
	const coverMap = await fetchCovers(token, clientId, coverIds);
	log(`${coverMap.size}/${coverIds.length} covers`);

	// 4. Genres
	const genreIds = [...new Set(rawGames.flatMap((g) => g.genres || []))];
	const genreMap = await fetchGenres(token, clientId, genreIds);
	log(`${genreMap.size} genres`);

	// 5. Companies
	const icIds = [...new Set(rawGames.flatMap((g) => g.involved_companies || []))];
	const { icToCompany, nameMap: companyNames } = await fetchCompanies(token, clientId, icIds);
	log(`${companyNames.size} companies`);

	// 6. Build output
	const games = [];
	for (const g of rawGames) {
		if (g.id == null) continue;
		const steamAppId = steamIds.get(g.id) ?? null;
		if (!steamAppId) continue;

		const id = String(g.id);
		const releaseDate = g.first_release_date
			? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
			: null;

		const companyList = [
			...new Set(
				(g.involved_companies || [])
					.map((icId) => companyNames.get(icToCompany.get(icId)))
					.filter(Boolean)
			)
		];

		games.push({
			id,
			name: g.name || 'Unknown',
			coverUrl: (g.cover && coverMap.get(g.cover)) || null,
			releaseDate,
			genres: (g.genres || []).map((gid) => genreMap.get(gid)).filter(Boolean),
			steamAppId,
			igdbId: g.id,
			isHidden: steamAppId === HIDDEN_APP_ID,
			description: (g.summary || '').trim() || null,
			companies: companyList.length ? companyList : null
		});
	}

	writeFileSync(GAMES_JSON_PATH, JSON.stringify({ games }, null, '\t'), 'utf8');

	console.log(`\n  Done: ${games.length} games written to src/lib/assets/games.json\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
