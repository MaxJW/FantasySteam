import type { Timestamp } from 'firebase/firestore';

export interface UserProfile {
	displayName: string;
	email: string;
	avatarUrl: string | null;
	createdAt: Timestamp;
}

export interface LeagueSettings {
	hypeMultiplier?: number;
	seasonalPicks: number;
	pickTimer?: number; // seconds; optional, no limit when omitted
}

export type LeagueStatus = 'draft' | 'active' | 'completed';

export interface League {
	name: string;
	code: string;
	commissionerId: string;
	settings: LeagueSettings;
	season: string;
	status: LeagueStatus;
	members: string[];
	createdAt?: Timestamp;
}

export type PickType = 'hitPick' | 'bustPick' | 'seasonalPick' | 'altPick';

export interface TeamPicks {
	hitPick?: string; // gameId
	bustPick?: string;
	seasonalPicks: string[];
	altPicks: string[];
}

export interface Team {
	name: string; // studio name
	picks: TeamPicks;
	score: number;
}

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
	order: string[]; // userIds in round 1 order
	currentPick: CurrentPick | null;
	picks: DraftPick[];
	presentUserIds?: string[];
	createdAt?: Timestamp;
}

export interface GameMetrics {
	owners: number;
	ccu: number;
	reviewScore?: number;
	lastFetched: Timestamp;
}

/** Minimal game info for the yearly list (one doc read). Full details via getGame(id). */
export interface GameListEntry {
	id: string;
	name: string;
	releaseDate: string | null;
}

export interface Game {
	name: string;
	coverUrl: string | null;
	releaseDate: string | null; // YYYY-MM-DD or ISO
	price?: string | null;
	genres: string[];
	/** Steam app id when available; null for games without Steam link. */
	steamAppId: string | null;
	igdbId?: number;
	isHidden: boolean;
	metrics?: GameMetrics;
	/** Short description/summary from IGDB */
	description?: string | null;
	/** Company names (e.g. developer, publisher) */
	companies?: string[];
}

export interface GameHistoryDay {
	owners: number;
	ownersDelta: number;
	ccu: number;
	daysSinceRelease: number;
	dailyPoints: number;
}
