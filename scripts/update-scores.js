/**
 * Fantasy Score Update
 *
 * Runs twice daily via GitHub Actions:
 *   - 06:00 UTC (off-peak): CCU snapshot only (--ccu-only)
 *   - 18:00 UTC (peak):     Full scoring run
 *
 * Scoring uses sqrt-based scaling for more meaningful spread between games,
 * milestone bonuses for exciting one-time events, breakout detection for
 * sleeper hits, and a relative bomb threshold (25th percentile).
 *
 * Usage:
 *   node scripts/update-scores.js              # full scoring run
 *   node scripts/update-scores.js --ccu-only   # off-peak CCU snapshot only
 *   node scripts/update-scores.js --dry-run    # log only, no Firestore writes
 *   node scripts/update-scores.js --concurrency 8   # parallel workers (default 5)
 *   node scripts/update-scores.js --delay 300      # ms between starting new requests (default 400)
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const SALES_PER_REVIEW = 40;
const DRY_RUN = process.argv.includes('--dry-run');
const CCU_ONLY = process.argv.includes('--ccu-only');
const GAMES_JSON_PATH = join(__dirname, '..', 'src/lib/assets/games.json');

const concurrencyIdx = process.argv.indexOf('--concurrency');
const CONCURRENCY = concurrencyIdx >= 0 ? parseInt(process.argv[concurrencyIdx + 1], 10) : 5;

const delayIdx = process.argv.indexOf('--delay');
const DELAY_MS = delayIdx >= 0 ? parseInt(process.argv[delayIdx + 1], 10) : 400;

const BATCH_COMMIT_RETRIES = 3;
const BATCH_COMMIT_INITIAL_BACKOFF_MS = 1000;

const HEADERS = {
	'User-Agent': 'SteamFantasyLeagueBot/1.0'
};

/* ------------------------------------------------------------------ */
/*  Milestones                                                         */
/* ------------------------------------------------------------------ */

const MILESTONES = [
	{ id: 'reviews_1k', check: (d) => d.reviewsTotal >= 1000, points: 50, label: '1K Reviews' },
	{ id: 'ccu_10k', check: (d) => d.peakCcu >= 10000, points: 75, label: '10K Peak CCU' },
	{
		id: 'overwhelmingly_positive',
		check: (d) => d.positiveRatio > 0.95 && d.reviewsTotal >= 500,
		points: 100,
		label: 'Overwhelmingly Positive'
	},
	{
		id: 'very_positive',
		check: (d) => d.positiveRatio > 0.8 && d.reviewsTotal >= 200,
		points: 30,
		label: 'Very Positive'
	}
];

const BREAKOUT_BONUS = 50;
const BREAKOUT_MULTIPLIER = 3;
const BREAKOUT_MIN_DAYS = 3;

/* ------------------------------------------------------------------ */
/*  Stats tracker                                                      */
/* ------------------------------------------------------------------ */

const stats = {
	gamesProcessed: 0,
	gamesSkipped: 0,
	gamesFailed: 0,
	gamesDelisted: 0,
	totalPointsAwarded: 0,
	milestonesBonusTotal: 0,
	breakoutBonusTotal: 0,
	totalBombDamage: 0,
	leaguesProcessed: 0,
	bombThreshold: 0
};

/* ------------------------------------------------------------------ */
/*  Firebase                                                           */
/* ------------------------------------------------------------------ */

function initFirebase() {
	const envCred = process.env.FIREBASE_SERVICE_ACCOUNT;
	if (envCred) {
		admin.initializeApp({ credential: admin.credential.cert(JSON.parse(envCred)) });
	} else {
		const keyPath = join(__dirname, '..', 'service-account.json');
		admin.initializeApp({
			credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8')))
		});
	}
	return admin.firestore();
}

