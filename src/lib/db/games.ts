import { collection, doc, getDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '$lib/firebase';
import type { Game, GameListEntry, GameHistoryDay } from './types';

/** Games metadata from lib/assets/games.json. Scores come from Firestore (meta/scores). */
interface GamesAsset {
	games: (Game & { id: string })[];
}

const gamesData: GamesAsset = ((await import('$lib/assets/games.json')) as { default: GamesAsset })
	.default;
const gamesById = new Map<string, Game & { id: string }>(gamesData.games.map((g) => [g.id, g]));

/* ------------------------------------------------------------------ */
/*  Scores from Firestore (cached)                                     */
/* ------------------------------------------------------------------ */

let scoresPromise: Promise<Record<string, number>> | null = null;

/** Fetches the scores summary from Firestore (meta/scores). Cached after first call. */
export function getScoresMap(): Promise<Record<string, number>> {
	if (!scoresPromise) {
		scoresPromise = getDoc(doc(db, 'meta', 'scores')).then((snap) =>
			snap.exists() ? ((snap.data().scores as Record<string, number>) ?? {}) : {}
		);
	}
	return scoresPromise;
}

/** Invalidate the cached scores so the next call re-fetches from Firestore. */
export function refreshScores(): void {
	scoresPromise = null;
}

/* ------------------------------------------------------------------ */
/*  Game accessors                                                     */
/* ------------------------------------------------------------------ */

export async function getGame(gameId: string): Promise<(Game & { id: string }) | null> {
	const g = gamesById.get(gameId) ?? null;
	if (!g) return null;
	const scores = await getScoresMap();
	return { ...g, id: gameId, score: scores[gameId] ?? null };
}

/** Returns available years derived from games.json (unique releaseDate years). */
export function getGameListYears(): Promise<number[]> {
	const years = [
		...new Set(
			gamesData.games
				.map((g) => g.releaseDate?.slice(0, 4))
				.filter((y): y is string => !!y && /^\d{4}$/.test(y))
				.map((y) => parseInt(y, 10))
		)
	].sort((a, b) => b - a);
	return Promise.resolve(years);
}

async function getFullGameListForYear(year: number): Promise<GameListEntry[]> {
	const yearStr = String(year);
	const scores = await getScoresMap();
	return gamesData.games
		.filter((g) => g.releaseDate?.startsWith(yearStr))
		.map(
			(g): GameListEntry => ({
				id: g.id,
				name: g.name,
				releaseDate: g.releaseDate ?? null,
				coverUrl: g.coverUrl ?? null,
				score: scores[g.id] ?? null
			})
		);
}

/** Games for a given year. Entries include coverUrl and Firestore score when available. */
export function getGameList(year: number): Promise<GameListEntry[]> {
	return getFullGameListForYear(year);
}

export type GameListSortBy = 'id' | 'name' | 'date' | 'score';
export type GameListOrder = 'asc' | 'desc';

/** Paginated games for a year. Optional search, sort, releaseFrom/releaseTo (YYYY-MM-DD), hideReleased. */
export async function getGameListPage(
	year: number,
	limit: number,
	offset: number,
	opts?: {
		search?: string;
		sortBy?: GameListSortBy;
		order?: GameListOrder;
		releaseFrom?: string;
		releaseTo?: string;
		hideReleased?: boolean;
	}
): Promise<{ games: GameListEntry[]; total: number }> {
	let full = await getFullGameListForYear(year);
	if (opts?.releaseFrom) {
		full = full.filter((g) => (g.releaseDate ?? '') >= opts.releaseFrom!);
	}
	if (opts?.releaseTo) {
		full = full.filter((g) => (g.releaseDate ?? '') <= opts.releaseTo!);
	}
	if (opts?.hideReleased) {
		const today = new Date().toISOString().split('T')[0];
		full = full.filter((g) => {
			const d = g.releaseDate ?? '';
			return !d || d > today;
		});
	}
	if (opts?.search?.trim()) {
		const q = opts.search.trim().toLowerCase();
		full = full.filter((g) => g.name.toLowerCase().includes(q));
	}
	const sortBy = opts?.sortBy ?? 'date';
	const order = opts?.order ?? 'asc';
	const mult = order === 'asc' ? 1 : -1;
	full = [...full].sort((a, b) => {
		let cmp = 0;
		if (sortBy === 'id') cmp = (a.id ?? '').localeCompare(b.id ?? '');
		else if (sortBy === 'name')
			cmp = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
		else if (sortBy === 'date') cmp = (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '');
		else {
			const sa = a.score ?? -Infinity;
			const sb = b.score ?? -Infinity;
			cmp = sa === sb ? 0 : sa < sb ? -1 : 1;
		}
		return cmp * mult;
	});
	const total = full.length;
	const games = full.slice(offset, offset + limit);
	return { games, total };
}

export function isGameHidden(gameId: string): Promise<boolean> {
	const g = gamesById.get(gameId);
	return Promise.resolve(g?.isHidden === true);
}

export async function getDraftableGames(opts?: {
	search?: string;
	genre?: string;
	releaseFrom?: string;
	releaseTo?: string;
	limitCount?: number;
}): Promise<(Game & { id: string })[]> {
	let list = gamesData.games.filter((g) => !g.isHidden);

	if (opts?.releaseFrom) {
		list = list.filter((g) => (g.releaseDate ?? '') >= opts.releaseFrom!);
	}
	if (opts?.releaseTo) {
		list = list.filter((g) => (g.releaseDate ?? '') <= opts.releaseTo!);
	}
	if (opts?.genre) {
		list = list.filter((g) => (g.genres ?? []).includes(opts.genre!));
	}
	if (opts?.search?.trim()) {
		const lower = opts.search.trim().toLowerCase();
		list = list.filter((g) => g.name.toLowerCase().includes(lower));
	}
	// Stable order by releaseDate
	list.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''));
	if (opts?.limitCount) {
		list = list.slice(0, opts.limitCount);
	}
	return list.map((g) => ({ ...g, id: g.id }));
}

/** Get game history from Firestore (daily points data) */
export async function getGameHistory(
	gameId: string
): Promise<Array<GameHistoryDay & { date: string }>> {
	const historyRef = collection(db, 'games', gameId, 'history');
	const q = query(historyRef, orderBy('date', 'asc'));
	const snap = await getDocs(q);
	return snap.docs.map((doc) => {
		const data = doc.data();
		return {
			owners: data.estimatedOwners ?? 0,
			ownersDelta: data.salesDelta ?? 0,
			ccu: data.ccu ?? 0,
			daysSinceRelease: data.daysSinceRelease ?? 0,
			dailyPoints: data.points ?? 0,
			date: data.date ?? doc.id
		} as GameHistoryDay & { date: string };
	});
}

/** Get upcoming games (releaseDate >= today) */
export function getUpcomingGames(): Promise<(Game & { id: string })[]> {
	const today = new Date().toISOString().split('T')[0];
	return Promise.resolve(
		gamesData.games
			.filter((g) => !g.isHidden && g.releaseDate && g.releaseDate >= today)
			.sort((a, b) => (a.releaseDate ?? '').localeCompare(b.releaseDate ?? ''))
			.map((g) => ({ ...g, id: g.id }))
	);
}
