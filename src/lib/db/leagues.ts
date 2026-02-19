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
import type { League, LeagueSettings, Team, TeamPicks, DraftPhase, DraftStatus } from './types';
import { DRAFT_PHASES, getDraftId, getNextPhase, getScoringGameIds } from './types';
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

export async function createLeague(
	commissionerId: string,
	name: string,
	code: string,
	settings: LeagueSettings,
	teamName: string = 'My Studio'
): Promise<string> {
	const ref = doc(collection(db, LEAGUES));
	const league: League = {
		name,
		code: code.trim().toUpperCase(),
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
	leagueId: string
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
			gameHistories.set(
				gameId,
				history.map((h) => ({
					date: h.date || '',
					points: h.dailyPoints
				}))
			);
		} catch {
			// Game may not have history yet
		}
	}

	const scoringSnap = await getDocs(collection(db, 'leagues', leagueId, 'scoring'));
	const storedBombAdj = new Map<string, Record<string, number>>();
	for (const scoringDoc of scoringSnap.docs) {
		const data = scoringDoc.data();
		if (data.bombAdjustments) {
			storedBombAdj.set(data.date ?? scoringDoc.id, data.bombAdjustments);
		}
	}

	const allDates = new Set<string>();
	gameHistories.forEach((history) => {
		history.forEach((h) => allDates.add(h.date));
	});
	const sortedDates = Array.from(allDates).sort();

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
