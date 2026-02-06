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
import { draftRef, teamRef, getLeague } from './leagues';
import { getGame, isGameHidden } from './games';
import type { Draft, DraftPick, CurrentPick } from './types';

/** Allowed pick types for a user based on their current pick count. */
export function getAllowedPickTypesForUser(
	picks: DraftPick[],
	userId: string,
	seasonalPicksCount: number
): DraftPick['pickType'][] {
	const myPicks = (picks ?? []).filter((p) => p.userId === userId);
	const count = myPicks.length;
	if (count === 0) return ['hitPick', 'bustPick'];
	if (count === 1) return myPicks[0].pickType === 'hitPick' ? ['bustPick'] : ['hitPick'];
	if (count <= 1 + seasonalPicksCount) return ['seasonalPick'];
	if (count === 2 + seasonalPicksCount) return ['altPick'];
	return [];
}

export async function getDraft(
	leagueId: string,
	season: string
): Promise<(Draft & { id: string }) | null> {
	const snap = await getDoc(draftRef(leagueId, season));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as Draft & { id: string };
}

export function subscribeDraft(
	leagueId: string,
	season: string,
	onUpdate: (draft: (Draft & { id: string }) | null) => void
): () => void {
	return onSnapshot(draftRef(leagueId, season), (snap) => {
		if (!snap.exists()) {
			onUpdate(null);
			return;
		}
		onUpdate({ id: snap.id, ...snap.data() } as Draft & { id: string });
	});
}

export function getSnakeOrderForRound(order: string[], round: number): string[] {
	// Round 1: normal. Round 2: reversed. Round 3: normal.
	const rev = round % 2 === 0;
	return rev ? [...order].reverse() : order;
}

export function getCurrentPickUserId(draft: Draft): string | null {
	const cp = draft.currentPick;
	if (!cp) return null;
	const order = getSnakeOrderForRound(draft.order, cp.round);
	return order[cp.position] ?? null;
}

export async function setPresence(leagueId: string, season: string, userId: string): Promise<void> {
	const ref = draftRef(leagueId, season);
	// Using arrayUnion is safe to call repeatedly
	await updateDoc(ref, { presentUserIds: arrayUnion(userId) });
}

export async function removePresence(
	leagueId: string,
	season: string,
	userId: string
): Promise<void> {
	const ref = draftRef(leagueId, season);
	await updateDoc(ref, { presentUserIds: arrayRemove(userId) });
}

export async function createDraft(
	leagueId: string,
	season: string,
	order: string[]
): Promise<void> {
	await setDoc(draftRef(leagueId, season), {
		status: 'pending',
		order,
		currentPick: null,
		picks: [],
		presentUserIds: [],
		createdAt: serverTimestamp()
	});
}

export async function startDraft(leagueId: string, season: string): Promise<void> {
	const ref = draftRef(leagueId, season);
	const snap = await getDoc(ref);
	if (!snap.exists()) throw new Error('Draft not found');
	const data = snap.data() as Draft;

	const currentPick: CurrentPick = {
		round: 1,
		position: 0,
		userId: data.order[0] ?? '',
		expiresAt: null
	};

	await updateDoc(ref, {
		status: 'active',
		currentPick
	});
}

/**
 * Calculates the next pick state based on the number of picks made.
 */
