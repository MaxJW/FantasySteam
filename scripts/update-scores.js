/**
 * Daily Fantasy Score Update (GitHub Action)
 * - Runs once per day via GitHub Actions workflow.
 * - Source: Official Steam APIs only (No SteamSpy).
 * - Logic: Calculates daily points based on TODAY's growth (Deltas).
 * - Storage: Updates Firestore 'games' collection + 'history' subcollection.
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ---------- Configuration ---------- */
const SALES_PER_REVIEW = 40; // Est. sales per review
const DELAY_MS = 1500; // 1.5s delay to be polite to Steam

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

/* ---------- Helpers ---------- */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logScore(value, scale = 1) {
	return Math.log10(Math.max(1, value)) * scale;
}

function timeMultiplier(days) {
	// PHASE 1: Launch Hype (First 2 Weeks)
	// We reward the immediate explosion of sales/CCU.
	if (days <= 14) return 2.0;

	// PHASE 2: The Season (Up to 3 Months)
	// This is the core "Active" period. Games shouldn't be penalized yet.
	// This allows sleeper hits to catch up to front-loaded AAA games.
	if (days <= 90) return 1.0;

	// PHASE 3: The Long Tail (3 Months+)
	// After a quarter, we dampen the score so older games don't dominate forever.
	if (days <= 180) return 0.75;

	// PHASE 4: Legacy
	return 0.5;
}
/**
 * Calculates points for the day based on GROWTH (Deltas)
 * Matches the breakdown logic: Owners(4), CCU(3), Reviews(1*Qual*5)
 */
function calculateDailyPoints({ salesDelta, ccu, reviewsDelta, positiveRatio, daysSinceRelease }) {
	// 1. Sales Score: Based on NEW estimated copies sold today
	const ownersScore = logScore(salesDelta, 4);

	// 2. CCU Score: Based on current active players right now
	const ccuScore = logScore(ccu, 3);

	// 3. Review Score: Based on NEW reviews today * Quality
	const reviewScore = reviewsDelta > 0 ? logScore(reviewsDelta, 1) * positiveRatio * 5 : 0;

	const rawTotal = ownersScore + ccuScore + reviewScore;
	return rawTotal * timeMultiplier(daysSinceRelease);
}

/* ---------- APIs ---------- */
const HEADERS = {
	'User-Agent': 'SteamFantasyLeagueBot/1.0 (Contact: admin@example.com)'
};

