import type { Timestamp } from 'firebase/firestore';

// -----------------------------------------------------------------------
// User
// -----------------------------------------------------------------------

export interface UserProfile {
	displayName: string;
	email: string;
	avatarUrl: string | null;
	createdAt: Timestamp;
}

// -----------------------------------------------------------------------
// Draft Phases & Season
// -----------------------------------------------------------------------

export type DraftPhase = 'winter' | 'summer' | 'fall';

export const DRAFT_PHASES: DraftPhase[] = ['winter', 'summer', 'fall'];

export const PHASE_CONFIG: Record<
	DraftPhase,
	{
		label: string;
		releaseStart: (year: number) => string;
		releaseEnd: (year: number) => string;
		draftMonth: number;
	}
> = {
	winter: {
		label: 'Winter',
		releaseStart: (year) => `${year}-01-01`,
		releaseEnd: (year) => `${year}-04-30`,
		draftMonth: 11 // December (of previous year)
	},
	summer: {
		label: 'Summer',
		releaseStart: (year) => `${year}-05-01`,
		releaseEnd: (year) => `${year}-08-31`,
		draftMonth: 3 // April
	},
	fall: {
		label: 'Fall',
		releaseStart: (year) => `${year}-09-01`,
		releaseEnd: (year) => `${year}-12-31`,
		draftMonth: 7 // August
	}
};

export function getDraftId(phase: DraftPhase, season: string): string {
	return `${phase}-${season}`;
}

export function parseDraftId(draftId: string): { phase: DraftPhase; season: string } | null {
	const match = draftId.match(/^(winter|summer|fall)-(\d{4})$/);
	if (!match) return null;
	return { phase: match[1] as DraftPhase, season: match[2] };
}

export function getNextPhase(phase: DraftPhase): DraftPhase | null {
	const idx = DRAFT_PHASES.indexOf(phase);
	return idx < DRAFT_PHASES.length - 1 ? DRAFT_PHASES[idx + 1] : null;
}

/** Maps calendar month to phase based on release windows. Jan-Apr=winter, May-Aug=summer, Sep-Dec=fall. */
export function getPhaseForDate(date: Date): DraftPhase {
	const month = date.getMonth(); // 0-11
	if (month <= 3) return 'winter';
	if (month <= 7) return 'summer';
	return 'fall';
}

/** Returns the phase whose draft should be done next, based on current date and completed phases. */
export function getEffectiveCurrentPhase(
	phaseStatuses: Record<DraftPhase, DraftStatus | null>
): DraftPhase | null {
	let phase: DraftPhase | null = getPhaseForDate(new Date());
	while (phase) {
		if (phaseStatuses[phase] !== 'completed') return phase;
		phase = getNextPhase(phase);
	}
	return null;
}

export function getPhaseReleaseDateRange(
	phase: DraftPhase,
	year: number
): { start: string; end: string } {
	const cfg = PHASE_CONFIG[phase];
	return { start: cfg.releaseStart(year), end: cfg.releaseEnd(year) };
}

/**
 * Total rounds in a single draft for the given phase.
 * Winter: hit + bomb + N seasonal + alt = N + 3
 * Summer/Fall: N seasonal + alt = N + 1
 */
export function getTotalRoundsForPhase(phase: DraftPhase, seasonalPicksCount: number): number {
	return phase === 'winter' ? seasonalPicksCount + 3 : seasonalPicksCount + 1;
}

/**
 * Returns the expected pick type for a given round number within a phase.
 * Rounds are 1-indexed.
 */
export function getPickTypeForRound(
	phase: DraftPhase,
	round: number,
	seasonalPicksCount: number
): PickType {
	if (phase === 'winter') {
		if (round === 1) return 'hitPick';
		if (round === 2) return 'bombPick';
		if (round <= 2 + seasonalPicksCount) return 'seasonalPick';
		return 'altPick';
	}
	if (round <= seasonalPicksCount) return 'seasonalPick';
	return 'altPick';
}

// -----------------------------------------------------------------------
// League
// -----------------------------------------------------------------------

/** Seasonal picks per phase by player count. Not configurable. */
const SEASONAL_PICKS_BY_PLAYER_COUNT: Record<number, number> = {
	2: 8,
	3: 6,
	4: 4,
	5: 3,
	6: 2,
	7: 2,
	8: 2
};

export function getSeasonalPicksForPlayerCount(numPlayers: number): number {
	return SEASONAL_PICKS_BY_PLAYER_COUNT[numPlayers] ?? 2;
}

