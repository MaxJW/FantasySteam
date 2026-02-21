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

/** Returns true if the draft for this phase/season can be started (last month of prev season OR during phase). */
export function isDraftWindowOpen(
	phase: DraftPhase,
	season: string,
	date: Date = new Date()
): boolean {
	const seasonYear = parseInt(season, 10);
	const month = date.getMonth();
	const year = date.getFullYear();
	const cfg = PHASE_CONFIG[phase];
	// Last month of previous season (winter: Dec of year-1; summer/fall: Apr/Aug of season year)
	const inDraftMonth =
		month === cfg.draftMonth &&
		(phase === 'winter' ? year === seasonYear - 1 : year === seasonYear);
	// During phase release window
	const [startMonth, endMonth] =
		phase === 'winter' ? [0, 3] : phase === 'summer' ? [4, 7] : [8, 11];
	const inReleaseWindow = month >= startMonth && month <= endMonth && year === seasonYear;
	return inDraftMonth || inReleaseWindow;
}

/** Returns the phase whose draft should be done next, based on draft window and completed phases. */
export function getEffectiveCurrentPhase(
	phaseStatuses: Record<DraftPhase, DraftStatus | null>,
	season: string,
	date: Date = new Date()
): DraftPhase | null {
	for (const phase of DRAFT_PHASES) {
		if (phaseStatuses[phase] !== 'completed' && isDraftWindowOpen(phase, season, date)) {
			return phase;
		}
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

/** Returns true if the season year is before the current calendar year (past season). */
export function isPastSeason(season: string): boolean {
	const seasonYear = parseInt(season, 10);
	const currentYear = new Date().getFullYear();
	return seasonYear < currentYear;
}

/** Returns December 31st of the given season year (YYYY-12-31). */
export function getSeasonEndDate(season: string): string {
	return `${season}-12-31`;
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

/** Frozen snapshot of final scores and ranks for a past season. */
export interface SeasonSnapshot {
	finalScores: Record<string, number>;
	finalRanks: Record<string, number>;
	graphData: {
		dates: string[];
		series: { teamId: string; data: number[] }[];
	};
	computedAt: Timestamp;
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