/* ------------------------------------------------------------------ */
/*  Scoring helpers                                                    */
/* ------------------------------------------------------------------ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sqrtScore(value, scale = 1) {
	return Math.sqrt(Math.max(0, value)) * scale;
}

function timeMultiplier(days) {
	if (days <= 14) return 2.0;
	if (days <= 90) return 1.0;
	if (days <= 180) return 0.75;
	return 0.5;
}

function calculateDailyPoints({ salesDelta, ccu, reviewsDelta, positiveRatio, daysSinceRelease }) {
	const ownersScore = sqrtScore(salesDelta, 0.2);
	const ccuScore = sqrtScore(ccu, 0.15);
	const reviewScore = reviewsDelta > 0 ? sqrtScore(reviewsDelta, 0.4) * positiveRatio * 2 : 0;
	return (ownersScore + ccuScore + reviewScore) * timeMultiplier(daysSinceRelease);
}

function computeBombThreshold(dailyPointsByGameId) {
	const scores = Object.values(dailyPointsByGameId)
		.filter((p) => p > 0)
		.sort((a, b) => a - b);
	if (scores.length < 4) return 0;
	return scores[Math.floor(scores.length * 0.25)];
}

/* ------------------------------------------------------------------ */
/*  Steam API (with 429 retry)                                         */
/* ------------------------------------------------------------------ */

async function fetchWithRetry(url, options = {}) {
	let lastErr;
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
		if (res.status === 429) {
			const retryAfter = parseInt(res.headers.get('Retry-After'), 10) || 60;
			const backoff = Math.min(retryAfter * 1000, 120000);
			if (attempt < 2) {
				console.error(`  Steam 429 rate limit, backing off ${backoff / 1000}s...`);
				await sleep(backoff);
			} else {
				throw new Error(`Steam 429 rate limit (exhausted retries)`);
			}
		} else {
			return res;
		}
	}
	throw lastErr;
}

async function fetchSteamData(appId) {
	const reviewUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&num_per_page=0&purchase_type=all&language=all`;
	const ccuUrl = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`;

	const [reviewRes, ccuRes] = await Promise.all([
		fetchWithRetry(reviewUrl),
		fetchWithRetry(ccuUrl)
	]);

	if (reviewRes.status === 403 || reviewRes.status === 404) {
		return { success: false, delisted: true };
	}
	if (!reviewRes.ok) {
		throw new Error(`Steam reviews ${reviewRes.status}`);
	}

	const reviewData = await reviewRes.json();
	const ccuData = ccuRes.ok ? await ccuRes.json() : { response: { player_count: 0 } };
	const summary = reviewData.query_summary || {};
	const totalReviews = summary.total_reviews || 0;

	return {
		success: true,
		delisted: false,
		reviewsTotal: totalReviews,
		reviewsPositive: summary.total_positive || 0,
		ccu: ccuData.response?.player_count || 0,
		estimatedOwners: totalReviews * SALES_PER_REVIEW
	};
}