async function fetchGameData(appId) {
	try {
		// 1. Fetch Reviews (Store API) - Used for Sales Estimation
		const reviewRes = await fetch(
			`https://store.steampowered.com/appreviews/${appId}?json=1&num_per_page=0&purchase_type=all&language=all`,
			{ headers: HEADERS }
		);

		// 2. Fetch Current Players (Official Steam UserStats API) - Replaces SteamSpy
		const ccuRes = await fetch(
			`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
			{ headers: HEADERS }
		);

		if (!reviewRes.ok) throw new Error(`Steam Store Error: ${reviewRes.status}`);

		const reviewData = await reviewRes.json();
		const ccuData = ccuRes.ok ? await ccuRes.json() : { response: { player_count: 0 } };

		const summary = reviewData.query_summary || {};
		const totalReviews = summary.total_reviews || 0;

		return {
			success: true,
			reviewsTotal: totalReviews,
			reviewsPositive: summary.total_positive || 0,
			ccu: ccuData.response?.player_count || 0, // Reliable real-time count
			estimatedOwners: totalReviews * SALES_PER_REVIEW
		};
	} catch (error) {
		console.warn(`    Failed to fetch ${appId}: ${error.message}`);
		return { success: false };
	}
}

/* ---------- Main ---------- */
async function main() {
	const gamesPath = join(__dirname, '..', 'src/lib/assets/games.json');
	const games = JSON.parse(readFileSync(gamesPath)).games;

	// We use ISO string for sorting/IDs, but YYYY-MM-DD for the history Doc ID
	const todayDate = new Date();
	const todayStr = todayDate.toISOString().split('T')[0];

	console.log(`Starting Daily Update for ${todayStr} - ${games.length} games defined.`);

	for (const game of games) {
		// 1. Skip invalid entries
		if (!game.steamAppId || !game.releaseDate) continue;

		const releaseDate = new Date(game.releaseDate);
		const diffTime = todayDate - releaseDate;
		const daysSinceRelease = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		// 2. Only calculate scores for games that have released
		if (daysSinceRelease < 0) {
			console.log(`Skipping ${game.name} (releases ${game.releaseDate}, not yet released).`);
			continue;
		}

		console.log(`Processing ${game.name} (Day ${daysSinceRelease})...`);

		// 3. Fetch Live Data
		await wait(DELAY_MS); // Rate Limit
		const current = await fetchGameData(game.steamAppId);

		if (!current.success) continue;

		// 4. Get Yesterday's Data from Firestore (to calc Deltas)
		const gameRef = db.collection('games').doc(game.id);
		const historyRef = gameRef.collection('history');

		const lastSnap = await historyRef.orderBy('date', 'desc').limit(1).get();

		let prev = { estimatedOwners: 0, reviewsTotal: 0 };
		if (!lastSnap.empty) {
			const data = lastSnap.docs[0].data();
			// Guard: Ensure we don't use today's data if script re-runs
			if (data.date !== todayStr) {
				prev = {
					estimatedOwners: data.estimatedOwners || 0,
					reviewsTotal: data.reviewsTotal || 0
				};
			} else {
				// If re-running same day, try to find the day *before* that (optional complexity,
				// usually safer to just treat delta as 0 if re-running)
				console.log('    (Warning: Data for today already exists, deltas might be skewed)');
			}
		}

		// 5. Calculate Deltas (Growth since last run)
		const salesDelta = Math.max(0, current.estimatedOwners - prev.estimatedOwners);
		const reviewsDelta = Math.max(0, current.reviewsTotal - prev.reviewsTotal);

		const positiveRatio =
			current.reviewsTotal > 0 ? current.reviewsPositive / current.reviewsTotal : 0;

		// 6. Calculate Points
		const dailyPoints = calculateDailyPoints({
			salesDelta,
			ccu: current.ccu,
			reviewsDelta,
			positiveRatio,
			daysSinceRelease
		});

		// 7. Write to Firestore

		// A. Update Main Document (Current Totals + Status)
		const isActive = current.estimatedOwners > 1000 || salesDelta > 100 || current.ccu > 20;

		await gameRef.set(
			{
				lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
				metrics: {
					estimatedOwners: current.estimatedOwners,
					ccu: current.ccu,
					reviewsTotal: current.reviewsTotal,
					reviewsPositive: current.reviewsPositive,
					status: isActive ? 'Active' : 'Inactive',
					score: admin.firestore.FieldValue.increment(dailyPoints) // Atomic increment
				}
			},
			{ merge: true }
		);

		// B. Add History Entry (Daily Log)
		await historyRef.doc(todayStr).set({
			date: todayStr,
			estimatedOwners: current.estimatedOwners,
			salesDelta,
			ccu: current.ccu,
			reviewsTotal: current.reviewsTotal,
			reviewsDelta,
			positiveRatio,
			points: dailyPoints,
			daysSinceRelease
		});

		console.log(`   > +${Math.round(dailyPoints)} pts | Sales +${salesDelta} | CCU ${current.ccu}`);
	}

	// Update games.json with current scores so browse games page can show them without Firestore
	const full = JSON.parse(readFileSync(gamesPath, 'utf8'));
	const snap = await db.collection('games').get();
	const scoreById = {};
	snap.docs.forEach((d) => {
		const score = d.data().metrics?.score;
		if (score != null) scoreById[d.ref.id] = score;
	});
	full.games.forEach((g) => {
		g.score = scoreById[g.id] ?? null;
	});
	writeFileSync(gamesPath, JSON.stringify(full, null, '\t'), 'utf8');
	console.log('Updated games.json with current scores.');

	console.log('Daily update complete.');
}

main().catch(console.error);