function calculateNextPick(
	order: string[],
	totalPicksMade: number,
	seasonalPicksCount: number
): CurrentPick | null {
	const totalRounds = 3 + seasonalPicksCount; // Hit, Bomb, N seasonal, Alt
	const totalSlots = totalRounds * order.length;

	if (totalPicksMade >= totalSlots) {
		return null; // Draft complete
	}

	const nextPickIndex = totalPicksMade; // 0-based index of the next slot
	const nextRound = Math.floor(nextPickIndex / order.length) + 1;
	const nextPos = nextPickIndex % order.length;

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

/** * Atomically submits a pick and advances the draft to the next turn.
 */
export async function submitPick(
	leagueId: string,
	season: string,
	userId: string,
	gameId: string,
	pickType: DraftPick['pickType']
): Promise<void> {
	const dRef = draftRef(leagueId, season);
	const tRef = teamRef(leagueId, userId);

	// Pre-fetch league for settings (could also be passed in to save a read if static)
	const league = await getLeague(leagueId);
	if (!league) throw new Error('League not found');
	const seasonalPicksCount = league.settings?.seasonalPicks ?? 6;

	await runTransaction(db, async (tx) => {
		// 1. READS
		const draftSnap = await tx.get(dRef);
		const teamSnap = await tx.get(tRef);

		if (!draftSnap.exists()) throw new Error('Draft does not exist');
		const draft = draftSnap.data() as Draft;

		// 2. VALIDATIONS
		// Check turn
		const currentUserId = getCurrentPickUserId(draft);
		if (currentUserId !== userId) {
			throw new Error(`It is not your turn. Waiting for ${currentUserId}.`);
		}

		// Check if game already taken
		if (draft.picks.some((p) => p.gameId === gameId)) {
			throw new Error('This game has already been drafted.');
		}

		// Check pick type limits
		const allowedTypes = getAllowedPickTypesForUser(draft.picks, userId, seasonalPicksCount);
		if (!allowedTypes.includes(pickType)) {
			throw new Error(`You cannot make a ${pickType} right now.`);
		}

		// 3. UPDATES
		const newPick: DraftPick = {
			userId,
			gameId,
			pickType,
			timestamp: Timestamp.now()
		};

		// Add pick to draft
		tx.update(dRef, {
			picks: arrayUnion(newPick)
		});

		// Add pick to team structure
		if (teamSnap.exists()) {
			const teamData = teamSnap.data();
			const teamPicks = teamData.picks ?? {};

			if (pickType === 'hitPick') {
				tx.update(tRef, { 'picks.hitPick': gameId });
			} else if (pickType === 'bustPick') {
				tx.update(tRef, { 'picks.bustPick': gameId });
			} else if (pickType === 'seasonalPick') {
				const arr = [...(teamPicks.seasonalPicks ?? []), gameId];
				tx.update(tRef, { 'picks.seasonalPicks': arr });
			} else if (pickType === 'altPick') {
				const arr = [...(teamPicks.altPicks ?? []), gameId];
				tx.update(tRef, { 'picks.altPicks': arr });
			}
		}

		// 4. ADVANCE TURN
		// We have 'draft.picks.length' existing picks. We are adding 1.
		const nextPick = calculateNextPick(draft.order, draft.picks.length + 1, seasonalPicksCount);

		if (nextPick) {
			tx.update(dRef, { currentPick: nextPick });
		} else {
			tx.update(dRef, {
				currentPick: null,
				status: 'completed'
			});
		}
	});
}

/**
 * Admin function to force skip the current player.
 */
export async function skipCurrentPick(leagueId: string, season: string): Promise<void> {
	const dRef = draftRef(leagueId, season);
	const league = await getLeague(leagueId);
	const seasonalPicksCount = league?.settings?.seasonalPicks ?? 6;

	await runTransaction(db, async (tx) => {
		const draftSnap = await tx.get(dRef);
		if (!draftSnap.exists()) return;

		const draft = draftSnap.data() as Draft;
		if (draft.status !== 'active' || !draft.currentPick) return;

		// Calculate "virtual" next pick as if the current slot was filled
		// We use currentPick logic to determine where we are, then move forward
		// Current: draft.currentPick (Round R, Pos P)
		// Flat index = (R-1)*OrderLength + P

		const currentFlatIndex =
			(draft.currentPick.round - 1) * draft.order.length + draft.currentPick.position;
		const nextFlatIndex = currentFlatIndex + 1;

		const nextPick = calculateNextPick(draft.order, nextFlatIndex, seasonalPicksCount);

		if (nextPick) {
			tx.update(dRef, { currentPick: nextPick });
		} else {
			tx.update(dRef, { currentPick: null, status: 'completed' });
		}
	});
}
