import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	orderBy,
	limit
} from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { Game, GameListEntry } from './types';

const GAMES = 'games';
const GAME_LISTS = 'gameLists';
const HISTORY = 'history';

/** Game document id is IGDB id (string). */
export function gameRef(gameId: string) {
	return doc(db, GAMES, gameId);
}

export function gameHistoryRef(gameId: string, date: string) {
	return doc(db, GAMES, gameId, HISTORY, date);
}

export async function getGame(gameId: string): Promise<(Game & { id: string }) | null> {
	const snap = await getDoc(gameRef(gameId));
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as Game & { id: string };
}

/** One doc read for the full list of games in a year. Full details via getGame(id). */
export async function getGameList(year: number): Promise<GameListEntry[]> {
	const snap = await getDoc(doc(db, GAME_LISTS, String(year)));
	if (!snap.exists()) return [];
	const data = snap.data();
	const games = data?.games;
	return Array.isArray(games) ? games : [];
}

export async function isGameHidden(gameId: string): Promise<boolean> {
	const g = await getGame(gameId);
	return g?.isHidden === true;
}

export async function getDraftableGames(opts?: {
	search?: string;
	genre?: string;
	releaseFrom?: string;
	releaseTo?: string;
	limitCount?: number;
}): Promise<(Game & { id: string })[]> {
	let q = query(
		collection(db, GAMES),
		where('isHidden', '==', false),
		orderBy('releaseDate', 'asc')
	);
	if (opts?.releaseFrom) {
		q = query(q, where('releaseDate', '>=', opts.releaseFrom));
	}
	if (opts?.releaseTo) {
		q = query(q, where('releaseDate', '<=', opts.releaseTo));
	}
	if (opts?.genre) {
		q = query(q, where('genres', 'array-contains', opts.genre));
	}
	if (opts?.limitCount) {
		q = query(q, limit(opts.limitCount));
	}
	const snap = await getDocs(q);
	let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Game & { id: string }));
	// Filter out any with isHidden true (e.g. 999999) in case of legacy data
	list = list.filter((g) => !g.isHidden);
	if (opts?.search?.trim()) {
		const lower = opts.search.trim().toLowerCase();
		list = list.filter((g) => g.name.toLowerCase().includes(lower));
	}
	return list;
}
