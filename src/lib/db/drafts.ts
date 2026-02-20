import {
	getDoc,
	setDoc,
	updateDoc,
	arrayUnion,
	arrayRemove,
	serverTimestamp,
	Timestamp,
	onSnapshot,
	runTransaction
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import { draftRef, teamRef, getLeague, advancePhase } from './leagues';
import { isGameHidden } from './games';
import type { Draft, DraftPick, CurrentPick, DraftPhase } from './types';
import { getTotalRoundsForPhase, getPhasePicksKey, getSeasonalPicksForPlayerCount } from './types';

// -----------------------------------------------------------------------
// Pick type rules
// -----------------------------------------------------------------------

/**
 * Returns allowed pick types for a user based on their current pick count and the draft phase.
 *
 * Winter draft order: hitPick, bombPick, N x seasonalPick, altPick
 * Summer/Fall order:  N x seasonalPick, altPick
 */
export function getAllowedPickTypesForUser(
	picks: DraftPick[],
	userId: string,
	seasonalPicksCount: number,
	phase: DraftPhase
): DraftPick['pickType'][] {
	const myPicks = (picks ?? []).filter((p) => p.userId === userId);
	const count = myPicks.length;

	if (phase === 'winter') {
		if (count === 0) return ['hitPick', 'bombPick'];
		if (count === 1) return myPicks[0].pickType === 'hitPick' ? ['bombPick'] : ['hitPick'];
		if (count < 2 + seasonalPicksCount) return ['seasonalPick'];
		if (count === 2 + seasonalPicksCount) return ['altPick'];
		return [];
	}

	// Summer / Fall
	if (count < seasonalPicksCount) return ['seasonalPick'];
	if (count === seasonalPicksCount) return ['altPick'];
	return [];
}

// -----------------------------------------------------------------------
// Read helpers
// -----------------------------------------------------------------------

export async function getDraft(
	leagueId: string,
	draftId: string
): Promise<(Draft & { id: string }) | null> {
	const snap = await getDoc(draftRef(leagueId, draftId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as Draft & { id: string };
}

export function subscribeDraft(
	leagueId: string,
	draftId: string,
	onUpdate: (draft: (Draft & { id: string }) | null) => void,
	onError?: (err: Error) => void
): () => void {
	return onSnapshot(
		draftRef(leagueId, draftId),
		(snap) => {
			if (!snap.exists()) {
				onUpdate(null);
				return;
			}
			onUpdate({ id: snap.id, ...snap.data() } as Draft & { id: string });
		},
		(err) => {
			onError?.(err);
		}
	);
}

// -----------------------------------------------------------------------
// Snake draft helpers
// -----------------------------------------------------------------------

export function getSnakeOrderForRound(order: string[], round: number): string[] {
	const rev = round % 2 === 0;
	return rev ? [...order].reverse() : order;
}

export function getCurrentPickUserId(draft: Draft): string | null {
	const cp = draft.currentPick;
	if (!cp) return null;
	const order = getSnakeOrderForRound(draft.order, cp.round);
	return order[cp.position] ?? null;
}

// -----------------------------------------------------------------------
// Presence
// -----------------------------------------------------------------------

export async function setPresence(
	leagueId: string,
	draftId: string,
	userId: string
): Promise<void> {
	await updateDoc(draftRef(leagueId, draftId), { presentUserIds: arrayUnion(userId) });
}

export async function removePresence(
	leagueId: string,
	draftId: string,
	userId: string
): Promise<void> {
	await updateDoc(draftRef(leagueId, draftId), { presentUserIds: arrayRemove(userId) });
}

// -----------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------

export async function createDraft(
	leagueId: string,
	draftId: string,
	phase: DraftPhase,
	order: string[]
): Promise<void> {
	await setDoc(draftRef(leagueId, draftId), {
		status: 'pending',
		phase,
		order,
		currentPick: null,
		picks: [],
		presentUserIds: [],
		createdAt: serverTimestamp()
	});
}

export async function startDraft(leagueId: string, draftId: string): Promise<void> {
	const ref = draftRef(leagueId, draftId);
	const snap = await getDoc(ref);
	if (!snap.exists()) throw new Error('Draft not found');
	const data = snap.data() as Draft;

	const currentPick: CurrentPick = {
		round: 1,
		position: 0,
		userId: data.order[0] ?? '',
		expiresAt: null
	};

	await updateDoc(ref, { status: 'active', currentPick });
}

// -----------------------------------------------------------------------
// Pick calculation
// -----------------------------------------------------------------------

function calculateNextPick(
	order: string[],
	totalPicksMade: number,
	phase: DraftPhase,
	seasonalPicksCount: number
): CurrentPick | null {
	const totalRounds = getTotalRoundsForPhase(phase, seasonalPicksCount);
	const totalSlots = totalRounds * order.length;

	if (totalPicksMade >= totalSlots) return null;

	const nextRound = Math.floor(totalPicksMade / order.length) + 1;
	const nextPos = totalPicksMade % order.length;
	const snakeOrder = getSnakeOrderForRound(order, nextRound);
	const nextUserId = snakeOrder[nextPos];

	if (!nextUserId) return null;

	return {
		round: nextRound,
		position: nextPos,
		userId: nextUserId,
		expiresAt: null
	};
}

// -----------------------------------------------------------------------
// Submit pick
// -----------------------------------------------------------------------

export async function submitPick(
	leagueId: string,
	draftId: string,
	userId: string,
	gameId: string,
	pickType: DraftPick['pickType']
): Promise<void> {
	const dRef = draftRef(leagueId, draftId);
	const tRef = teamRef(leagueId, userId);

	const league = await getLeague(leagueId);
	if (!league) throw new Error('League not found');
	const seasonalPicksCount = getSeasonalPicksForPlayerCount(league.members.length);

	await runTransaction(db, async (tx) => {
		const draftSnap = await tx.get(dRef);
		const teamSnap = await tx.get(tRef);

		if (!draftSnap.exists()) throw new Error('Draft does not exist');
		const draft = draftSnap.data() as Draft;
		const phase = draft.phase;

		// Validate turn
		const currentUserId = getCurrentPickUserId(draft);
		if (currentUserId !== userId) {
			throw new Error(`It is not your turn. Waiting for ${currentUserId}.`);
		}

		// Validate game not already taken
		if (draft.picks.some((p) => p.gameId === gameId)) {
			throw new Error('This game has already been drafted.');
		}

		// Validate pick type
		const allowedTypes = getAllowedPickTypesForUser(draft.picks, userId, seasonalPicksCount, phase);
		if (!allowedTypes.includes(pickType)) {
			throw new Error(`You cannot make a ${pickType} right now.`);
		}

		// Record the pick on the draft document
		const newPick: DraftPick = {
			userId,
			gameId,
			pickType,
			timestamp: Timestamp.now()
		};
		tx.update(dRef, { picks: arrayUnion(newPick) });

		// Record the pick on the team document
		if (teamSnap.exists()) {
			const teamData = teamSnap.data();
			const teamPicks = teamData.picks ?? {};

			if (pickType === 'hitPick') {
				tx.update(tRef, { 'picks.hitPick': gameId });
			} else if (pickType === 'bombPick') {
				tx.update(tRef, { 'picks.bombPick': gameId });
			} else if (pickType === 'seasonalPick') {
				const key = getPhasePicksKey(phase);
				const arr = [...(teamPicks[key] ?? []), gameId];
				tx.update(tRef, { [`picks.${key}`]: arr });
			} else if (pickType === 'altPick') {
				const arr = [...(teamPicks.altPicks ?? []), gameId];
				tx.update(tRef, { 'picks.altPicks': arr });
			}
		}

		// Advance turn
		const nextPick = calculateNextPick(
			draft.order,
			draft.picks.length + 1,
			phase,
			seasonalPicksCount
		);

		if (nextPick) {
			tx.update(dRef, { currentPick: nextPick });
		} else {
			tx.update(dRef, { currentPick: null, status: 'completed' });
		}
	});

	// Check if draft just completed and advance the league phase
	const updatedDraft = await getDraft(leagueId, draftId);
	if (updatedDraft?.status === 'completed') {
		await advancePhase(leagueId);
	}
}

// -----------------------------------------------------------------------
// Admin: skip
// -----------------------------------------------------------------------

export async function skipCurrentPick(leagueId: string, draftId: string): Promise<void> {
	const dRef = draftRef(leagueId, draftId);
	const league = await getLeague(leagueId);
	const seasonalPicksCount = getSeasonalPicksForPlayerCount(league?.members?.length ?? 2);

	await runTransaction(db, async (tx) => {
		const draftSnap = await tx.get(dRef);
		if (!draftSnap.exists()) return;

		const draft = draftSnap.data() as Draft;
		if (draft.status !== 'active' || !draft.currentPick) return;

		const currentFlatIndex =
			(draft.currentPick.round - 1) * draft.order.length + draft.currentPick.position;

		const nextPick = calculateNextPick(
			draft.order,
			currentFlatIndex + 1,
			draft.phase,
			seasonalPicksCount
		);

		if (nextPick) {
			tx.update(dRef, { currentPick: nextPick });
		} else {
			tx.update(dRef, { currentPick: null, status: 'completed' });
		}
	});
}
