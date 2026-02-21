<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { getCurrentUser } from '$lib/auth';
	import {
		getLeague,
		getTeams,
		getGame,
		getUpcomingGames,
		getTeamScoresHistory,
		getSeasonSnapshotOrCompute,
		getDraftPhaseStatuses,
		syncLeagueCurrentPhase,
		updateLeagueSettings,
		deleteLeague,
		getUserProfile,
		getBookmarkedGameIds,
		addBookmark,
		removeBookmark
	} from '$lib/db';
	import type { Team, Game, DraftPhase, DraftStatus, SeasonSnapshot } from '$lib/db';
	import {
		DRAFT_PHASES,
		PHASE_CONFIG,
		getDraftId,
		getScoringGameIds,
		getSeasonalPicksForPlayerCount,
		isDraftWindowOpen,
		isPastSeason
	} from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Avatar from '$lib/components/ui/avatar';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { GameDetailDialog } from '$lib/components/game-detail-dialog';
	import Settings from '@lucide/svelte/icons/settings';
	import Play from '@lucide/svelte/icons/play';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Target from '@lucide/svelte/icons/target';
	import Bomb from '@lucide/svelte/icons/bomb';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import Circle from '@lucide/svelte/icons/circle';
	import Loader from '@lucide/svelte/icons/loader';
	import Timer from '@lucide/svelte/icons/timer';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Trophy from '@lucide/svelte/icons/trophy';

	let league = $state<Awaited<ReturnType<typeof getLeague>>>(null);
	let teams = $state<(Team & { id: string })[]>([]);
	let games = $state<Record<string, Game & { id: string }>>({});
	let userProfiles = $state<Record<string, { displayName: string; avatarUrl: string | null }>>({});
	let loading = $state(true);
	let leagueId = $state<string | undefined>(undefined);
	let settingsOpen = $state(false);
	let savingSettings = $state(false);
	let settingsJustSaved = $state(false);
	let deleteDialogOpen = $state(false);
	let deleting = $state(false);
	let expandedTeams = $state<Set<string>>(new Set());
	let teamScoresHistory = $state<Map<string, Map<string, number>>>(new Map());
	let upcomingGames = $state<(Game & { id: string })[]>([]);
	let loadingHistory = $state(false);
	let gameModalOpen = $state(false);
	let selectedGameId = $state<string | null>(null);
	let detailGame = $state<(Game & { id: string }) | null>(null);
	let detailLoading = $state(false);
	let hoveredDateIdx = $state<number | null>(null);
	let phaseStatuses = $state<Record<DraftPhase, DraftStatus | null>>({
		winter: null,
		summer: null,
		fall: null
	});
	let phaseStatusesLoaded = $state(false);
	let seasonSnapshot = $state<SeasonSnapshot | null>(null);
	let loadError = $state<string | null>(null);
	let bookmarkedIds = $state<Set<string>>(new Set());

	const me = $derived(getCurrentUser());

	async function retryLeagueLoad() {
		if (!leagueId) return;
		loadError = null;
		loading = true;
		try {
			const l = await getLeague(leagueId);
			league = l;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Load failed';
		} finally {
			loading = false;
		}
	}

	async function openGameDetail(gameId: string) {
		selectedGameId = gameId;
		gameModalOpen = true;
		detailGame = null;
		detailLoading = true;
		try {
			const game = await getGame(gameId);
			detailGame = game ? { ...game, id: gameId } : null;
		} finally {
			detailLoading = false;
		}
	}

	function closeGameModal() {
		gameModalOpen = false;
		selectedGameId = null;
		detailGame = null;
	}

	async function handleToggleBookmark() {
		if (!me || !selectedGameId) {
			console.log('handleToggleBookmark: not me or selectedGameId');
			console.log('me', me);
			console.log('selectedGameId', selectedGameId);
			return;
		}
		const wasBookmarked = bookmarkedIds.has(selectedGameId);
		if (wasBookmarked) {
			await removeBookmark(me.uid, selectedGameId);
			bookmarkedIds = new Set([...bookmarkedIds].filter((id) => id !== selectedGameId));
		} else {
			await addBookmark(me.uid, selectedGameId);
			bookmarkedIds = new Set([...bookmarkedIds, selectedGameId]);
		}
	}

	$effect(() => {
		const user = me;
		if (!user) {
			bookmarkedIds = new Set();
			return;
		}
		getBookmarkedGameIds(user.uid).then((ids) => (bookmarkedIds = ids));
	});

	const pickConfig: Record<string, { label: string; icon: any; color: string }> = {
		hitPick: { label: 'Hit', icon: Target, color: 'text-accent' },
		bombPick: { label: 'Bomb', icon: Bomb, color: 'text-destructive' },
		seasonalPick: { label: 'Seasonal', icon: Snowflake, color: 'text-sky-400' },
		altPick: { label: 'Alt', icon: Shuffle, color: 'text-purple-400' }
	};

	$effect(() => {
		const id = get(page).params?.id;
		leagueId = id;
		if (id) loading = true;
	});

	$effect(() => {
		const id = leagueId;
		if (!id) return;
		loadError = null;
		getLeague(id)
			.then((l) => {
				league = l;
				loading = false;
			})
			.catch((e) => {
				loadError = e instanceof Error ? e.message : 'Load failed';
				loading = false;
			});
	});

	$effect(() => {
		const id = leagueId;
		const season = league?.season;
		if (!id || !season) return;
		phaseStatusesLoaded = false;
		getDraftPhaseStatuses(id, season).then(async (s) => {
			phaseStatuses = s;
			phaseStatusesLoaded = true;
			if (!isPastSeason(season)) {
				await syncLeagueCurrentPhase(id);
				const updated = await getLeague(id);
				if (updated && updated.currentPhase !== league?.currentPhase) {
					league = updated;
				}
			}
		});
	});

	$effect(() => {
		const id = leagueId;
		if (!id) return;
		getTeams(id).then((list) => {
			teams = list;
			Promise.all(list.map((t) => getUserProfile(t.id))).then((profiles) => {
				const profileMap: Record<string, { displayName: string; avatarUrl: string | null }> = {};
				profiles.forEach((p, i) => {
					if (p) {
						profileMap[list[i].id] = {
							displayName: p.displayName || list[i].name,
							avatarUrl: p.avatarUrl
						};
					} else {
						profileMap[list[i].id] = { displayName: list[i].name, avatarUrl: null };
					}
				});
				userProfiles = profileMap;
			});
		});
	});

	$effect(() => {
		const idList: string[] = [];
		const seen = new Set<string>();
		for (const t of teams) {
			const p = t.picks;
			for (const gid of [
				p?.hitPick,
				p?.bombPick,
				...(p?.winterPicks ?? []),
				...(p?.summerPicks ?? []),
				...(p?.fallPicks ?? []),
				...(p?.altPicks ?? [])
			].filter(Boolean) as string[]) {
				if (!seen.has(gid)) {
					seen.add(gid);
					idList.push(gid);
				}
			}
		}
		if (idList.length === 0) return;
		Promise.all(idList.map((gid) => getGame(gid))).then((gameList) => {
			const map: Record<string, Game & { id: string }> = {};
			gameList.forEach((g, i) => {
				if (g) map[idList[i]] = g;
			});
			games = { ...games, ...map };
		});
	});

	$effect(() => {
		const id = leagueId;
		const season = league?.season;
		if (!id || teams.length === 0) return;
		loadingHistory = true;
		seasonSnapshot = null;
		if (season && isPastSeason(season)) {
			getSeasonSnapshotOrCompute(id, season)
				.then((snap) => {
					seasonSnapshot = snap;
					const history = new Map<string, Map<string, number>>();
					for (const s of snap.graphData.series) {
						const byDate = new Map<string, number>();
						snap.graphData.dates.forEach((d, i) => byDate.set(d, s.data[i] ?? 0));
						history.set(s.teamId, byDate);
					}
					teamScoresHistory = history;
				})
				.finally(() => (loadingHistory = false));
		} else {
			getTeamScoresHistory(id)
				.then((history) => (teamScoresHistory = history))
				.finally(() => (loadingHistory = false));
		}
	});

	$effect(() => {
		getUpcomingGames().then((list) => (upcomingGames = list));
	});

	function toggleTeam(teamId: string) {
		const next = new Set(expandedTeams);
		if (next.has(teamId)) next.delete(teamId);
		else next.add(teamId);
		expandedTeams = next;
	}

	function getTeamComputedScore(team: Team & { id: string }): number {
		const delistedGames = league?.delistedGames ?? [];
		const scoringIds = getScoringGameIds(team.picks, delistedGames);
		let raw = 0;
		for (const id of scoringIds) {
			const score = games[id]?.score;
			if (score != null) raw += score;
		}
		return raw + (team.bombAdjustment ?? 0);
	}

	const isPastSeasonView = $derived(!!league && !!league.season && isPastSeason(league.season));

	const teamsSortedByScore = $derived.by(() => {
		if (isPastSeasonView && seasonSnapshot) {
			return [...teams].sort(
				(a, b) =>
					(seasonSnapshot!.finalRanks[a.id] ?? 999) - (seasonSnapshot!.finalRanks[b.id] ?? 999)
			);
		}
		return [...teams].sort((a, b) => getTeamComputedScore(b) - getTeamComputedScore(a));
	});

	function getAllPickedGames(
		team: Team & { id: string }
	): Array<{ id: string; pickType: string; phase?: string }> {
		const result: Array<{ id: string; pickType: string; phase?: string }> = [];
		const picks = team.picks;
		if (picks?.hitPick) result.push({ id: picks.hitPick, pickType: 'hitPick' });
		if (picks?.bombPick) result.push({ id: picks.bombPick, pickType: 'bombPick' });
		for (const gid of picks?.winterPicks ?? [])
			result.push({ id: gid, pickType: 'seasonalPick', phase: 'winter' });
		for (const gid of picks?.summerPicks ?? [])
			result.push({ id: gid, pickType: 'seasonalPick', phase: 'summer' });
		for (const gid of picks?.fallPicks ?? [])
			result.push({ id: gid, pickType: 'seasonalPick', phase: 'fall' });
		for (const gid of picks?.altPicks ?? []) result.push({ id: gid, pickType: 'altPick' });
		return result;
	}

	const graphData = $derived.by(() => {
		if (isPastSeasonView && seasonSnapshot?.graphData) {
			return {
				dates: seasonSnapshot.graphData.dates,
				series: seasonSnapshot.graphData.series.map((s) => ({
					name:
						userProfiles[s.teamId]?.displayName ||
						teams.find((t) => t.id === s.teamId)?.name ||
						'Unknown',
					data: s.data
				}))
			};
		}
		if (teamScoresHistory.size === 0) return null;
		const allDates = new Set<string>();
		teamScoresHistory.forEach((scores) => {
			scores.forEach((_, date) => allDates.add(date));
		});
		const sortedDates = Array.from(allDates).sort();
		const series = teamsSortedByScore.map((team) => {
			const scores = teamScoresHistory.get(team.id) || new Map();
			return {
				name: userProfiles[team.id]?.displayName || team.name,
				data: sortedDates.map((date) => scores.get(date) || 0)
			};
		});
		return { dates: sortedDates, series };
	});

	function getDisplayScore(team: Team & { id: string }): number {
		if (isPastSeasonView && seasonSnapshot) {
			return seasonSnapshot.finalScores[team.id] ?? 0;
		}
		return getTeamComputedScore(team);
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function getRelativeDate(dateStr: string): string {
		if (!dateStr) return '';
		const now = new Date();
		const target = new Date(dateStr);
		const diffMs = target.getTime() - now.getTime();
		const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
		if (diffDays <= 0) return 'Released';
		if (diffDays === 1) return 'Tomorrow';
		if (diffDays <= 7) return `${diffDays}d`;
		if (diffDays <= 30) return `${Math.ceil(diffDays / 7)}w`;
		return `${Math.ceil(diffDays / 30)}mo`;
	}

	const isCommissioner = $derived(!!(league && getCurrentUser()?.uid === league.commissionerId));

	function resetSettingsForm() {
		settingsJustSaved = false;
	}
	function openSettings() {
		resetSettingsForm();
		settingsOpen = true;
	}
	function closeSettings() {
		resetSettingsForm();
		settingsOpen = false;
	}

	async function saveSettings() {
		if (!leagueId) return;
		savingSettings = true;
		try {
			await updateLeagueSettings(leagueId, {});
			settingsJustSaved = true;
		} finally {
			savingSettings = false;
		}
	}

	async function handleDeleteLeague() {
		if (!leagueId) return;
		deleting = true;
		try {
			await deleteLeague(leagueId);
			deleteDialogOpen = false;
			settingsOpen = false;
			goto('/dashboard');
		} catch (err) {
			console.error(err);
		} finally {
			deleting = false;
		}
	}

	function getStatusLabel(): string {
		if (!league) return '';
		if (league.status === 'completed') {
			return league.season && isPastSeason(league.season)
				? `Season ${league.season} Complete`
				: 'Completed';
		}
		if (league.status === 'draft') {
			const phase = league.currentPhase ?? 'winter';
			if (phase !== 'winter') return 'Scoring';
			const open = league.season && isDraftWindowOpen(phase, league.season);
			return open ? 'Drafting' : 'Pre-Season';
		}
		return 'Scoring';
	}

	function isImplicitlyComplete(phase: DraftPhase): boolean {
		if (!league) return false;
		const idx = DRAFT_PHASES.indexOf(phase);
		const currentIdx = DRAFT_PHASES.indexOf(league.currentPhase);
		return idx < currentIdx;
	}

	function getEffectivePhaseStatus(phase: DraftPhase): DraftStatus | null {
		if (isImplicitlyComplete(phase)) return 'completed';
		return phaseStatuses[phase];
	}

	function getPhaseStatusIcon(phase: DraftPhase) {
		if (isImplicitlyComplete(phase)) return CheckCircle;
		if (!phaseStatusesLoaded) return Loader;
		const status = phaseStatuses[phase];
		if (status === 'completed') return CheckCircle;
		if (status === 'active') return Loader;
		if (status === 'pending') return Loader;
		return Circle;
	}

	const DRAFT_MONTH_LABELS: Record<DraftPhase, string> = {
		winter: 'Dec',
		summer: 'Apr',
		fall: 'Aug'
	};

	function getPhaseStatusLabel(phase: DraftPhase): string {
		if (isImplicitlyComplete(phase)) return 'Complete';
		if (!phaseStatusesLoaded) return 'Loading';
		const status = phaseStatuses[phase];
		if (status === 'completed') return 'Complete';
		if (status === 'active' || status === 'pending') {
			if (league && !isDraftWindowOpen(phase, league.season)) {
				return `Opens ${DRAFT_MONTH_LABELS[phase]}`;
			}
			return 'In Progress';
		}
		const idx = DRAFT_PHASES.indexOf(phase);
		const currentIdx = DRAFT_PHASES.indexOf(league?.currentPhase ?? 'winter');
		if (idx < currentIdx) return 'Skipped';
		if (league?.currentPhase === phase && league && isDraftWindowOpen(phase, league.season))
			return 'Ready';
		return `Opens ${DRAFT_MONTH_LABELS[phase]}`;
	}

	function canEnterDraft(phase: DraftPhase): boolean {
		if (!league) return false;
		const idx = DRAFT_PHASES.indexOf(phase);
		const currentIdx = DRAFT_PHASES.indexOf(league.currentPhase);
		if (idx !== currentIdx) return false;
		const status = phaseStatuses[phase];
		if (status === 'completed') return false;
		return isDraftWindowOpen(phase, league.season);
	}

	const graphColors = [
		'#5b9bf5',
		'#6ddb7b',
		'#f59e42',
		'#e05d5d',
		'#b47aed',
		'#38bdf8',
		'#f472b6',
		'#facc15'
	];

	function getRankStyle(rank: number): string {
		if (rank === 0) return 'bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/30';
		if (rank === 1) return 'bg-slate-400/15 text-slate-300 ring-1 ring-slate-400/30';
		if (rank === 2) return 'bg-amber-600/15 text-amber-500 ring-1 ring-amber-600/30';
		return 'bg-white/[0.05] text-muted-foreground';
	}
</script>

<svelte:head><title>{league?.name ?? 'League'}</title></svelte:head>

<div class="space-y-6">
	{#if loading}
		<div class="space-y-4">
			<div class="h-12 w-48 animate-pulse rounded-lg bg-white/[0.04]"></div>
			<div class="grid gap-4 sm:grid-cols-3">
				{#each Array(3) as _}
					<div class="h-32 animate-pulse rounded-xl bg-white/[0.04]"></div>
				{/each}
			</div>
		</div>
	{:else if loadError}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<h2 class="text-xl font-bold">Connection error</h2>
			<p class="text-sm text-muted-foreground">{loadError}</p>
			<div class="flex gap-3">
				<Button onclick={retryLeagueLoad} variant="outline">Retry</Button>
				<Button variant="ghost" href="/dashboard" class="gap-2">
					<ArrowLeft class="h-4 w-4" /> Back to dashboard
				</Button>
			</div>
		</div>
	{:else if !league}
		<div class="flex flex-col items-center gap-4 py-16 text-center">
			<h2 class="text-xl font-bold">League not found</h2>
			<Button variant="outline" href="/dashboard" class="gap-2">
				<ArrowLeft class="h-4 w-4" /> Back to dashboard
			</Button>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
			<div class="space-y-2">
				<div class="flex items-center gap-3">
					<h1 class="text-3xl font-bold tracking-tight md:text-4xl">{league.name}</h1>
					{#if isCommissioner && !isPastSeasonView}
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 text-muted-foreground hover:text-foreground"
							onclick={() => (settingsOpen ? closeSettings() : openSettings())}
						>
							<Settings class="h-4 w-4" />
						</Button>
					{/if}
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm text-muted-foreground">Season {league.season}</span>
					<span class="rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-xs text-foreground"
						>{league.code}</span
					>
					<Badge
						variant={league.status === 'active'
							? 'default'
							: league.status === 'completed'
								? 'secondary'
								: 'outline'}
						class="text-[10px]"
					>
						{getStatusLabel()}
					</Badge>
				</div>
			</div>
		</div>

		{#if isPastSeasonView && seasonSnapshot}
			<!-- Winning Screen Hero -->
			{@const winner = teamsSortedByScore[0]}
			<div
				class="overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/10 via-accent/5 to-transparent"
			>
				<div
					class="flex flex-col items-center gap-4 px-6 py-10 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left"
				>
					<div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent/20">
						<Trophy class="h-10 w-10 text-accent" />
					</div>
					<div class="space-y-1">
						<p class="text-sm font-medium tracking-wider text-muted-foreground uppercase">
							Season {league.season} Complete
						</p>
						<h2 class="text-2xl font-bold text-foreground md:text-3xl">
							{winner ? userProfiles[winner.id]?.displayName || winner.name : '—'} is the Champion
						</h2>
						{#if winner}
							<p class="text-lg font-semibold text-primary">
								Final score: {Math.round(getDisplayScore(winner)).toLocaleString()}
							</p>
						{/if}
					</div>
					{#if winner}
						<Avatar.Root
							class="size-16 shrink-0 ring-2 ring-accent/40 ring-offset-2 ring-offset-background"
						>
							<Avatar.Image
								src={userProfiles[winner.id]?.avatarUrl ?? undefined}
								alt={winner.name}
							/>
							<Avatar.Fallback class="text-xl">
								{(userProfiles[winner.id]?.displayName || winner.name).slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
					{/if}
				</div>
			</div>
		{:else}
			<!-- Phase Timeline -->
			<div class="grid gap-3 sm:grid-cols-3">
				{#each DRAFT_PHASES as phase}
					{@const cfg = PHASE_CONFIG[phase]}
					{@const effectiveStatus = getEffectivePhaseStatus(phase)}
					{@const phaseLabel = getPhaseStatusLabel(phase)}
					{@const StatusIcon = getPhaseStatusIcon(phase)}
					{@const isCurrent = league.currentPhase === phase}
					{@const canEnter = canEnterDraft(phase)}
					{@const isWaitingForWindow = isCurrent && !canEnter && phaseLabel.startsWith('Opens')}
					<div
						class="relative overflow-hidden rounded-xl border transition-all {isWaitingForWindow
							? 'border-amber-500/40 bg-amber-500/[0.04]'
							: isCurrent
								? 'border-primary/40 bg-primary/[0.04]'
								: effectiveStatus === 'completed'
									? 'border-accent/20 bg-accent/[0.03]'
									: phaseLabel === 'Loading'
										? 'border-white/[0.06] bg-white/[0.02]'
										: phaseLabel === 'Skipped'
											? 'border-white/[0.04] bg-white/[0.01] opacity-50'
											: 'border-white/[0.06] bg-white/[0.02] opacity-60'}"
					>
						{#if isWaitingForWindow}
							<div
								class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500/60 via-amber-500 to-amber-500/60"
							></div>
						{:else if isCurrent}
							<div
								class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60"
							></div>
						{:else if effectiveStatus === 'completed'}
							<div class="absolute inset-x-0 top-0 h-0.5 bg-accent/40"></div>
						{/if}
						<div class="p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									{#if isWaitingForWindow}
										<Timer class="h-4 w-4 text-amber-500" />
									{:else}
										<StatusIcon
											class="h-4 w-4 {phaseLabel === 'Loading'
												? 'animate-spin text-muted-foreground'
												: effectiveStatus === 'completed'
													? 'text-accent'
													: isCurrent
														? 'animate-spin text-primary'
														: 'text-muted-foreground'}"
										/>
									{/if}
									<span class="font-semibold">{cfg.label}</span>
								</div>
								<span class="text-[10px] font-medium text-muted-foreground uppercase">
									{getPhaseStatusLabel(phase)}
								</span>
							</div>
							<p class="mt-1 text-xs text-muted-foreground">
								{cfg.releaseStart(parseInt(league.season)).slice(5)} — {cfg
									.releaseEnd(parseInt(league.season))
									.slice(5)}
							</p>
							<div class="mt-3">
								{#if phaseLabel === 'Loading'}
									<p class="text-center text-xs text-muted-foreground">Loading...</p>
								{:else if canEnter}
									<Button
										href="/league/{league.id}/draft/{getDraftId(phase, league.season)}"
										size="sm"
										class="w-full gap-2 {isCurrent ? 'glow-sm-primary' : ''}"
										variant={isCurrent ? 'default' : 'outline'}
									>
										<Play class="h-3.5 w-3.5" />
										{phaseStatuses[phase] === 'active' || phaseStatuses[phase] === 'pending'
											? 'Continue Draft'
											: 'Enter Draft Room'}
									</Button>
								{:else if effectiveStatus === 'completed'}
									<p class="text-center text-xs text-muted-foreground">Draft complete</p>
								{:else if phaseLabel === 'Skipped'}
									<p class="text-center text-xs text-muted-foreground">Skipped</p>
								{:else if phaseLabel.startsWith('Opens')}
									<p class="text-center text-xs text-muted-foreground">{phaseLabel}</p>
								{:else}
									{@const phaseIdx = DRAFT_PHASES.indexOf(phase)}
									{@const prevPhases = DRAFT_PHASES.slice(0, phaseIdx)}
									{@const firstIncomplete = prevPhases.find(
										(p) => getEffectivePhaseStatus(p) !== 'completed'
									)}
									{#if firstIncomplete == null}
										<p class="text-center text-xs text-muted-foreground">
											Opens {DRAFT_MONTH_LABELS[phase]}
										</p>
									{:else}
										<p class="text-center text-xs text-muted-foreground">
											Complete {PHASE_CONFIG[firstIncomplete]?.label ?? ''} first
										</p>
									{/if}
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Settings Panel -->
		{#if settingsOpen && isCommissioner && !isPastSeasonView}
			<div
				class="animate-fade-in-up overflow-hidden rounded-xl border border-primary/20 bg-card/60"
			>
				<div class="border-b border-white/[0.06] bg-white/[0.02] px-5 py-4">
					<h3 class="font-semibold">League Settings</h3>
					<p class="text-sm text-muted-foreground">Manage picks per phase and league options.</p>
				</div>
				<div class="space-y-6 p-5">
					<div class="flex flex-wrap items-end gap-6">
						<div class="space-y-2">
							<Label for="editSeason" class="text-muted-foreground">Season</Label>
							<Input
								id="editSeason"
								value={league.season}
								readonly
								class="w-28 bg-white/[0.03] font-mono read-only:cursor-default read-only:opacity-100"
							/>
						</div>
						<div class="space-y-2">
							<Label class="text-muted-foreground">Picks per phase</Label>
							<p class="text-sm">
								{league ? getSeasonalPicksForPlayerCount(league.members.length) : '—'} (based on{' '}
								{league?.members.length ?? 0} players)
							</p>
						</div>
					</div>
					<Separator class="opacity-30" />
					<div class="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p class="text-sm font-medium text-destructive">Delete league</p>
								<p class="mt-0.5 text-xs text-muted-foreground">This cannot be undone.</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								onclick={() => (deleteDialogOpen = true)}
								class="shrink-0 gap-2"
							>
								<Trash2 class="h-4 w-4" /> Delete
							</Button>
						</div>
					</div>
				</div>
			</div>

			<Dialog.Root bind:open={deleteDialogOpen}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Delete league?</Dialog.Title>
						<Dialog.Description>
							This will permanently delete <strong>{league?.name}</strong>. You cannot undo this.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer class="gap-2">
						<Button variant="outline" onclick={() => (deleteDialogOpen = false)} disabled={deleting}
							>Cancel</Button
						>
						<Button variant="destructive" onclick={handleDeleteLeague} disabled={deleting}>
							{deleting ? 'Deleting...' : 'Delete league'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		{/if}

		<!-- Main Content Grid -->
		<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
			<div class="space-y-6">
				<!-- Historical Score Graph -->
				<div class="overflow-hidden rounded-xl border border-white/[0.06] bg-card/40">
					<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
						<TrendingUp class="h-4 w-4 text-primary" />
						<h2 class="font-semibold">
							{isPastSeasonView ? 'Season score progression' : 'Score History'}
						</h2>
					</div>
					<div class="p-4">
						{#if loadingHistory}
							<div class="flex h-48 items-center justify-center md:h-64">
								<Loader class="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						{:else if graphData && graphData.dates.length > 0}
							{@const data = graphData}
							{@const maxScore = Math.max(...data.series.map((s) => Math.max(...s.data)), 1)}
							{@const pad = { top: 20, right: 20, bottom: 30, left: 45 }}
							{@const w = 800}
							{@const h = 280}
							{@const chartW = w - pad.left - pad.right}
							{@const chartH = h - pad.top - pad.bottom}
							<div class="overflow-x-auto">
								<svg
									viewBox="0 0 {w} {h}"
									class="w-full"
									style="min-width: 500px"
									role="img"
									aria-label="Score history chart"
									onmouseleave={() => (hoveredDateIdx = null)}
								>
									<!-- Grid lines -->
									{#each Array(5) as _, i}
										{@const y = pad.top + (chartH * i) / 4}
										<line
											x1={pad.left}
											y1={y}
											x2={w - pad.right}
											y2={y}
											stroke="white"
											stroke-opacity="0.06"
											stroke-width="1"
										/>
										<text
											x={pad.left - 8}
											y={y + 4}
											text-anchor="end"
											fill="#8899aa"
											font-size="10"
										>
											{Math.round(maxScore * (1 - i / 4))}
										</text>
									{/each}

									<!-- Data lines with gradient -->
									{#each data.series as series, sIdx}
										{@const color = graphColors[sIdx % graphColors.length]}
										{@const pts = series.data.map((score, i) => {
											const x = pad.left + (chartW * i) / (data.dates.length - 1 || 1);
											const y = pad.top + chartH - (chartH * score) / maxScore;
											return { x, y };
										})}
										{@const polyPts = pts.map((p) => `${p.x},${p.y}`).join(' ')}

										<!-- Area fill -->
										<defs>
											<linearGradient id="grad-{sIdx}" x1="0" y1="0" x2="0" y2="1">
												<stop offset="0%" stop-color={color} stop-opacity="0.15" />
												<stop offset="100%" stop-color={color} stop-opacity="0" />
											</linearGradient>
										</defs>
										<polygon
											points="{pad.left},{pad.top + chartH} {polyPts} {pts[pts.length - 1]
												.x},{pad.top + chartH}"
											fill="url(#grad-{sIdx})"
										/>
										<polyline
											points={polyPts}
											fill="none"
											stroke={color}
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>

										<!-- End dot -->
										{@const last = pts[pts.length - 1]}
										<circle cx={last.x} cy={last.y} r="3" fill={color} />
									{/each}

									<!-- Hover zone -->
									{#each data.dates as _, i}
										{@const x = pad.left + (chartW * i) / (data.dates.length - 1 || 1)}
										<rect
											x={x - chartW / (data.dates.length - 1 || 1) / 2}
											y={pad.top}
											width={chartW / (data.dates.length - 1 || 1)}
											height={chartH}
											fill="transparent"
											role="presentation"
											onmouseenter={() => (hoveredDateIdx = i)}
										/>
									{/each}

									<!-- Tooltip line -->
									{#if hoveredDateIdx !== null}
										{@const hx =
											pad.left + (chartW * hoveredDateIdx) / (data.dates.length - 1 || 1)}
										<line
											x1={hx}
											y1={pad.top}
											x2={hx}
											y2={pad.top + chartH}
											stroke="white"
											stroke-opacity="0.15"
											stroke-width="1"
											stroke-dasharray="3 3"
										/>
										{#each data.series as series, sIdx}
											{@const color = graphColors[sIdx % graphColors.length]}
											{@const score = series.data[hoveredDateIdx]}
											{@const cy = pad.top + chartH - (chartH * score) / maxScore}
											<circle cx={hx} {cy} r="4" fill={color} stroke="#111827" stroke-width="2" />
										{/each}
									{/if}

									<!-- X-axis labels -->
									{#each data.dates as date, i}
										{@const showLabel =
											i % Math.ceil(data.dates.length / 7) === 0 || i === data.dates.length - 1}
										{#if showLabel}
											{@const x = pad.left + (chartW * i) / (data.dates.length - 1 || 1)}
											<text {x} y={h - 6} text-anchor="middle" fill="#8899aa" font-size="10">
												{formatDate(date)}
											</text>
										{/if}
									{/each}
								</svg>
							</div>

							<!-- Tooltip details -->
							{#if hoveredDateIdx !== null}
								<div class="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
									<p class="mb-1.5 text-xs font-medium text-muted-foreground">
										{formatDate(data.dates[hoveredDateIdx])}
									</p>
									<div class="flex flex-wrap gap-x-5 gap-y-1">
										{#each data.series as series, sIdx}
											<div class="flex items-center gap-1.5">
												<div
													class="h-2 w-2 rounded-full"
													style="background: {graphColors[sIdx % graphColors.length]}"
												></div>
												<span class="text-xs text-muted-foreground">{series.name}</span>
												<span class="font-mono text-xs font-medium text-foreground"
													>{Math.round(series.data[hoveredDateIdx])}</span
												>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Legend (outside SVG) -->
							<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1">
								{#each data.series as series, sIdx}
									<div class="flex items-center gap-1.5">
										<div
											class="h-2.5 w-2.5 rounded-sm"
											style="background: {graphColors[sIdx % graphColors.length]}"
										></div>
										<span class="text-xs text-muted-foreground">{series.name}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground md:h-64"
							>
								<TrendingUp class="h-8 w-8 opacity-30" />
								<p class="text-sm">No score data available yet</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Standings -->
				<div class="space-y-3">
					<h2 class="text-lg font-semibold">
						{isPastSeasonView ? 'Final Standings' : 'Standings'}
					</h2>
					{#if teams.length === 0}
						<div class="glass rounded-xl py-10 text-center text-sm text-muted-foreground">
							No teams yet. Wait for the draft!
						</div>
					{:else}
						{#each teamsSortedByScore as team, rank}
							<div
								class="overflow-hidden rounded-xl border border-white/[0.06] bg-card/40 transition-colors hover:border-white/[0.1]"
							>
								<button
									class="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
									onclick={() => toggleTeam(team.id)}
								>
									<span
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold {getRankStyle(
											rank
										)}"
									>
										{rank + 1}
									</span>
									<Avatar.Root class="size-9 shrink-0">
										<Avatar.Image
											src={userProfiles[team.id]?.avatarUrl ?? undefined}
											alt={team.name}
										/>
										<Avatar.Fallback class="text-xs">
											{(userProfiles[team.id]?.displayName || team.name).slice(0, 2).toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium">
											{userProfiles[team.id]?.displayName || team.name}
										</p>
										<p class="truncate text-xs text-muted-foreground">{team.name}</p>
									</div>
									<div class="flex items-center gap-3">
										<span class="font-mono text-lg font-bold text-primary"
											>{Math.round(getDisplayScore(team))}</span
										>
										{#if expandedTeams.has(team.id)}
											<ChevronUp class="h-4 w-4 text-muted-foreground" />
										{:else}
											<ChevronDown class="h-4 w-4 text-muted-foreground" />
										{/if}
									</div>
								</button>
								{#if expandedTeams.has(team.id)}
									{@const hitGame = team.picks?.hitPick ? games[team.picks.hitPick] : null}
									{@const bombGame = team.picks?.bombPick ? games[team.picks.bombPick] : null}
									<div class="animate-fade-in-up space-y-4 border-t border-white/[0.06] px-4 py-4">
										<!-- Hit & Bomb -->
										{#if hitGame || bombGame}
											<div class="flex flex-wrap gap-2.5">
												{#if hitGame}
													<button
														type="button"
														class="group relative block w-20 cursor-pointer overflow-hidden rounded-lg border border-white/[0.08] text-left transition-all hover:border-accent/40 hover:shadow-md focus:ring-2 focus:ring-ring focus:outline-none"
														onclick={() => openGameDetail(team.picks.hitPick!)}
													>
														{#if hitGame.coverUrl}
															<img
																src={hitGame.coverUrl}
																alt={hitGame.name}
																class="aspect-[3/4] w-full object-cover"
															/>
														{:else}
															<div
																class="flex aspect-[3/4] w-full items-center justify-center bg-muted"
															>
																<span class="px-1 text-center text-[9px] text-muted-foreground"
																	>{hitGame.name}</span
																>
															</div>
														{/if}
														<div
															class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-1.5 py-0.5"
														>
															<div class="flex items-center gap-0.5">
																<Target class="h-2.5 w-2.5 text-accent" />
																<span class="text-[9px] font-medium text-white">Hit</span>
															</div>
															{#if !isPastSeasonView && hitGame.score != null}
																<span class="font-mono text-[9px] font-bold text-white"
																	>{Math.round(hitGame.score)}</span
																>
															{:else if isPastSeasonView}
																<span class="text-[9px] text-white/70">—</span>
															{/if}
														</div>
													</button>
												{/if}
												{#if bombGame}
													<button
														type="button"
														class="group relative block w-20 cursor-pointer overflow-hidden rounded-lg border border-white/[0.08] text-left transition-all hover:border-destructive/40 hover:shadow-md focus:ring-2 focus:ring-ring focus:outline-none"
														onclick={() => openGameDetail(team.picks.bombPick!)}
													>
														{#if bombGame.coverUrl}
															<img
																src={bombGame.coverUrl}
																alt={bombGame.name}
																class="aspect-[3/4] w-full object-cover"
															/>
														{:else}
															<div
																class="flex aspect-[3/4] w-full items-center justify-center bg-muted"
															>
																<span class="px-1 text-center text-[9px] text-muted-foreground"
																	>{bombGame.name}</span
																>
															</div>
														{/if}
														<div
															class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-1.5 py-0.5"
														>
															<div class="flex items-center gap-0.5">
																<Bomb class="h-2.5 w-2.5 text-destructive" />
																<span class="text-[9px] font-medium text-white">Bomb</span>
															</div>
														</div>
													</button>
												{/if}
											</div>
										{/if}

										<!-- Seasonal picks by phase -->
										{#each DRAFT_PHASES as phase}
											{@const phaseKey =
												phase === 'winter'
													? 'winterPicks'
													: phase === 'summer'
														? 'summerPicks'
														: 'fallPicks'}
											{@const phasePicks = (team.picks?.[phaseKey] as string[]) ?? []}
											{#if phasePicks.length > 0}
												<div>
													<p
														class="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
													>
														{PHASE_CONFIG[phase].label}
													</p>
													<div class="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
														{#each phasePicks as gameId}
															{@const game = games[gameId]}
															{#if game}
																<button
																	type="button"
																	class="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-white/[0.08] text-left transition-all hover:border-sky-400/40 hover:shadow-md focus:ring-2 focus:ring-ring focus:outline-none"
																	onclick={() => openGameDetail(gameId)}
																>
																	{#if game.coverUrl}
																		<img
																			src={game.coverUrl}
																			alt={game.name}
																			class="aspect-[3/4] w-full object-cover"
																		/>
																	{:else}
																		<div
																			class="flex aspect-[3/4] w-full items-center justify-center bg-muted"
																		>
																			<span
																				class="px-1 text-center text-[9px] text-muted-foreground"
																				>{game.name}</span
																			>
																		</div>
																	{/if}
																	<div
																		class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-1 py-0.5"
																	>
																		<Snowflake class="h-2.5 w-2.5 text-sky-400" />
																		{#if !isPastSeasonView && game.score != null}
																			<span class="font-mono text-[9px] font-bold text-white"
																				>{Math.round(game.score)}</span
																			>
																		{:else if isPastSeasonView}
																			<span class="text-[9px] text-white/70">—</span>
																		{/if}
																	</div>
																</button>
															{/if}
														{/each}
													</div>
												</div>
											{/if}
										{/each}

										<!-- Alt picks -->
										{#if (team.picks?.altPicks ?? []).length > 0}
											<div>
												<p
													class="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
												>
													Alt (Backup)
												</p>
												<div class="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
													{#each team.picks?.altPicks ?? [] as gameId}
														{@const game = games[gameId]}
														{#if game}
															<button
																type="button"
																class="group relative block w-full cursor-pointer overflow-hidden rounded-lg border border-dashed border-purple-400/20 text-left opacity-60 transition-all hover:border-purple-400/40 hover:opacity-100 hover:shadow-md focus:ring-2 focus:ring-ring focus:outline-none"
																onclick={() => openGameDetail(gameId)}
															>
																{#if game.coverUrl}
																	<img
																		src={game.coverUrl}
																		alt={game.name}
																		class="aspect-[3/4] w-full object-cover"
																	/>
																{:else}
																	<div
																		class="flex aspect-[3/4] w-full items-center justify-center bg-muted"
																	>
																		<span class="px-1 text-center text-[9px] text-muted-foreground"
																			>{game.name}</span
																		>
																	</div>
																{/if}
																<div
																	class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-1 py-0.5"
																>
																	<Shuffle class="h-2.5 w-2.5 text-purple-400" />
																</div>
															</button>
														{/if}
													{/each}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Sidebar: Upcoming or Season Summary -->
			<div class="space-y-3">
				{#if isPastSeasonView}
					<h2 class="text-lg font-semibold">Season Summary</h2>
					<div class="overflow-hidden rounded-xl border border-white/[0.06] bg-card/40 p-4">
						<div class="space-y-2 text-sm text-muted-foreground">
							<p>{teams.length} players competed in Season {league.season}.</p>
							<p>
								{teams.reduce((acc, t) => {
									const p = t.picks;
									const count =
										(p?.hitPick ? 1 : 0) +
										(p?.bombPick ? 1 : 0) +
										(p?.winterPicks?.length ?? 0) +
										(p?.summerPicks?.length ?? 0) +
										(p?.fallPicks?.length ?? 0) +
										(p?.altPicks?.length ?? 0);
									return acc + count;
								}, 0)} games drafted
							</p>
						</div>
					</div>
				{:else}
					<h2 class="text-lg font-semibold">Upcoming Releases</h2>
					<div class="overflow-hidden rounded-xl border border-white/[0.06] bg-card/40">
						<ScrollArea class="h-[calc(100vh-14rem)]">
							<div class="space-y-1 p-2">
								{#if upcomingGames.length === 0}
									<div class="py-10 text-center text-sm text-muted-foreground">
										No upcoming games
									</div>
								{:else}
									{#each upcomingGames as game}
										{@const teamsWithGame = teams.filter((t) => {
											const p = t.picks;
											return (
												p?.hitPick === game.id ||
												p?.bombPick === game.id ||
												p?.winterPicks?.includes(game.id) ||
												p?.summerPicks?.includes(game.id) ||
												p?.fallPicks?.includes(game.id) ||
												p?.altPicks?.includes(game.id)
											);
										})}
										{#if teamsWithGame.length > 0}
											<button
												type="button"
												class="flex w-full cursor-pointer items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-white/[0.04] focus:ring-2 focus:ring-ring focus:outline-none"
												onclick={() => openGameDetail(game.id)}
											>
												{#if game.coverUrl}
													<img
														src={game.coverUrl}
														alt={game.name}
														class="h-14 w-10 shrink-0 rounded object-cover"
													/>
												{:else}
													<div
														class="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-white/[0.04] text-[8px] text-muted-foreground"
													>
														N/A
													</div>
												{/if}
												<div class="min-w-0 flex-1">
													<h3 class="line-clamp-1 text-sm font-medium">{game.name}</h3>
													<div class="mt-0.5 flex items-center gap-1.5">
														{#if game.releaseDate}
															<span class="text-[10px] text-muted-foreground">
																{new Date(game.releaseDate).toLocaleDateString('en-US', {
																	month: 'short',
																	day: 'numeric'
																})}
															</span>
															{@const rel = getRelativeDate(game.releaseDate)}
															{#if rel && rel !== 'Released'}
																<span
																	class="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"
																	>{rel}</span
																>
															{/if}
														{/if}
													</div>
													<div class="mt-1 flex flex-wrap gap-1">
														{#each teamsWithGame as t}
															<span
																class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-muted-foreground"
															>
																{userProfiles[t.id]?.displayName || t.name}
															</span>
														{/each}
													</div>
												</div>
											</button>
										{/if}
									{/each}
								{/if}
							</div>
						</ScrollArea>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<GameDetailDialog
	open={gameModalOpen}
	onOpenChange={(open) => !open && closeGameModal()}
	game={detailGame}
	loading={detailLoading}
	showNotFound={selectedGameId != null && !detailLoading && detailGame == null}
	isBookmarked={selectedGameId != null && bookmarkedIds.has(selectedGameId)}
	onToggleBookmark={handleToggleBookmark}
/>