export interface LeagueSettings {
	// Reserved for future settings. Seasonal picks are derived from player count.
}

export type LeagueStatus = 'draft' | 'active' | 'completed';

export interface League {
	name: string;
	code: string;
	commissionerId: string;
	settings: LeagueSettings;
	season: string;
	status: LeagueStatus;
	currentPhase: DraftPhase;
	members: string[];
	/** Game IDs that have been delisted from Steam (alt picks replace these). */
	delistedGames?: string[];
	createdAt?: Timestamp;
}

// -----------------------------------------------------------------------
// Picks & Teams
// -----------------------------------------------------------------------

export type PickType = 'hitPick' | 'bombPick' | 'seasonalPick' | 'altPick';

export interface TeamPicks {
	hitPick?: string;
	bombPick?: string;
	winterPicks: string[];
	summerPicks: string[];
	fallPicks: string[];
	altPicks: string[];
}

/** Returns the Firestore field key for phase-specific seasonal picks. */
export function getPhasePicksKey(phase: DraftPhase): keyof TeamPicks {
	return `${phase}Picks`;
}

/** Combines all seasonal picks from every phase into a single array. */
export function getAllSeasonalGameIds(picks: TeamPicks): string[] {
	return [...(picks.winterPicks ?? []), ...(picks.summerPicks ?? []), ...(picks.fallPicks ?? [])];
}

/** Returns every game ID associated with a team (for score computation, graph, etc.). */
export function getAllPickedGameIds(picks: TeamPicks): string[] {
	const ids: string[] = [];
	if (picks.hitPick) ids.push(picks.hitPick);
	if (picks.bombPick) ids.push(picks.bombPick);
	ids.push(...getAllSeasonalGameIds(picks));
	ids.push(...(picks.altPicks ?? []));
	return ids;
}

/**
 * Returns game IDs that actively contribute to the team's score.
 * Excludes bomb pick (only damages others) and inactive alt picks.
 */
export function getScoringGameIds(picks: TeamPicks, delistedGames: string[] = []): string[] {
	const delistedSet = new Set(delistedGames);
	const ids: string[] = [];

	if (picks.hitPick) ids.push(picks.hitPick);

	const phaseKeys: (keyof TeamPicks)[] = ['winterPicks', 'summerPicks', 'fallPicks'];
	let altIdx = 0;

	for (const key of phaseKeys) {
		const phaseGames = (picks[key] as string[]) ?? [];
		for (const gid of phaseGames) {
			if (delistedSet.has(gid)) {
				const alt = (picks.altPicks ?? [])[altIdx];
				if (alt) ids.push(alt);
				altIdx++;
			} else {
				ids.push(gid);
			}
		}
	}

	return ids;
}

export interface Team {
	name: string;
	picks: TeamPicks;
	score: number;
	/** Cumulative bomb damage received from other players' bomb picks (negative). */
	bombAdjustment?: number;
}

// -----------------------------------------------------------------------
// Draft
// -----------------------------------------------------------------------

export interface DraftPick {
	userId: string;
	gameId: string;
	pickType: PickType;
	timestamp: Timestamp;
}

export interface CurrentPick {
	round: number;
	position: number;
	userId: string;
	expiresAt: Timestamp | null;
}

export type DraftStatus = 'pending' | 'active' | 'completed';

export interface Draft {
	status: DraftStatus;
	phase: DraftPhase;
	order: string[];
	currentPick: CurrentPick | null;
	picks: DraftPick[];
	presentUserIds?: string[];
	createdAt?: Timestamp;
}

// -----------------------------------------------------------------------
// Games
// -----------------------------------------------------------------------

export interface GameMetrics {
	owners: number;
	ccu: number;
	reviewScore?: number;
	lastFetched: Timestamp;
}

export interface GameListEntry {
	id: string;
	name: string;
	releaseDate: string | null;
	coverUrl?: string | null;
	score?: number | null;
}

export interface Game {
	name: string;
	coverUrl: string | null;
	releaseDate: string | null;
	price?: string | null;
	genres: string[];
	steamAppId: string | null;
	igdbId?: number;
	isHidden: boolean;
	score?: number | null;
	metrics?: GameMetrics;
	description?: string | null;
	companies?: string[];
	delistedFromSteam?: boolean;
}

export interface GameHistoryDay {
	owners: number;
	ownersDelta: number;
	ccu: number;
	daysSinceRelease: number;
	dailyPoints: number;
	basePoints?: number;
	milestoneBonus?: number;
	breakoutBonus?: number;
}
