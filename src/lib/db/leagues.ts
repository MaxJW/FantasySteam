import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	serverTimestamp,
	type DocumentReference
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type {
	League,
	LeagueSettings,
	Team,
	TeamPicks,
	DraftPhase,
	DraftStatus,
	SeasonSnapshot
} from './types';
import {
	DRAFT_PHASES,
	getDraftId,
	getNextPhase,
	getScoringGameIds,
	getEffectiveCurrentPhase,
	getSeasonEndDate
} from './types';
import { getGameHistory } from './games';

const LEAGUES = 'leagues';
const TEAMS = 'teams';
const DRAFTS = 'drafts';

// -----------------------------------------------------------------------
// Refs
// -----------------------------------------------------------------------

export function leagueRef(leagueId: string): DocumentReference {
	return doc(db, LEAGUES, leagueId);
}

export function teamRef(leagueId: string, userId: string): DocumentReference {
	return doc(db, LEAGUES, leagueId, TEAMS, userId);
}

export function draftRef(leagueId: string, draftId: string): DocumentReference {
	return doc(db, LEAGUES, leagueId, DRAFTS, draftId);
}

// -----------------------------------------------------------------------
// Read helpers
// -----------------------------------------------------------------------

export async function getLeague(leagueId: string): Promise<(League & { id: string }) | null> {
	const snap = await getDoc(leagueRef(leagueId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as League & { id: string };
}

export async function getLeagueByCode(code: string): Promise<(League & { id: string }) | null> {
	const q = query(collection(db, LEAGUES), where('code', '==', code.trim().toUpperCase()));
	const snap = await getDocs(q);
	if (snap.empty) return null;
	const d = snap.docs[0];
	return { id: d.id, ...d.data() } as League & { id: string };
}

export async function getLeaguesForUser(userId: string): Promise<(League & { id: string })[]> {
	const q = query(collection(db, LEAGUES), where('members', 'array-contains', userId));
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as League & { id: string });
}

export async function getTeam(
	leagueId: string,
	userId: string
): Promise<(Team & { id: string }) | null> {
	const snap = await getDoc(teamRef(leagueId, userId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as Team & { id: string };
}

export async function getTeams(leagueId: string): Promise<(Team & { id: string })[]> {
	const snap = await getDocs(collection(db, LEAGUES, leagueId, TEAMS));
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Team & { id: string });
}

// -----------------------------------------------------------------------
// Draft status helpers
// -----------------------------------------------------------------------

async function getDraftStatus(
	leagueId: string,
	phase: DraftPhase,
	season: string
): Promise<DraftStatus | null> {
	const snap = await getDoc(draftRef(leagueId, getDraftId(phase, season)));
	if (!snap.exists()) return null;
	return (snap.data() as { status: DraftStatus }).status;
}

/** Returns true if at least one draft in this league has been completed. */
export async function hasCompletedDraft(leagueId: string, season: string): Promise<boolean> {
	for (const phase of DRAFT_PHASES) {
		const status = await getDraftStatus(leagueId, phase, season);
		if (status === 'completed') return true;
	}
	return false;
}

/** Returns the status of each draft phase for a league. */
export async function getDraftPhaseStatuses(
	leagueId: string,
	season: string
): Promise<Record<DraftPhase, DraftStatus | null>> {
	const result = {} as Record<DraftPhase, DraftStatus | null>;
	for (const phase of DRAFT_PHASES) {
		result[phase] = await getDraftStatus(leagueId, phase, season);
	}
	return result;
}

/**
 * Recomputes the effective current phase from the current date and draft statuses,
 * and updates the league document if it's stale. Call when viewing the league page.
 */
export async function syncLeagueCurrentPhase(leagueId: string): Promise<void> {
	const league = await getLeague(leagueId);
	if (!league) return;

	const phaseStatuses = await getDraftPhaseStatuses(leagueId, league.season);
	const effectivePhase = getEffectiveCurrentPhase(phaseStatuses, league.season);

	if (effectivePhase && effectivePhase !== league.currentPhase) {
		const updates: Record<string, unknown> = { currentPhase: effectivePhase };
		if (league.status === 'draft') {
			updates.status = 'active';
		}
		await updateDoc(leagueRef(leagueId), updates);
	}
}

// -----------------------------------------------------------------------
// Create & Join
// -----------------------------------------------------------------------

function emptyTeamPicks(): TeamPicks {
	return {
		winterPicks: [],
		summerPicks: [],
		fallPicks: [],
		altPicks: []
	};
}

function getDefaultSeason(): string {
	const now = new Date();
	return (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()).toString();
}

export const LEAGUE_CODE_IN_USE = 'League code already in use';

export async function createLeague(
	commissionerId: string,
	name: string,
	code: string,
	settings: LeagueSettings,
	teamName: string = 'My Studio'
): Promise<string> {
	const normalizedCode = code.trim().toUpperCase();
	const existing = await getLeagueByCode(normalizedCode);
	if (existing) throw new Error(LEAGUE_CODE_IN_USE);

	const ref = doc(collection(db, LEAGUES));
	const league: League = {
		name,
		code: normalizedCode,
		commissionerId,
		settings,
		season: getDefaultSeason(),
		status: 'draft',
		currentPhase: 'winter',
		members: [commissionerId],
		delistedGames: [],
		createdAt: serverTimestamp() as League['createdAt']
	};
	await setDoc(ref, league);

	await setDoc(teamRef(ref.id, commissionerId), {
		name: teamName.trim() || 'My Studio',
		picks: emptyTeamPicks(),
		score: 0,
		bombAdjustment: 0
	});

	return ref.id;
}

export async function joinLeague(
	leagueId: string,
	userId: string,
	teamName: string = 'My Studio'
): Promise<void> {
	const leagueSnap = await getDoc(leagueRef(leagueId));
	if (!leagueSnap.exists()) throw new Error('League not found');
	const league = leagueSnap.data() as League;
	if (league.members.includes(userId)) return;

	const inProgress = await hasCompletedDraft(leagueId, league.season);
	if (inProgress) {
		throw new Error('Cannot join a league that is already in progress.');
	}

	await updateDoc(leagueRef(leagueId), {
		members: [...league.members, userId]
	});

	await setDoc(teamRef(leagueId, userId), {
		name: teamName.trim() || 'My Studio',
		picks: emptyTeamPicks(),
		score: 0,
		bombAdjustment: 0
	});
}

// -----------------------------------------------------------------------
// Phase Progression
// -----------------------------------------------------------------------

/**
 * Advances the league to the next phase after a draft completes.
 * winter -> summer, summer -> fall, fall -> completed.
 */
export async function advancePhase(leagueId: string): Promise<void> {
	const league = await getLeague(leagueId);
	if (!league) throw new Error('League not found');

	const next = getNextPhase(league.currentPhase);

	if (next) {
		await updateDoc(leagueRef(leagueId), {
			currentPhase: next,
			status: 'active'
		});
	} else {
		await updateDoc(leagueRef(leagueId), {
			status: 'completed'
		});
	}
}

// -----------------------------------------------------------------------
// Settings & Admin
// -----------------------------------------------------------------------

export async function updateLeagueSettings(
	leagueId: string,
	settings: Partial<LeagueSettings>
): Promise<void> {
	const updates: Record<string, unknown> = {};
	// LeagueSettings is currently empty; seasonal picks are derived from player count
	if (Object.keys(updates).length === 0) return;
	await updateDoc(leagueRef(leagueId), updates);
}

export async function updateLeagueSeason(leagueId: string, season: string): Promise<void> {
	await updateDoc(leagueRef(leagueId), { season });
}

export async function updateTeamName(
	leagueId: string,
	userId: string,
	name: string
): Promise<void> {
	await setDoc(teamRef(leagueId, userId), { name }, { merge: true });
}

export async function markGameDelisted(leagueId: string, gameId: string): Promise<void> {
	const league = await getLeague(leagueId);
	if (!league) throw new Error('League not found');
	const current = league.delistedGames ?? [];
	if (current.includes(gameId)) return;
	await updateDoc(leagueRef(leagueId), { delistedGames: [...current, gameId] });
}

export async function unmarkGameDelisted(leagueId: string, gameId: string): Promise<void> {
	const league = await getLeague(leagueId);
	if (!league) throw new Error('League not found');
	const current = league.delistedGames ?? [];
	await updateDoc(leagueRef(leagueId), {
		delistedGames: current.filter((id) => id !== gameId)
	});
}

export async function deleteLeague(leagueId: string): Promise<void> {
	await deleteDoc(leagueRef(leagueId));
}

// -----------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------

/** Calculate cumulative team scores per day for all teams in a league. */
export async function getTeamScoresHistory(
	leagueId: string,
	seasonEndDate?: string
): Promise<Map<string, Map<string, number>>> {
	const league = await getLeague(leagueId);
	const teams = await getTeams(leagueId);
	const delistedGames = league?.delistedGames ?? [];

	const teamScoresByDate = new Map<string, Map<string, number>>();

	const allGameIds = new Set<string>();
	for (const team of teams) {
		const scoring = getScoringGameIds(team.picks, delistedGames);
		scoring.forEach((id) => allGameIds.add(id));
	}

	const gameHistories = new Map<string, Array<{ date: string; points: number }>>();
	for (const gameId of allGameIds) {
		try {
			const history = await getGameHistory(gameId);
			let entries = history.map((h) => ({
				date: h.date || '',
				points: h.dailyPoints
			}));
			if (seasonEndDate) {
				entries = entries.filter((e) => e.date && e.date <= seasonEndDate);
			}
			gameHistories.set(gameId, entries);
		} catch {
			// Game may not have history yet
		}
	}

	const scoringSnap = await getDocs(collection(db, 'leagues', leagueId, 'scoring'));
	const storedBombAdj = new Map<string, Record<string, number>>();
	for (const scoringDoc of scoringSnap.docs) {
		const data = scoringDoc.data();
		const dateKey = data.date ?? scoringDoc.id;
		if (data.bombAdjustments && (!seasonEndDate || dateKey <= seasonEndDate)) {
			storedBombAdj.set(dateKey, data.bombAdjustments);
		}
	}

	const allDates = new Set<string>();
	gameHistories.forEach((history) => {
		history.forEach((h) => allDates.add(h.date));
	});
	let sortedDates = Array.from(allDates).sort();
	if (seasonEndDate) {
		sortedDates = sortedDates.filter((d) => d <= seasonEndDate);
	}

	for (const team of teams) {
		teamScoresByDate.set(team.id, new Map<string, number>());
	}

	for (let i = 0; i < sortedDates.length; i++) {
		const date = sortedDates[i];
		const previousDate = i > 0 ? sortedDates[i - 1] : null;

		const dailyRaw = new Map<string, number>();
		for (const team of teams) {
			const scoringIds = getScoringGameIds(team.picks, delistedGames);
			let pts = 0;
			for (const gid of scoringIds) {
				const dayData = gameHistories.get(gid)?.find((h) => h.date === date);
				if (dayData) pts += dayData.points;
			}
			dailyRaw.set(team.id, pts);
		}

		const dayBombAdj = storedBombAdj.get(date) ?? {};

		for (const team of teams) {
			const scores = teamScoresByDate.get(team.id)!;
			const prev = previousDate ? (scores.get(previousDate) ?? 0) : 0;
			const raw = dailyRaw.get(team.id) ?? 0;
			const adj = dayBombAdj[team.id] ?? 0;
			scores.set(date, prev + raw + adj);
		}
	}

	return teamScoresByDate;
}

// -----------------------------------------------------------------------
// Season Snapshots (past seasons)
// -----------------------------------------------------------------------

const SEASON_RESULTS = 'seasonResults';

function seasonSnapshotRef(leagueId: string, season: string): DocumentReference {
	return doc(db, LEAGUES, leagueId, SEASON_RESULTS, season);
}

export async function getSeasonSnapshot(
	leagueId: string,
	season: string
): Promise<SeasonSnapshot | null> {
	const snap = await getDoc(seasonSnapshotRef(leagueId, season));
	if (!snap.exists()) return null;
	return snap.data() as SeasonSnapshot;
}

export async function computeAndSaveSeasonSnapshot(
	leagueId: string,
	season: string
): Promise<SeasonSnapshot> {
	const seasonEnd = getSeasonEndDate(season);
	const history = await getTeamScoresHistory(leagueId, seasonEnd);
	const teams = await getTeams(leagueId);

	const allDates = new Set<string>();
	history.forEach((scores) => {
		scores.forEach((_, date) => allDates.add(date));
	});
	const sortedDates = Array.from(allDates).sort();

	const finalScores: Record<string, number> = {};
	for (const team of teams) {
		const scores = history.get(team.id);
		const lastDate = sortedDates[sortedDates.length - 1];
		finalScores[team.id] = lastDate && scores ? (scores.get(lastDate) ?? 0) : 0;
	}

	const sortedByScore = [...teams].sort(
		(a, b) => (finalScores[b.id] ?? 0) - (finalScores[a.id] ?? 0)
	);
	const finalRanks: Record<string, number> = {};
	sortedByScore.forEach((t, i) => {
		finalRanks[t.id] = i + 1;
	});

	const series = sortedByScore.map((t) => ({
		teamId: t.id,
		data: sortedDates.map((d) => history.get(t.id)?.get(d) ?? 0)
	}));

	const snapshot: SeasonSnapshot = {
		finalScores,
		finalRanks,
		graphData: { dates: sortedDates, series },
		computedAt: serverTimestamp() as SeasonSnapshot['computedAt']
	};

	const ref = seasonSnapshotRef(leagueId, season);
	const existing = await getDoc(ref);
	if (!existing.exists()) {
		await setDoc(ref, {
			...snapshot,
			computedAt: serverTimestamp()
		});
		const written = await getDoc(ref);
		return written.data() as SeasonSnapshot;
	}
	return existing.data() as SeasonSnapshot;
}

export async function getSeasonSnapshotOrCompute(
	leagueId: string,
	season: string
): Promise<SeasonSnapshot> {
	const existing = await getSeasonSnapshot(leagueId, season);
	if (existing) return existing;
	return computeAndSaveSeasonSnapshot(leagueId, season);
}
