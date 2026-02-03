/**
 * Daily score update script.
 * Fetches SteamSpy data for all drafted games, writes metrics and history to Firestore,
 * then recalculates team scores. Run via GitHub Action at 6 AM UTC or locally with
 * FIREBASE_SERVICE_ACCOUNT env (JSON string of service account key).
 * Loads .env from project root if present.
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

function parseOwners(value) {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string') return 0;
	const match = value.match(/(\d[\d,]*)\s*\.\.\.?\s*(\d[\d,]*)/);
	if (match) return parseInt(match[2].replace(/,/g, ''), 10) || 0;
	return parseInt(value.replace(/,/g, ''), 10) || 0;
}

function timeMultiplier(daysSinceRelease) {
	if (daysSinceRelease <= 30) return 2.0;
	if (daysSinceRelease <= 90) return 1.0;
	return 0.5;
}

function todayStr() {
	const d = new Date();
	return d.toISOString().slice(0, 10);
}

function parseReleaseDate(releaseDate) {
	if (!releaseDate) return null;
	const d = new Date(releaseDate);
	return isNaN(d.getTime()) ? null : d;
}

async function fetchSteamSpy(appId) {
	const url = `https://steamspy.com/api.php?request=appdetails&appid=${appId}`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json();
	return {
		owners: parseOwners(data.owners ?? data.owners_lower ?? 0),
		ccu: typeof data.ccu === 'number' ? data.ccu : parseInt(data.ccu, 10) || 0
	};
}

async function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

async function main() {
	const db = initFirebase();
	const today = todayStr();

	// Collect all drafted game IDs and team->game mapping for score recalc
	const leaguesSnap = await db.collection('leagues').get();
	const draftedAppIds = new Set();
	const teamGames = new Map(); // leagueId -> Map(userId -> gameIds[])

	for (const leagueDoc of leaguesSnap.docs) {
		const leagueId = leagueDoc.id;
		const teamsSnap = await db.collection('leagues').doc(leagueId).collection('teams').get();
		teamGames.set(leagueId, new Map());
		for (const teamDoc of teamsSnap.docs) {
			const userId = teamDoc.id;
			const data = teamDoc.data();
			const picks = data?.picks ?? {};
			const gameIds = [
				picks.hitPick,
				picks.bustPick,
				...(picks.seasonalPicks ?? []),
				...(picks.altPicks ?? [])
			].filter(Boolean);
			for (const gid of gameIds) draftedAppIds.add(gid);
			teamGames.get(leagueId).set(userId, gameIds);
		}
	}

	const gameIds = [...draftedAppIds];
	console.log(`Found ${gameIds.length} drafted games to update.`);

	for (const gameId of gameIds) {
		await sleep(1100);
		const gameRef = db.collection('games').doc(gameId);
		const gameSnap = await gameRef.get();
		if (!gameSnap.exists) continue;

		const game = gameSnap.data();
		const steamAppId = game?.steamAppId;
		if (!steamAppId) continue; // no Steam link, skip metrics

		const releaseDate = parseReleaseDate(game?.releaseDate);
		const daysSinceRelease = releaseDate
			? Math.floor((new Date() - releaseDate) / (24 * 60 * 60 * 1000))
			: 0;

		const steamSpy = await fetchSteamSpy(steamAppId);
		if (!steamSpy) continue;

		const prevHistorySnap = await gameRef.collection('history').orderBy('__name__', 'desc').limit(1).get();
		let prevOwners = 0;
		if (!prevHistorySnap.empty) {
			const last = prevHistorySnap.docs[0].data();
			prevOwners = last.owners ?? 0;
		}
		const ownersDelta = Math.max(0, steamSpy.owners - prevOwners);
		const mult = timeMultiplier(daysSinceRelease);
		const dailyPoints = (ownersDelta / 1000 + steamSpy.ccu / 100) * mult;

		await gameRef.update({
			'metrics.owners': steamSpy.owners,
			'metrics.ccu': steamSpy.ccu,
			'metrics.lastFetched': admin.firestore.FieldValue.serverTimestamp()
		});
		await gameRef.collection('history').doc(today).set({
			owners: steamSpy.owners,
			ownersDelta,
			ccu: steamSpy.ccu,
			daysSinceRelease,
			dailyPoints
		});
	}

	// Recalculate team scores: sum all dailyPoints from each game's history for that team's picks
	for (const [leagueId, users] of teamGames) {
		for (const [userId, gameIds] of users) {
			let total = 0;
			for (const gameId of gameIds) {
				const historySnap = await db.collection('games').doc(gameId).collection('history').get();
				for (const doc of historySnap.docs) {
					total += doc.data().dailyPoints ?? 0;
				}
			}
			await db.collection('leagues').doc(leagueId).collection('teams').doc(userId).update({
				score: total
			});
		}
	}
	console.log('Team scores updated.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