async function fetchCcuOnly(appId) {
	const ccuUrl = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`;
	const res = await fetchWithRetry(ccuUrl);
	if (!res.ok) return 0;
	const data = await res.json();
	return data.response?.player_count || 0;
}

/* ------------------------------------------------------------------ */
/*  CCU-only mode (off-peak snapshot) — parallel with batch writes      */
/* ------------------------------------------------------------------ */

async function runCcuOnly(db, games, todayStr) {
	const todayDate = new Date();
	const gamesToProcess = games.filter((g) => {
		if (!g.steamAppId || !g.releaseDate) return false;
		if (new Date(g.releaseDate) > todayDate) return false;
		return true;
	});

	const tasks = gamesToProcess.map((game) => {
		const run = async () => {
			try {
				const ccu = await fetchCcuOnly(game.steamAppId);
				return { gameId: game.id, gameName: game.name, ccu };
			} catch (err) {
				return { gameId: game.id, gameName: game.name, error: err?.message };
			}
		};
		return run;
	});

	const results = await runWithConcurrency(tasks, CONCURRENCY, DELAY_MS);

	let processed = 0;
	const updates = [];
	for (const r of results) {
		if (!r) continue;
		if (r.error) {
			console.error(`  ERROR ${r.gameName}: ${r.error}`);
			continue;
		}
		processed++;
		if (r.ccu > 0) console.log(`  ${r.gameName}: CCU ${r.ccu}`);
		updates.push({ gameId: r.gameId, ccu: r.ccu });
	}

	if (!DRY_RUN && updates.length > 0) {
		const BATCH_SIZE = 500;
		for (let i = 0; i < updates.length; i += BATCH_SIZE) {
			const batch = db.batch();
			for (const { gameId, ccu } of updates.slice(i, i + BATCH_SIZE)) {
				batch.set(
					db.collection('games').doc(gameId),
					{ metrics: { ccuOffpeak: ccu } },
					{ merge: true }
				);
			}
			await commitBatch(batch);
		}
	}

	console.log(
		`\nCCU snapshot complete: ${processed} processed, ${games.length - gamesToProcess.length} skipped`
	);
}

/* ------------------------------------------------------------------ */
/*  Process a single game (full scoring) — returns result, no writes   */
/* ------------------------------------------------------------------ */

async function processGame(db, game, todayDate, todayStr, gameDataCache) {
	const releaseDate = new Date(game.releaseDate);
	const daysSinceRelease = Math.floor((todayDate - releaseDate) / (1000 * 60 * 60 * 24));

	if (daysSinceRelease < 0) {
		return { gameId: game.id, points: 0, delisted: false, skipped: true };
	}

	const current = await fetchSteamData(game.steamAppId);

	if (current.delisted) {
		return { gameId: game.id, points: 0, delisted: true };
	}
	if (!current.success) {
		return { gameId: game.id, points: 0, delisted: false, failed: true };
	}

	const gameData = gameDataCache.get(game.id) ?? {};
	const offpeakCcu = gameData?.metrics?.ccuOffpeak ?? 0;
	const peakCcu = Math.max(current.ccu, offpeakCcu);

	const historyRef = db.collection('games').doc(game.id).collection('history');
	const lastSnap = await historyRef.orderBy('date', 'desc').limit(1).get();

	let prev = { estimatedOwners: 0, reviewsTotal: 0 };
	if (!lastSnap.empty) {
		const last = lastSnap.docs[0].data();
		if (last.date !== todayStr) {
			prev = {
				estimatedOwners: last.estimatedOwners || 0,
				reviewsTotal: last.reviewsTotal || 0
			};
		}
	}

	const salesDelta = Math.max(0, current.estimatedOwners - prev.estimatedOwners);
	const reviewsDelta = Math.max(0, current.reviewsTotal - prev.reviewsTotal);
	const positiveRatio =
		current.reviewsTotal > 0 ? current.reviewsPositive / current.reviewsTotal : 0;

	const basePoints = calculateDailyPoints({
		salesDelta,
		ccu: peakCcu,
		reviewsDelta,
		positiveRatio,
		daysSinceRelease
	});

	// --- Milestone detection ---
	const existingMilestones = gameData?.milestones ?? [];
	let milestoneBonus = 0;
	const newMilestones = [];
	for (const ms of MILESTONES) {
		if (existingMilestones.includes(ms.id)) continue;
		if (ms.check({ reviewsTotal: current.reviewsTotal, peakCcu, positiveRatio })) {
			milestoneBonus += ms.points;
			newMilestones.push(ms.id);
			console.log(`    MILESTONE: ${game.name} — ${ms.label} (+${ms.points} pts)`);
		}
	}

	// --- Breakout detection (7-day rolling avg CCU) ---
	let breakoutBonus = 0;
	const hasBreakout = gameData?.breakoutAwarded ?? false;
	if (!hasBreakout && peakCcu >= 100) {
		const recentSnap = await historyRef.orderBy('date', 'desc').limit(7).get();
		if (recentSnap.size >= BREAKOUT_MIN_DAYS) {
			const avgCcu =
				recentSnap.docs.reduce((sum, d) => sum + (d.data().ccu ?? 0), 0) / recentSnap.size;
			if (avgCcu > 0 && peakCcu >= avgCcu * BREAKOUT_MULTIPLIER) {
				breakoutBonus = BREAKOUT_BONUS;
				console.log(
					`    BREAKOUT: ${game.name} — CCU ${peakCcu} vs 7d avg ${Math.round(avgCcu)} (+${BREAKOUT_BONUS} pts)`
				);
			}
		}
	}

	const totalDailyPoints = basePoints + milestoneBonus + breakoutBonus;
	const isActive = current.estimatedOwners > 1000 || salesDelta > 100 || peakCcu > 20;

	const gameUpdate = {
		lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
		metrics: {
			estimatedOwners: current.estimatedOwners,
			ccu: peakCcu,
			reviewsTotal: current.reviewsTotal,
			reviewsPositive: current.reviewsPositive,
			status: isActive ? 'Active' : 'Inactive',
			score: admin.firestore.FieldValue.increment(totalDailyPoints)
		}
	};
	if (newMilestones.length > 0) {
		gameUpdate.milestones = admin.firestore.FieldValue.arrayUnion(...newMilestones);
	}
	if (breakoutBonus > 0) {
		gameUpdate.breakoutAwarded = true;
	}

	const historyDoc = {
		date: todayStr,
		estimatedOwners: current.estimatedOwners,
		salesDelta,
		ccu: peakCcu,
		reviewsTotal: current.reviewsTotal,
		reviewsDelta,
		positiveRatio,
		points: totalDailyPoints,
		basePoints,
		milestoneBonus,
		breakoutBonus,
		daysSinceRelease
	};

	console.log(
		`  ${game.name}: +${totalDailyPoints.toFixed(1)} pts (base ${basePoints.toFixed(1)}) | Sales +${salesDelta} | CCU ${peakCcu}`
	);

	return {
		gameId: game.id,
		points: totalDailyPoints,
		delisted: false,
		milestoneBonus,
		breakoutBonus,
		gameUpdate,
		historyDoc,
		gameRef: db.collection('games').doc(game.id)
	};
}

/* ------------------------------------------------------------------ */
/*  Bomb damage (relative threshold — 25th percentile)                 */
/* ------------------------------------------------------------------ */

async function processBombDamage(db, todayStr, dailyPointsByGameId) {
	const bombThreshold = computeBombThreshold(dailyPointsByGameId);
	stats.bombThreshold = bombThreshold;

	console.log(
		`\n--- Bomb damage (threshold: ${bombThreshold.toFixed(1)}, from ${Object.keys(dailyPointsByGameId).length} active games) ---`
	);

	if (bombThreshold <= 0) {
		console.log('  No bomb damage (too few active games)');
		return;
	}

	const leaguesSnap = await db
		.collection('leagues')
		.where('status', 'in', ['active', 'draft'])
		.get();

	for (const leagueDoc of leaguesSnap.docs) {
		const league = leagueDoc.data();
		const leagueId = leagueDoc.id;
		const teamsSnap = await db.collection('leagues').doc(leagueId).collection('teams').get();
		const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

		if (teams.length < 2) continue;
		stats.leaguesProcessed++;

		const numOther = teams.length - 1;
		const bombAdj = {};
		teams.forEach((t) => (bombAdj[t.id] = 0));

		for (const team of teams) {
			const bombGameId = team.picks?.bombPick;
			if (!bombGameId) continue;

			const dailyPts = dailyPointsByGameId[bombGameId] ?? 0;
			const damage = Math.max(0, bombThreshold - dailyPts);
			if (damage <= 0) continue;

			const perPlayer = damage / numOther;
			for (const other of teams) {
				if (other.id === team.id) continue;
				bombAdj[other.id] -= perPlayer;
			}

			stats.totalBombDamage += damage;
			console.log(
				`  ${league.name}: ${team.name}'s bomb dealt ${damage.toFixed(1)} dmg (${perPlayer.toFixed(1)}/player)`
			);
		}

		if (DRY_RUN) continue;

		const batch = db.batch();
		for (const team of teams) {
			if (bombAdj[team.id] === 0) continue;
			const teamRef = db.collection('leagues').doc(leagueId).collection('teams').doc(team.id);
			batch.update(teamRef, {
				bombAdjustment: admin.firestore.FieldValue.increment(bombAdj[team.id])
			});
		}
		batch.set(
			db.collection('leagues').doc(leagueId).collection('scoring').doc(todayStr),
			{ date: todayStr, bombAdjustments: bombAdj, bombThreshold },
			{ merge: true }
		);
		await commitBatch(batch);
	}
}

