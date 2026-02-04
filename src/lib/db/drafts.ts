import {
	getDoc,
	setDoc,
	updateDoc,
	arrayUnion,
	arrayRemove,
	serverTimestamp,
	Timestamp,
	onSnapshot
} from 'firebase/firestore';
import { draftRef, teamRef } from './leagues';
import { isGameHidden } from './games';
import type { Draft, DraftPick, CurrentPick } from './types';

export async function getDraft(leagueId: string, season: string): Promise<(Draft & { id: string }) | null> {
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
	// Round 1: normal order (A, B). Round 2: snake reversed (B, A). Round 3: normal again.
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
	const snap = await getDoc(ref);
	if (!snap.exists()) return;
	const data = snap.data() as Draft;
	const present = data.presentUserIds ?? [];
	if (present.includes(userId)) {
		// refresh lastSeen could be a subcollection; for simplicity we keep presentUserIds and refresh on heartbeat
		return;
	}
	await updateDoc(ref, {
		presentUserIds: arrayUnion(userId)
	});
}

export async function removePresence(
	leagueId: string,
	season: string,
	userId: string
): Promise<void> {
	const ref = draftRef(leagueId, season);
	await updateDoc(ref, { presentUserIds: arrayRemove(userId) });
}

export async function createDraft(leagueId: string, season: string, order: string[]): Promise<void> {
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

export async function advanceToNextPick(
	leagueId: string,
	season: string,
	options?: { skipCurrent?: boolean }
): Promise<void> {
	const ref = draftRef(leagueId, season);
	const snap = await getDoc(ref);
	if (!snap.exists()) return;
	const data = snap.data() as Draft;
	const order = data.order;

	let nextRound: number;
	let nextPos: number;

	if (options?.skipCurrent && data.currentPick) {
		// Force Skip: advance from current slot without adding a pick
		nextPos = data.currentPick.position + 1;
		nextRound = data.currentPick.round;
		if (nextPos >= order.length) {
			nextRound += 1;
			nextPos = 0;
		}
	} else {
		// After a pick: next slot = number of picks already made (robust, no reliance on currentPick)
		const nextPickIndex = data.picks?.length ?? 0;
		nextRound = Math.floor(nextPickIndex / order.length) + 1;
		nextPos = nextPickIndex % order.length;
	}

	const snakeOrder = getSnakeOrderForRound(order, nextRound);
	const nextUserId = snakeOrder[nextPos] ?? null;

	if (nextUserId === null) {
		await updateDoc(ref, { status: 'completed', currentPick: null });
		return;
	}

	await updateDoc(ref, {
		currentPick: {
			round: nextRound,
			position: nextPos,
			userId: nextUserId,
			expiresAt: null
		}
	});
}

export async function submitPick(
	leagueId: string,
	season: string,
	userId: string,
	gameId: string,
	pickType: DraftPick['pickType']
): Promise<void> {
	const ref = draftRef(leagueId, season);
	const snap = await getDoc(ref);
	if (!snap.exists()) throw new Error('Draft not found');
	const data = snap.data() as Draft;
	const cp = data.currentPick;
	if (!cp || cp.userId !== userId) throw new Error('Not your turn');
	if (await isGameHidden(gameId)) throw new Error('That game is not available for draft');

	// serverTimestamp() cannot be used inside arrayUnion(); use client Timestamp instead
	const pick: DraftPick = {
		userId,
		gameId,
		pickType,
		timestamp: Timestamp.now()
	};
	await updateDoc(ref, {
		picks: arrayUnion(pick)
	});

	const teamRefInstance = teamRef(leagueId, userId);
	const teamSnap = await getDoc(teamRefInstance);
	if (!teamSnap.exists()) return;
	const team = teamSnap.data();
	const picks = team?.picks ?? { seasonalPicks: [], altPicks: [] };
	if (pickType === 'hitPick') {
		await updateDoc(teamRefInstance, { 'picks.hitPick': gameId });
	} else if (pickType === 'bustPick') {
		await updateDoc(teamRefInstance, { 'picks.bustPick': gameId });
	} else if (pickType === 'seasonalPick') {
		const arr = [...(picks.seasonalPicks ?? []), gameId];
		await updateDoc(teamRefInstance, { 'picks.seasonalPicks': arr });
	} else if (pickType === 'altPick') {
		const arr = [...(picks.altPicks ?? []), gameId];
		await updateDoc(teamRefInstance, { 'picks.altPicks': arr });
	}
}

export async function setDraftOrder(leagueId: string, season: string, order: string[]): Promise<void> {
	await updateDoc(draftRef(leagueId, season), { order });
}
