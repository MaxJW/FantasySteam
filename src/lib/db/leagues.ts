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
import type { League, LeagueSettings, Team, TeamPicks } from './types';

const LEAGUES = 'leagues';
const TEAMS = 'teams';
const DRAFTS = 'drafts';

export function leagueRef(leagueId: string): DocumentReference {
	return doc(db, LEAGUES, leagueId);
}

export function teamRef(leagueId: string, userId: string): DocumentReference {
	return doc(db, LEAGUES, leagueId, TEAMS, userId);
}

export function draftRef(leagueId: string, season: string): DocumentReference {
	return doc(db, LEAGUES, leagueId, DRAFTS, season);
}

export async function getLeague(leagueId: string): Promise<(League & { id: string }) | null> {
	const snap = await getDoc(leagueRef(leagueId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as League & { id: string };
}

export async function getLeagueByCode(code: string): Promise<(League & { id: string }) | null> {
	const q = query(collection(db, LEAGUES), where('code', '==', code.trim().toUpperCase()));
	const snap = await getDocs(q);
	if (snap.empty) return null;
	const doc = snap.docs[0];
	return { id: doc.id, ...doc.data() } as League & { id: string };
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
	return snap.docs
		.map((d) => ({ id: d.id, ...d.data() }) as Team & { id: string })
		.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
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
		season: new Date().getFullYear().toString(),
		status: 'draft',
		members: [commissionerId],
		createdAt: serverTimestamp() as League['createdAt']
	};
	await setDoc(ref, league);

	const emptyPicks: TeamPicks = {
		seasonalPicks: [],
		altPicks: []
	};
	await setDoc(teamRef(ref.id, commissionerId), {
		name: teamName.trim() || 'My Studio',
		picks: emptyPicks,
		score: 0
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

	// Update league first so Firestore rules see the user as a member when we create the team.
	// (In a batch, each op is evaluated against pre-batch state, so a single batch would deny the team create.)
	await updateDoc(leagueRef(leagueId), {
		members: [...league.members, userId]
	});

	const emptyPicks: TeamPicks = {
		seasonalPicks: [],
		altPicks: []
	};
	await setDoc(teamRef(leagueId, userId), {
		name: teamName.trim() || 'My Studio',
		picks: emptyPicks,
		score: 0
	});
}

export async function updateLeagueSettings(
	leagueId: string,
	settings: Partial<LeagueSettings>
): Promise<void> {
	const updates: Record<string, unknown> = {};
	if (settings.seasonalPicks !== undefined)
		updates['settings.seasonalPicks'] = settings.seasonalPicks;
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

export async function deleteLeague(leagueId: string): Promise<void> {
	await deleteDoc(leagueRef(leagueId));
}