/* ------------------------------------------------------------------ */
/*  Delist detection                                                   */
/* ------------------------------------------------------------------ */

async function markDelistedGames(db, delistedGameIds) {
	if (delistedGameIds.length === 0) return;
	console.log(`\n--- Marking ${delistedGameIds.length} delisted games ---`);

	const leaguesSnap = await db
		.collection('leagues')
		.where('status', 'in', ['active', 'draft'])
		.get();

	for (const leagueDoc of leaguesSnap.docs) {
		const league = leagueDoc.data();
		const current = league.delistedGames ?? [];
		const newOnes = delistedGameIds.filter((id) => !current.includes(id));
		if (newOnes.length === 0) continue;

		if (!DRY_RUN) {
			await leagueDoc.ref.update({
				delistedGames: admin.firestore.FieldValue.arrayUnion(...newOnes)
			});
		}
		console.log(`  ${league.name}: flagged ${newOnes.length} games as delisted`);
	}
}

/* ------------------------------------------------------------------ */
/*  Write scores summary to Firestore (from prefetched + updates)       */
/* ------------------------------------------------------------------ */

async function writeScoresSummary(db, gameDataCache, updatesToCommit, todayStr) {
	if (DRY_RUN) {
		console.log('\n(dry-run) Skipping scores summary write');
		return;
	}

	const scores = {};
	for (const [gameId, data] of gameDataCache) {
		const score = data?.metrics?.score;
		if (score != null) scores[gameId] = score;
	}
	for (const { gameRef, gameUpdate, historyDoc } of updatesToCommit) {
		const gameId = gameRef.id;
		const oldScore = gameDataCache.get(gameId)?.metrics?.score ?? 0;
		scores[gameId] = oldScore + (historyDoc?.points ?? 0);
	}
	await db
		.collection('meta')
		.doc('scores')
		.set({ scores, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
	console.log(`\nWrote scores summary (${Object.keys(scores).length} games) to meta/scores`);
}

/* ------------------------------------------------------------------ */
/*  Concurrency pool with stagger                                      */
/* ------------------------------------------------------------------ */

async function runWithConcurrency(tasks, concurrency, delayMs) {
	const results = new Array(tasks.length);
	let nextIdx = 0;

	async function runNext() {
		const idx = nextIdx++;
		if (idx >= tasks.length) return;
		try {
			const result = await tasks[idx]();
			results[idx] = result;
		} catch (err) {
			results[idx] = { error: err?.message ?? String(err), gameId: null };
		}
		if (nextIdx < tasks.length) {
			if (delayMs > 0) await sleep(delayMs);
			await runNext();
		}
	}

	const workers = [];
	for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
		workers.push(runNext());
	}
	await Promise.all(workers);
	return results;
}

/* ------------------------------------------------------------------ */
/*  Prefetch all game docs                                             */
/* ------------------------------------------------------------------ */

async function prefetchGameDocs(db, gameIds) {
	const cache = new Map();
	const BATCH_SIZE = 500;
	for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
		const batch = gameIds.slice(i, i + BATCH_SIZE);
		const refs = batch.map((id) => db.collection('games').doc(id));
		const snapshots = await db.getAll(...refs);
		snapshots.forEach((snap, j) => {
			if (snap.exists) cache.set(batch[j], snap.data());
		});
	}
	return cache;
}

