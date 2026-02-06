import type { Game, GameListEntry } from './types';

/** Games data from lib/assets/games.json. Firestore is used only for game metrics/history (see update-scores.js). */
interface GamesAsset {
	games: (Game & { id: string })[];
}

const gamesData: GamesAsset = ((await import('$lib/assets/games.json')) as { default: GamesAsset })
	.default;
const gamesById = new Map<string, Game & { id: string }>(gamesData.games.map((g) => [g.id, g]));

/** Game document id is IGDB id (string). Firestore games collection is used only for metrics/history by update-scores.js. */
export function getGame(gameId: string): Promise<(Game & { id: string }) | null> {
	const g = gamesById.get(gameId) ?? null;
	return Promise.resolve(g ? { ...g, id: gameId } : null);
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

function getFullGameListForYear(year: number): GameListEntry[] {
	const yearStr = String(year);
	return gamesData.games
		.filter((g) => g.releaseDate?.startsWith(yearStr))
		.map(
			(g): GameListEntry => ({
				id: g.id,
				name: g.name,
				releaseDate: g.releaseDate ?? null,
				coverUrl: g.coverUrl ?? null,
				score: g.score ?? null
			})
		);
}

/** Games for a given year from games.json (filter by releaseDate). Entries include coverUrl when available. */
export function getGameList(year: number): Promise<GameListEntry[]> {
	return Promise.resolve(getFullGameListForYear(year));
}

export type GameListSortBy = 'id' | 'name' | 'date' | 'score';
export type GameListOrder = 'asc' | 'desc';

/** Paginated games for a year. Optional search, sort, and releaseFrom (YYYY-MM-DD; only games with releaseDate >= releaseFrom). */
export function getGameListPage(
	year: number,
	limit: number,
	offset: number,
	opts?: { search?: string; sortBy?: GameListSortBy; order?: GameListOrder; releaseFrom?: string }
): Promise<{ games: GameListEntry[]; total: number }> {
	let full = getFullGameListForYear(year);
	if (opts?.releaseFrom) {
		full = full.filter((g) => (g.releaseDate ?? '') >= opts.releaseFrom!);
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
			// score: treat null/undefined as -Infinity so they sort last
			const sa = a.score ?? -Infinity;
			const sb = b.score ?? -Infinity;
			cmp = sa === sb ? 0 : sa < sb ? -1 : 1;
		}
		return cmp * mult;
	});
	const total = full.length;
	const games = full.slice(offset, offset + limit);
	return Promise.resolve({ games, total });
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
