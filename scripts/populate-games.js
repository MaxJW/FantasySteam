/**
 * Fetch upcoming Steam games from IGDB and output to JSON file.
 * Requires: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET.
 * Loads .env from project root if present. Run: node scripts/populate-games.js
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HIDDEN_APP_ID = '999999';
const STEAM_PLATFORM_ID = 6; // PC in IGDB

const LINE = '────────────────────────────────────────';
const log = {
	header: (s) => console.log(`\n${LINE}\n  ${s}\n${LINE}`),
	step: (s) => console.log(`\n▸ ${s}`),
	ok: (s) => console.log(`  ${s}`),
	warn: (s) => console.warn(`  ⚠ ${s}`)
};
const IGDB_RATE_LIMIT_MS = 300; // ~3–4 req/s max
const GAMES_PAGE_SIZE = 500;
const EXTERNAL_GAMES_BATCH = 200; // max game IDs per external_games request
const OUTPUT_FILE = join(__dirname, '..', 'games-output.json');

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

// First release date: within current year only (start and end)
function releaseDateRange() {
	const year = new Date().getFullYear();
	const start = new Date(year, 0, 1);
	const end = new Date(year, 11, 31, 23, 59, 59, 999);
	return { since: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) };
}

async function main() {
	log.header('populate-games');

	const clientId = process.env.TWITCH_CLIENT_ID;
	const clientSecret = process.env.TWITCH_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		console.error('Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET');
		process.exit(1);
	}

	const token = await getTwitchToken(clientId, clientSecret);
	const { since, until } = releaseDateRange();
	log.ok(
		`Twitch token ✓  |  ${new Date(since * 1000).toISOString().slice(0, 10)} → ${new Date(until * 1000).toISOString().slice(0, 10)}`
	);

	// 1) Fetch all games
	log.step('Games');
	const games = [];
	let offset = 0;
	while (true) {
		const body = `fields name,first_release_date,cover,genres,summary,involved_companies; where platforms = (${STEAM_PLATFORM_ID}) & first_release_date >= ${since} & first_release_date <= ${until} & version_parent = null & parent_game = null; sort first_release_date asc; limit ${GAMES_PAGE_SIZE}; offset ${offset};`;
		const page = await igdbPost(token, clientId, 'games', body);
		await sleep(IGDB_RATE_LIMIT_MS);
		games.push(...page);
		if (page.length < GAMES_PAGE_SIZE) break;
		offset += GAMES_PAGE_SIZE;
		log.ok(`  ${games.length} games…`);
	}

	if (games.length === 0) {
		log.ok('No games from IGDB.');
		return;
	}
	const withCoverId = games.filter((g) => g.cover).length;
	log.ok(`${games.length} games  (${withCoverId} with cover id)`);

	const gameIds = games.map((g) => g.id).filter(Boolean);

	// 2) Get Steam app IDs from external_games
	const gameIdToSteamAppId = new Map();
	for (let i = 0; i < gameIds.length; i += EXTERNAL_GAMES_BATCH) {
		const batch = gameIds.slice(i, i + EXTERNAL_GAMES_BATCH);
		const extBody = `fields game,uid,external_game_source; where game = (${batch.join(',')}) & external_game_source = 1; limit ${EXTERNAL_GAMES_BATCH};`;
		try {
			const externalGames = await igdbPost(token, clientId, 'external_games', extBody);
			for (const eg of externalGames) {
				if (eg.uid) gameIdToSteamAppId.set(eg.game, String(eg.uid));
			}
		} catch (e) {
			log.warn(`external_games: ${e.message}`);
		}
		await sleep(IGDB_RATE_LIMIT_MS);
	}
	log.ok(`Steam app IDs for ${gameIdToSteamAppId.size} games`);

	// 3) Fetch cover image_ids by cover ID
	log.step('Covers');
	const coverIds = [...new Set(games.map((g) => g.cover).filter(Boolean))];
	let coverMap = new Map();
	const coverIdsWeGotBack = new Set();

	for (let i = 0; i < coverIds.length; i += EXTERNAL_GAMES_BATCH) {
		const batch = coverIds.slice(i, i + EXTERNAL_GAMES_BATCH);
		const coverBody = `fields id,image_id; where id = (${batch.join(',')}); limit ${EXTERNAL_GAMES_BATCH};`;
		try {
			const covers = await igdbPost(token, clientId, 'covers', coverBody);
			for (const c of covers) {
				coverIdsWeGotBack.add(c.id);
				if (c.image_id) {
					coverMap.set(
						c.id,
						`https://images.igdb.com/igdb/image/upload/t_cover_big/${c.image_id}.webp`
					);
				}
			}
		} catch (e) {
			log.warn(`covers: ${e.message}`);
		}
		await sleep(IGDB_RATE_LIMIT_MS);
	}

	const neverReturned = coverIds.filter((id) => !coverIdsWeGotBack.has(id));
	const returnedButNoImageId = coverIds.filter(
		(id) => coverIdsWeGotBack.has(id) && !coverMap.has(id)
	);
	log.ok(`${coverMap.size} / ${coverIds.length} cover URLs`);
	if (neverReturned.length > 0 || returnedButNoImageId.length > 0) {
		log.ok(
			`  Missing: ${neverReturned.length} not in API, ${returnedButNoImageId.length} no image_id`
		);
	}

	// 4) Fetch genre names
	log.step('Genres');
	let genreMap = new Map();
	const genreIds = [...new Set(games.flatMap((g) => g.genres || []).filter(Boolean))];
	if (genreIds.length > 0) {
		for (let i = 0; i < genreIds.length; i += EXTERNAL_GAMES_BATCH) {
			const batch = genreIds.slice(i, i + EXTERNAL_GAMES_BATCH);
			const genreBody = `fields name; where id = (${batch.join(',')}); limit ${EXTERNAL_GAMES_BATCH};`;
			try {
				const genres = await igdbPost(token, clientId, 'genres', genreBody);
				for (const g of genres) genreMap.set(g.id, g.name || '');
			} catch (e) {
				log.warn(`genres: ${e.message}`);
			}
			await sleep(IGDB_RATE_LIMIT_MS);
		}
		log.ok(`${genreMap.size} genres`);
	}

	// 5) Resolve involved_companies -> company names
	log.step('Companies');
	const involvedCompanyIds = [
		...new Set(games.flatMap((g) => g.involved_companies || []).filter(Boolean))
	];
	const icIdToCompanyId = new Map();
	const companyIds = new Set();

	if (involvedCompanyIds.length > 0) {
		for (let i = 0; i < involvedCompanyIds.length; i += EXTERNAL_GAMES_BATCH) {
			const batch = involvedCompanyIds.slice(i, i + EXTERNAL_GAMES_BATCH);
			try {
				const icBody = `fields company; where id = (${batch.join(',')}); limit ${EXTERNAL_GAMES_BATCH};`;
				const ics = await igdbPost(token, clientId, 'involved_companies', icBody);
				for (const ic of ics) {
					if (ic.company != null) {
						icIdToCompanyId.set(ic.id, ic.company);
						companyIds.add(ic.company);
					}
				}
			} catch (e) {
				log.warn(`involved_companies: ${e.message}`);
			}
			await sleep(IGDB_RATE_LIMIT_MS);
		}
	}

	let companyIdToName = new Map();
	const cids = [...companyIds];
	if (cids.length > 0) {
		for (let i = 0; i < cids.length; i += EXTERNAL_GAMES_BATCH) {
			const batch = cids.slice(i, i + EXTERNAL_GAMES_BATCH);
			try {
				const companyBody = `fields name; where id = (${batch.join(',')}); limit ${EXTERNAL_GAMES_BATCH};`;
				const companies = await igdbPost(token, clientId, 'companies', companyBody);
				for (const c of companies) companyIdToName.set(c.id, c.name || '');
			} catch (e) {
				log.warn(`companies: ${e.message}`);
			}
			await sleep(IGDB_RATE_LIMIT_MS);
		}
		log.ok(`${companyIdToName.size} companies`);
	}

	// 6) Build game docs
	log.step('Build & write');
	const gameDocs = [];
	let withCover = 0;
	let withoutCover = 0;

	for (const g of games) {
		if (g.id == null) continue;

		const steamAppId = gameIdToSteamAppId.get(g.id) ?? null;
		if (!steamAppId) continue; // only output games with a Steam ID
		const isHidden = steamAppId === HIDDEN_APP_ID;
		const releaseDate = g.first_release_date
			? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
			: null;
		const coverUrl = (g.cover && coverMap.get(g.cover)) || null;
		if (coverUrl) withCover++;
		else withoutCover++;
		const genreNames = (g.genres || []).map((id) => genreMap.get(id)).filter(Boolean);

		const companyNames = [
			...new Set(
				(g.involved_companies || [])
					.map((icId) => companyIdToName.get(icIdToCompanyId.get(icId)))
					.filter(Boolean)
			)
		];

		gameDocs.push({
			id: String(g.id),
			name: g.name || 'Unknown',
			coverUrl,
			releaseDate,
			genres: genreNames,
			steamAppId,
			igdbId: g.id,
			isHidden,
			description: (g.summary || '').trim() || null,
			companies: companyNames.length ? companyNames : null
		});
	}

	const output = { games: gameDocs };
	writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
	log.ok(`${OUTPUT_FILE}  →  ${gameDocs.length} games`);

	log.header(`Done  ${gameDocs.length} games  |  ${withCover} with cover`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