/* ------------------------------------------------------------------ */
/*  Batch commit with retry                                            */
/* ------------------------------------------------------------------ */

async function commitBatch(batch) {
	let lastErr;
	for (let attempt = 0; attempt < BATCH_COMMIT_RETRIES; attempt++) {
		try {
			await batch.commit();
			return;
		} catch (err) {
			lastErr = err;
			const backoff = BATCH_COMMIT_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
			console.error(`  Batch commit failed (attempt ${attempt + 1}), retrying in ${backoff}ms...`);
			await sleep(backoff);
		}
	}
	throw lastErr;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
	if (DRY_RUN) console.log('*** DRY RUN — no writes to Firestore ***\n');

	const db = initFirebase();
	const games = JSON.parse(readFileSync(GAMES_JSON_PATH, 'utf8')).games;
	const todayDate = new Date();
	const todayStr = todayDate.toISOString().split('T')[0];

	if (CCU_ONLY) {
		console.log(`=== Off-Peak CCU Snapshot — ${todayStr} — ${games.length} games ===\n`);
		await runCcuOnly(db, games, todayStr);
		return;
	}

	console.log(
		`=== Score Update (Peak) — ${todayStr} — ${games.length} games (concurrency ${CONCURRENCY}, delay ${DELAY_MS}ms) ===\n`
	);

	const gamesToProcess = games.filter((g) => {
		if (!g.steamAppId || !g.releaseDate) return false;
		if (new Date(g.releaseDate) > todayDate) return false;
		return true;
	});

	stats.gamesSkipped = games.length - gamesToProcess.length;

	const allGameIds = games.map((g) => g.id);
	console.log('Prefetching game docs...');
	const gameDataCache = await prefetchGameDocs(db, allGameIds);
	console.log(`  Cached ${gameDataCache.size} game docs\n`);

	const tasks = gamesToProcess.map((game) => {
		const run = async () => {
			try {
				return await processGame(db, game, todayDate, todayStr, gameDataCache);
			} catch (err) {
				return { error: err?.message ?? String(err), gameId: game.id };
			}
		};
		return run;
	});

	const results = await runWithConcurrency(tasks, CONCURRENCY, DELAY_MS);

	const dailyPointsByGameId = {};
	const delistedGameIds = [];
	const updatesToCommit = [];

	for (const r of results) {
		if (!r) continue;
		if (r.error) {
			stats.gamesFailed++;
			console.error(`  ERROR processing game: ${r.error}`);
			continue;
		}
		if (r.skipped) {
			stats.gamesSkipped++;
			continue;
		}
		if (r.delisted) {
			stats.gamesDelisted++;
			delistedGameIds.push(r.gameId);
			continue;
		}
		if (r.failed) {
			stats.gamesFailed++;
			continue;
		}
		stats.gamesProcessed++;
		stats.totalPointsAwarded += r.points;
		stats.milestonesBonusTotal += r.milestoneBonus ?? 0;
		stats.breakoutBonusTotal += r.breakoutBonus ?? 0;
		if (r.points > 0) dailyPointsByGameId[r.gameId] = r.points;
		if (r.gameUpdate && r.historyDoc && r.gameRef) {
			updatesToCommit.push({
				gameRef: r.gameRef,
				gameUpdate: r.gameUpdate,
				historyDoc: r.historyDoc
			});
		}
	}

	if (!DRY_RUN && updatesToCommit.length > 0) {
		console.log(`\nCommitting ${updatesToCommit.length} game updates in batches...`);
		const BATCH_OPS = 250;
		for (let i = 0; i < updatesToCommit.length; i += BATCH_OPS) {
			const chunk = updatesToCommit.slice(i, i + BATCH_OPS);
			const batch = db.batch();
			for (const { gameRef, gameUpdate, historyDoc } of chunk) {
				batch.set(gameRef, gameUpdate, { merge: true });
				batch.set(gameRef.collection('history').doc(todayStr), historyDoc);
			}
			await commitBatch(batch);
			console.log(`  Committed batch ${Math.floor(i / BATCH_OPS) + 1}`);
		}
	}

	await processBombDamage(db, todayStr, dailyPointsByGameId);
	await markDelistedGames(db, delistedGameIds);
	await writeScoresSummary(db, gameDataCache, updatesToCommit, todayStr);

	console.log('\n=== Summary ===');
	console.log(`  Games processed  : ${stats.gamesProcessed}`);
	console.log(`  Games skipped    : ${stats.gamesSkipped}`);
	console.log(`  Games failed     : ${stats.gamesFailed}`);
	console.log(`  Games delisted   : ${stats.gamesDelisted}`);
	console.log(`  Total points     : ${stats.totalPointsAwarded.toFixed(1)}`);
	console.log(`  Milestone bonus  : ${stats.milestonesBonusTotal.toFixed(1)}`);
	console.log(`  Breakout bonus   : ${stats.breakoutBonusTotal.toFixed(1)}`);
	console.log(`  Bomb threshold   : ${stats.bombThreshold.toFixed(1)}`);
	console.log(`  Bomb damage      : ${stats.totalBombDamage.toFixed(1)}`);
	console.log(`  Leagues scored   : ${stats.leaguesProcessed}`);
	if (DRY_RUN) console.log('  (dry-run — nothing was written)');
	console.log('');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
