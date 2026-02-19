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
const DELAY_MS = 1500;
const DRY_RUN = process.argv.includes('--dry-run');
const CCU_ONLY = process.argv.includes('--ccu-only');
const GAMES_JSON_PATH = join(__dirname, '..', 'src/lib/assets/games.json');

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
/*  Steam API                                                          */
/* ------------------------------------------------------------------ */

async function fetchSteamData(appId) {
	const reviewUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&num_per_page=0&purchase_type=all&language=all`;
	const ccuUrl = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`;

	const [reviewRes, ccuRes] = await Promise.all([
		fetch(reviewUrl, { headers: HEADERS }),
		fetch(ccuUrl, { headers: HEADERS })
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
	const res = await fetch(ccuUrl, { headers: HEADERS });
	if (!res.ok) return 0;
	const data = await res.json();
	return data.response?.player_count || 0;
}

/* ------------------------------------------------------------------ */
/*  CCU-only mode (off-peak snapshot)                                  */
/* ------------------------------------------------------------------ */

async function runCcuOnly(db, games, todayStr) {
	const todayDate = new Date();
	let processed = 0;
	let skipped = 0;

	for (const game of games) {
		if (!game.steamAppId || !game.releaseDate) {
			skipped++;
			continue;
		}

		if (new Date(game.releaseDate) > todayDate) {
			skipped++;
			continue;
		}

		await sleep(DELAY_MS);
		try {
			const ccu = await fetchCcuOnly(game.steamAppId);
			if (!DRY_RUN) {
				await db
					.collection('games')
					.doc(game.id)
					.set({ metrics: { ccuOffpeak: ccu } }, { merge: true });
			}
			processed++;
			if (ccu > 0) console.log(`  ${game.name}: CCU ${ccu}`);
		} catch (err) {
			console.error(`  ERROR ${game.name}: ${err.message}`);
		}
	}

	console.log(`\nCCU snapshot complete: ${processed} processed, ${skipped} skipped`);
}

/* ------------------------------------------------------------------ */
/*  Process a single game (full scoring)                               */
/* ------------------------------------------------------------------ */

async function processGame(db, game, todayDate, todayStr) {
	const releaseDate = new Date(game.releaseDate);
	const daysSinceRelease = Math.floor((todayDate - releaseDate) / (1000 * 60 * 60 * 24));

	if (daysSinceRelease < 0) {
		stats.gamesSkipped++;
		return { gameId: game.id, points: 0, delisted: false };
	}

	await sleep(DELAY_MS);
	const current = await fetchSteamData(game.steamAppId);

	if (current.delisted) {
		stats.gamesDelisted++;
		return { gameId: game.id, points: 0, delisted: true };
	}
	if (!current.success) {
		stats.gamesFailed++;
		return { gameId: game.id, points: 0, delisted: false };
	}

	const gameRef = db.collection('games').doc(game.id);
	const gameDoc = await gameRef.get();
	const gameData = gameDoc.exists ? gameDoc.data() : {};

	const offpeakCcu = gameData?.metrics?.ccuOffpeak ?? 0;
	const peakCcu = Math.max(current.ccu, offpeakCcu);

	const historyRef = gameRef.collection('history');
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
			stats.milestonesBonusTotal += ms.points;
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
				stats.breakoutBonusTotal += BREAKOUT_BONUS;
				console.log(
					`    BREAKOUT: ${game.name} — CCU ${peakCcu} vs 7d avg ${Math.round(avgCcu)} (+${BREAKOUT_BONUS} pts)`
				);
			}
		}
	}

	const totalDailyPoints = basePoints + milestoneBonus + breakoutBonus;

	stats.gamesProcessed++;
	stats.totalPointsAwarded += totalDailyPoints;

	const isActive = current.estimatedOwners > 1000 || salesDelta > 100 || peakCcu > 20;

	if (!DRY_RUN) {
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
		await gameRef.set(gameUpdate, { merge: true });

		await historyRef.doc(todayStr).set({
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
		});
	}

	console.log(
		`  ${game.name}: +${totalDailyPoints.toFixed(1)} pts (base ${basePoints.toFixed(1)}) | Sales +${salesDelta} | CCU ${peakCcu}`
	);

	return { gameId: game.id, points: totalDailyPoints, delisted: false };
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

		for (const team of teams) {
			if (bombAdj[team.id] === 0) continue;
			await db
				.collection('leagues')
				.doc(leagueId)
				.collection('teams')
				.doc(team.id)
				.update({ bombAdjustment: admin.firestore.FieldValue.increment(bombAdj[team.id]) });
		}

		await db
			.collection('leagues')
			.doc(leagueId)
			.collection('scoring')
			.doc(todayStr)
			.set({ date: todayStr, bombAdjustments: bombAdj, bombThreshold }, { merge: true });
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
/*  Write scores summary to Firestore                                  */
/* ------------------------------------------------------------------ */

async function writeScoresSummary(db) {
	if (DRY_RUN) {
		console.log('\n(dry-run) Skipping scores summary write');
		return;
	}

	const snap = await db.collection('games').get();
	const scores = {};
	snap.docs.forEach((d) => {
		const score = d.data().metrics?.score;
		if (score != null) scores[d.ref.id] = score;
	});
	await db
		.collection('meta')
		.doc('scores')
		.set({ scores, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
	console.log(`\nWrote scores summary (${Object.keys(scores).length} games) to meta/scores`);
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

	console.log(`=== Score Update (Peak) — ${todayStr} — ${games.length} games ===\n`);

	const dailyPointsByGameId = {};
	const delistedGameIds = [];

	for (const game of games) {
		if (!game.steamAppId || !game.releaseDate) {
			stats.gamesSkipped++;
			continue;
		}

		if (new Date(game.releaseDate) > todayDate) {
			stats.gamesSkipped++;
			continue;
		}

		try {
			const result = await processGame(db, game, todayDate, todayStr);
			if (result.points > 0) dailyPointsByGameId[result.gameId] = result.points;
			if (result.delisted) delistedGameIds.push(result.gameId);
		} catch (err) {
			stats.gamesFailed++;
			console.error(`  ERROR processing ${game.name}: ${err.message}`);
		}
	}

	await processBombDamage(db, todayStr, dailyPointsByGameId);
	await markDelistedGames(db, delistedGameIds);
	await writeScoresSummary(db);

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
