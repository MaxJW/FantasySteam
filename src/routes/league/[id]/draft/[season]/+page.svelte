<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { getCurrentUser } from '$lib/auth';
	import {
		getLeague,
		getGameListPage,
		getGame,
		isGameHidden,
		createDraft,
		getDraft,
		subscribeDraft,
		setPresence,
		removePresence,
		startDraft,
		submitPick,
		getCurrentPickUserId,
		getSnakeOrderForRound,
		getDisplayNames,
		getAllowedPickTypesForUser
	} from '$lib/db';
	import type { Draft, DraftPick, League, Game, GameListEntry, DraftPhase } from '$lib/db';
	import {
		parseDraftId,
		getTotalRoundsForPhase,
		getPickTypeForRound,
		getSeasonalPicksForPlayerCount,
		PHASE_CONFIG,
		getPhaseReleaseDateRange
	} from '$lib/db';
	import { onMount } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { GameDetailDialog } from '$lib/components/game-detail-dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Avatar from '$lib/components/ui/avatar';

	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Search from '@lucide/svelte/icons/search';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Target from '@lucide/svelte/icons/target';
	import Bomb from '@lucide/svelte/icons/bomb';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Play from '@lucide/svelte/icons/play';
	import Zap from '@lucide/svelte/icons/zap';

	const gameDetailCache = new Map<string, Game & { id: string }>();

	const GAME_LIST_PAGE_SIZE = 24;
	let gameListTotal = $state(0);
	let gameListLoadingMore = $state(false);
	let gameListSentinel = $state<HTMLDivElement | undefined>(undefined);
	let lastSearchQuery = $state('');

	let leagueId = $state('');
	let draftId = $state('');
	let phase = $state<DraftPhase>('winter');
	let seasonYear = $state('');
	let league = $state<(League & { id: string }) | null>(null);
	let draft = $state<(Draft & { id: string }) | null>(null);

	let isModalOpen = $state(false);
	let modalStep = $state<'type' | 'game' | 'confirm'>('type');
	let gameListLoading = $state(false);
	let detailLoading = $state(false);

	let selectedPickType = $state<DraftPick['pickType'] | null>(null);
	let selectedGameId = $state<string | null>(null);
	let selectedGameName = $state('');
	let detailGame = $state<(Game & { id: string }) | null>(null);

	let gameList = $state<GameListEntry[]>([]);
	let modalSearch = $state('');

	let submitting = $state(false);
	let error = $state('');
	let unsubDraftFn: (() => void) | null = null;

	let gameDetailCacheVersion = $state(0);
	let memberDisplayNames = $state<Map<string, string>>(new Map());
	let gameListScrollTop = $state(0);
	let gameListViewportRef = $state<HTMLDivElement | null>(null);

	const me = $derived(getCurrentUser());
	const isCommissioner = $derived(!!(me && league && league.commissionerId === me.uid));
	const alreadyPickedGameIds = $derived(new Set((draft?.picks ?? []).map((p) => p.gameId)));
	const maxSeasonalPicks = $derived(
		league ? getSeasonalPicksForPlayerCount(league.members.length) : 2
	);
	const totalRounds = $derived(getTotalRoundsForPhase(phase, maxSeasonalPicks));

	const availablePickTypes = $derived.by(() => {
		if (!me || !draft || !isMyTurn) return [];
		return getAllowedPickTypesForUser(draft.picks ?? [], me.uid, maxSeasonalPicks, phase);
	});

	const gameListAvailable = $derived(gameList.filter((g) => !alreadyPickedGameIds.has(g.id)));

	function memberDisplayName(uid: string): string {
		return memberDisplayNames.get(uid)?.trim() || '';
	}

	const allPresent = $derived.by(() => {
		if (!league || !draft) return false;
		const present = draft.presentUserIds ?? [];
		return league.members.every((id) => present.includes(id));
	});

	const currentPickUserId = $derived(draft ? getCurrentPickUserId(draft) : null);
	const isMyTurn = $derived(!!(me && currentPickUserId === me.uid));

	const currentPickUserPresent = $derived(
		!!(currentPickUserId && (draft?.presentUserIds ?? []).includes(currentPickUserId))
	);
	const waitingFor = $derived(
		league?.members.filter((id) => !(draft?.presentUserIds ?? []).includes(id)) ?? []
	);

	const phaseCfg = $derived(PHASE_CONFIG[phase]);

	$effect(() => {
		const params = get(page).params as { id?: string; season?: string };
		leagueId = params?.id ?? '';
		draftId = params?.season ?? '';
		const parsed = parseDraftId(draftId);
		if (parsed) {
			phase = parsed.phase;
			seasonYear = parsed.season;
		}
	});

	$effect(() => {
		if (!leagueId) return;
		getLeague(leagueId).then((l) => (league = l));
	});

	$effect(() => {
		const members = league?.members;
		if (!members?.length) return;
		getDisplayNames(members).then((map) => (memberDisplayNames = map));
	});

	$effect(() => {
		if (!leagueId || !draftId) return;
		unsubDraftFn?.();
		const unsub = subscribeDraft(leagueId, draftId, (d) => (draft = d));
		unsubDraftFn = unsub;
		return () => unsub();
	});

	$effect(() => {
		if (draft?.status === 'completed' && leagueId) {
			goto(`/league/${leagueId}`);
		}
	});

	$effect(() => {
		if (!draft || !me || !leagueId || !draftId) return;
		setPresence(leagueId, draftId, me.uid).catch(() => {});
	});

	$effect(() => {
		if (leagueId && draftId && league) ensureDraft();
	});

	$effect(() => {
		const picks = draft?.picks ?? [];
		for (const pick of picks) {
			if (!pick?.gameId || gameDetailCache.has(pick.gameId)) continue;
			getGame(pick.gameId).then((g) => {
				if (g) {
					gameDetailCache.set(pick.gameId, g);
					gameDetailCacheVersion++;
				}
			});
		}
	});

	onMount(() => {
		const user = getCurrentUser();
		if (!user || !leagueId || !draftId) return;
		const handleLeave = () => {
			removePresence(leagueId, draftId, user.uid).catch(() => {});
		};
		window.addEventListener('beforeunload', handleLeave);
		window.addEventListener('pagehide', handleLeave);
		return () => {
			handleLeave();
			window.removeEventListener('beforeunload', handleLeave);
			window.removeEventListener('pagehide', handleLeave);
		};
	});

	async function ensureDraft() {
		if (!leagueId || !draftId || !league) return;
		const d = await getDraft(leagueId, draftId);
		if (d) {
			draft = d;
		} else if (isCommissioner) {
			await createDraft(leagueId, draftId, phase, league.members);
		}
	}

	async function handleStartDraft() {
		if (!leagueId || !draftId) return;
		await startDraft(leagueId, draftId);
	}

	function startPickProcess() {
		isModalOpen = true;
		modalStep = 'type';
		selectedPickType = null;
		selectedGameId = null;
		detailGame = null;
		modalSearch = '';
		error = '';
	}

	function selectType(type: DraftPick['pickType']) {
		selectedPickType = type;
		modalStep = 'game';
		lastSearchQuery = modalSearch;
		loadGameListFirstPage();
	}

	function getInitials(name: string | undefined | null): string {
		if (!name?.trim()) return '?';
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	function getTomorrowDate(): string {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return d.toISOString().split('T')[0];
	}

	function getDateFilters(): { releaseFrom: string; releaseTo?: string } {
		const tomorrow = getTomorrowDate();
		const year = parseInt(seasonYear);
		const yearEnd = `${year}-12-31`;

		if (selectedPickType === 'seasonalPick') {
			const range = getPhaseReleaseDateRange(phase, year);
			return {
				releaseFrom: range.start > tomorrow ? range.start : tomorrow,
				releaseTo: range.end
			};
		}

		return { releaseFrom: tomorrow, releaseTo: yearEnd };
	}

	async function loadGameListFirstPage() {
		const year = parseInt(seasonYear);
		const search = modalSearch.trim() || undefined;
		const { releaseFrom, releaseTo } = getDateFilters();

		gameListScrollTop = 0;
		gameListLoading = true;
		gameList = [];
		gameListTotal = 0;
		try {
			const { games, total } = await getGameListPage(year, GAME_LIST_PAGE_SIZE, 0, {
				search,
				releaseFrom,
				releaseTo
			});
			gameList = games;
			gameListTotal = total;
		} finally {
			gameListLoading = false;
		}
	}

	async function loadGameListMore() {
		const year = parseInt(seasonYear);
		const search = modalSearch.trim() || undefined;
		const { releaseFrom, releaseTo } = getDateFilters();
		if (gameListLoading || gameListLoadingMore || gameList.length >= gameListTotal) return;

		gameListLoadingMore = true;
		try {
			const { games, total } = await getGameListPage(year, GAME_LIST_PAGE_SIZE, gameList.length, {
				search,
				releaseFrom,
				releaseTo
			});
			gameList = [...gameList, ...games];
			gameListTotal = total;
		} finally {
			gameListLoadingMore = false;
		}
	}

	$effect(() => {
		if (modalStep !== 'game') return;
		if (modalSearch === lastSearchQuery) return;
		const q = modalSearch;
		const t = setTimeout(() => {
			lastSearchQuery = q;
			loadGameListFirstPage();
		}, 300);
		return () => clearTimeout(t);
	});

	$effect(() => {
		const sentinel = gameListSentinel;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const [e] = entries;
				if (
					e?.isIntersecting &&
					modalStep === 'game' &&
					gameList.length > 0 &&
					gameList.length < gameListTotal &&
					!gameListLoadingMore &&
					!gameListLoading
				) {
					loadGameListMore();
				}
			},
			{ rootMargin: '100px', threshold: 0 }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		if (modalStep !== 'game' || !gameListViewportRef) return;
		const saved = gameListScrollTop;
		queueMicrotask(() => {
			if (gameListViewportRef) gameListViewportRef.scrollTop = saved;
		});
	});

	async function openGameDetail(id: string) {
		gameListScrollTop = gameListViewportRef?.scrollTop ?? 0;
		detailLoading = true;
		detailGame = null;
		modalStep = 'confirm';
		try {
			if (gameDetailCache.has(id)) {
				detailGame = gameDetailCache.get(id)!;
			} else {
				const g = await getGame(id);
				if (g) {
					gameDetailCache.set(id, g);
					detailGame = g;
				}
			}
			if (detailGame) {
				selectedGameId = detailGame.id;
				selectedGameName = detailGame.name;
			}
		} finally {
			detailLoading = false;
		}
	}

	async function confirmPick() {
		if (!me || !leagueId || !draftId || !selectedGameId || !selectedPickType) return;
		if (await isGameHidden(selectedGameId)) {
			error = 'That game cannot be drafted.';
			return;
		}
		submitting = true;
		try {
			await submitPick(leagueId, draftId, me.uid, selectedGameId, selectedPickType);
			isModalOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Pick failed';
		} finally {
			submitting = false;
		}
	}

	function formatDateShort(dateStr: string | null): string {
		if (!dateStr) return '—';
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	const pickConfigBase: Record<
		string,
		{ label: string; icon: any; color: string; borderHover: string }
	> = {
		seasonalPick: {
			label: 'Seasonal',
			icon: Snowflake,
			color: 'text-sky-400',
			borderHover: 'hover:border-sky-400/50 hover:bg-sky-400/10'
		},
		hitPick: {
			label: 'Hit',
			icon: Target,
			color: 'text-accent',
			borderHover: 'hover:border-accent/50 hover:bg-accent/10'
		},
		bombPick: {
			label: 'Bomb',
			icon: Bomb,
			color: 'text-destructive',
			borderHover: 'hover:border-destructive/50 hover:bg-destructive/10'
		},
		altPick: {
			label: 'Alt',
			icon: Shuffle,
			color: 'text-purple-400',
			borderHover: 'hover:border-purple-400/50 hover:bg-purple-400/10'
		}
	};

	function getPickDescription(type: string): string {
		if (type === 'seasonalPick')
			return `Pick a game releasing in the ${phaseCfg?.label ?? ''} window`;
		if (type === 'hitPick') return 'Your GOTY prediction — the best performer this year';
		if (type === 'bombPick') return 'A game you think will flop — hurts other players if it bombs';
		if (type === 'altPick')
			return 'Backup pick — activates if one of your games is delisted from Steam';
		return '';
	}

	const pickConfig = pickConfigBase;

	function getPickData(rowIndex: number, colIndex: number, memberId: string) {
		const _v = gameDetailCacheVersion;
		if (!draft || !league) return null;

		const numPlayers = league.members.length;
		let pickIndex: number;

		if (rowIndex % 2 === 0) {
			pickIndex = rowIndex * numPlayers + colIndex;
		} else {
			pickIndex = rowIndex * numPlayers + (numPlayers - 1 - colIndex);
		}

		const pick = draft.picks[pickIndex];

		const snakeOrder = getSnakeOrderForRound(draft.order, draft.currentPick?.round ?? 0);
		const isCurrent =
			!!draft.currentPick &&
			draft.currentPick.round === rowIndex + 1 &&
			snakeOrder[draft.currentPick.position] === memberId;

		let coverUrl: string | undefined = undefined;
		let gameName: string | undefined = undefined;

		if (pick) {
			const cached = gameDetailCache.get(pick.gameId);
			coverUrl = cached?.coverUrl ?? undefined;
			gameName = cached?.name ?? '';
		}

		const roundPickType = getPickTypeForRound(phase, rowIndex + 1, maxSeasonalPicks);

		return { pick, isCurrent, pickIndex, coverUrl, gameName, roundPickType };
	}
</script>

<svelte:head>
	<title>{league?.name ? `${league.name} – ${phaseCfg?.label ?? ''} Draft` : 'Draft Room'}</title>
</svelte:head>

<div class="flex h-[calc(100vh-7rem)] flex-col gap-4 md:h-[calc(100vh-8rem)]">
	{#if !league || !draft}
		<div class="flex h-full flex-col items-center justify-center gap-3">
			<LoaderCircle class="h-8 w-8 animate-spin text-primary" />
			<p class="text-sm text-muted-foreground">Loading draft room...</p>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					onclick={() => goto(`/league/${leagueId}`)}
					class="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="truncate text-lg font-bold tracking-tight sm:text-xl">
							{league.name || ''}
						</h1>
						<Badge variant="outline" class="shrink-0 text-[10px]"
							>{phaseCfg?.label ?? ''} Draft</Badge
						>
					</div>
					<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						{#if draft.status === 'active'}
							<span class="flex items-center gap-1.5 font-medium text-red-400">
								<span class="relative flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-red-400"></span>
								</span>
								LIVE
							</span>
						{:else}
							<span>Status: {draft.status}</span>
						{/if}
						{#if !currentPickUserPresent && draft.status === 'active'}
							<span class="font-medium text-yellow-500">Current picker away</span>
						{/if}
						<span>
							{phaseCfg?.releaseStart(parseInt(seasonYear)).slice(5)} — {phaseCfg
								?.releaseEnd(parseInt(seasonYear))
								.slice(5)}
						</span>
					</div>
				</div>
			</div>
			{#if isCommissioner && draft.status === 'pending'}
				<Button onclick={handleStartDraft} disabled={!allPresent} class="glow-sm-primary gap-2">
					<Play class="h-4 w-4" /> Start Draft
				</Button>
			{/if}
		</div>

		{#if draft.status === 'pending'}
			<!-- Waiting Room -->
			<div class="flex flex-1 items-center justify-center">
				<div class="glass w-full max-w-md rounded-xl p-6 text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10"
					>
						<Zap class="h-6 w-6 text-primary" />
					</div>
					<h2 class="text-lg font-semibold">Waiting for Players</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						{#if waitingFor.length > 0}
							Waiting for {waitingFor.length} {waitingFor.length === 1 ? 'player' : 'players'}
						{:else}
							Everyone is here! The commissioner can start the draft.
						{/if}
					</p>
					<div class="mt-5 grid grid-cols-2 gap-2">
						{#each league.members as memberId}
							{@const present = !waitingFor.includes(memberId)}
							<div
								class="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors {present
									? 'border-accent/30 bg-accent/[0.06]'
									: 'border-white/[0.06] bg-white/[0.02]'}"
							>
								<span class="max-w-[110px] truncate text-sm font-medium">
									{memberDisplayName(memberId) || '…'}
								</span>
								{#if present}
									<span class="flex h-2 w-2 rounded-full bg-accent"></span>
								{:else}
									<span class="flex h-2 w-2 animate-pulse rounded-full bg-muted-foreground/40"
									></span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else}
			<!-- Draft Board -->
			<div
				class="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-card/30"
			>
				<ScrollArea class="min-h-0 flex-1" orientation="both">
					<!-- Column headers -->
					<div
						class="sticky top-0 z-10 flex min-w-max gap-2 border-b border-white/[0.06] p-2 backdrop-blur"
						style="background: oklch(0.15 0.03 250 / 0.9)"
					>
						<div class="flex w-16 shrink-0 items-center justify-center sm:w-20"></div>
						{#each league.members as memberId}
							{@const isMe = me?.uid === memberId}
							{@const isCurrentPickColumn = currentPickUserId === memberId}
							<div
								class="flex min-w-[160px] flex-1 items-center justify-center gap-2 rounded-lg border px-2 py-2 transition-all sm:min-w-[180px] {isCurrentPickColumn
									? 'glow-sm-primary border-primary/30 bg-primary/[0.08]'
									: 'border-white/[0.06] bg-white/[0.03]'}"
							>
								<Avatar.Root class="h-7 w-7 shrink-0">
									<Avatar.Fallback
										class="text-[10px] {isMe ? 'bg-primary text-primary-foreground' : ''}"
									>
										{getInitials(memberDisplayName(memberId))}
									</Avatar.Fallback>
								</Avatar.Root>
								<p
									class="truncate text-sm font-medium {isMe ? 'text-primary' : ''}"
									title={memberDisplayName(memberId) || undefined}
								>
									{memberDisplayName(memberId) || '…'}
								</p>
							</div>
						{/each}
					</div>

					<!-- Grid rows -->
					<div class="flex flex-col gap-2 p-2">
						{#each Array(totalRounds) as _, rowIndex}
							{@const __cache = gameDetailCacheVersion}
							{@const roundType = getPickTypeForRound(phase, rowIndex + 1, maxSeasonalPicks)}
							{@const roundCfg = pickConfig[roundType]}
							<div class="flex min-w-max gap-2">
								<div
									class="flex w-16 shrink-0 flex-col items-center justify-center text-center sm:w-20"
								>
									{#if roundCfg}
										{@const Icon = roundCfg.icon}
										<Icon class="h-4 w-4 {roundCfg.color}" />
										<span
											class="mt-0.5 text-[9px] font-semibold tracking-tight text-muted-foreground uppercase"
										>
											{roundCfg.label}
										</span>
									{/if}
								</div>
								{#each league.members as memberId, colIndex}
									{@const data = getPickData(rowIndex, colIndex, memberId)}
									{@const isMyCell = me?.uid === memberId}
									{@const isActive = data?.isCurrent}
									{@const hasPick = !!data?.pick}
									{@const isCurrentPickColumn = currentPickUserId === memberId}

									<div
										class="group relative min-h-[90px] min-w-[160px] flex-1 overflow-hidden rounded-lg border transition-all sm:min-h-[100px] sm:min-w-[180px]
										{isActive ? 'animate-glow-pulse border-primary/50 ring-1 ring-primary/30' : 'border-white/[0.06]'}
										{isCurrentPickColumn && !isActive
											? 'bg-primary/[0.03]'
											: hasPick
												? 'bg-card/50'
												: 'bg-white/[0.01]'}"
									>
										{#if hasPick && data?.pick}
											{@const config = pickConfig[data.pick.pickType] || {
												icon: CircleQuestionMark,
												color: 'text-gray-500',
												label: '?'
											}}
											{@const Icon = config.icon}
											<div class="absolute inset-0 flex">
												<div
													class="flex w-1/3 flex-col items-center justify-center gap-1 border-r border-white/[0.06] bg-white/[0.02]"
												>
													<Icon class="h-4 w-4 {config.color}" />
													<span
														class="text-[8px] font-semibold tracking-tight text-muted-foreground uppercase"
														>{config.label}</span
													>
												</div>
												<div
													class="relative flex w-2/3 items-center justify-center overflow-hidden"
												>
													{#if data.coverUrl}
														<img
															src={data.coverUrl}
															alt=""
															class="absolute inset-0 h-full w-full object-cover"
														/>
														<div
															class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
														></div>
														<span
															class="absolute right-1 bottom-1 left-1.5 line-clamp-2 text-[10px] leading-tight font-medium text-white"
														>
															{data.gameName || '…'}
														</span>
													{:else}
														<div
															class="flex h-full w-full items-center justify-center p-1.5 text-center"
														>
															<span
																class="line-clamp-3 text-[10px] font-medium text-muted-foreground"
																>{data.gameName || '…'}</span
															>
														</div>
													{/if}
												</div>
											</div>
										{:else if isActive}
											<div class="absolute inset-0 flex items-center justify-center">
												{#if isMyCell && isMyTurn}
													<Button
														size="sm"
														onclick={startPickProcess}
														class="glow-primary gap-1.5 font-semibold"
													>
														<Zap class="h-3.5 w-3.5" /> Make Pick
													</Button>
												{:else}
													<div class="flex flex-col items-center gap-1">
														<div class="h-1.5 w-1.5 animate-ping rounded-full bg-primary"></div>
														<span class="text-[10px] font-medium text-muted-foreground"
															>Picking...</span
														>
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</ScrollArea>
			</div>
		{/if}
	{/if}

	<!-- Pick Modal -->
	<Dialog.Root bind:open={isModalOpen}>
		<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-2xl">
			<div class="border-b border-white/[0.06] p-5 pb-3">
				<Dialog.Title class="text-lg font-semibold">
					{#if modalStep === 'type'}
						Select Pick Type
					{:else if modalStep === 'game'}
						Select Game
					{:else}
						Confirm Selection
					{/if}
				</Dialog.Title>
				{#if modalStep !== 'type'}
					<Button
						variant="ghost"
						size="sm"
						class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
						onclick={() => (modalStep = modalStep === 'confirm' ? 'game' : 'type')}
					>
						<ArrowLeft class="h-3 w-3" /> Back
					</Button>
				{/if}
			</div>

			<div class="flex h-[420px] flex-col overflow-hidden">
				{#if modalStep === 'type'}
					<div class="overflow-y-auto p-5">
						<div class="grid h-full min-h-[340px] grid-cols-2 content-center gap-3">
							{#each availablePickTypes as type}
								{@const conf = pickConfig[type]}
								{#if conf}
									{@const Icon = conf.icon}
									<button
										class="group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-white/[0.06] bg-white/[0.02] p-5 transition-all {conf.borderHover}"
										onclick={() => selectType(type)}
									>
										<Icon class="size-9 {conf.color} transition-transform group-hover:scale-110" />
										<span class="text-base font-bold {conf.color}">{conf.label}</span>
										<span class="text-center text-[11px] leading-relaxed text-muted-foreground"
											>{getPickDescription(type)}</span
										>
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{:else if modalStep === 'game'}
					<div class="flex min-h-0 flex-1 flex-col">
						<div class="shrink-0 border-b border-white/[0.06] px-5 py-3">
							<div class="relative">
								<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search games..."
									class="pl-9"
									bind:value={modalSearch}
									autofocus
								/>
							</div>
							<p class="mt-2 text-[11px] text-muted-foreground">
								{#if selectedPickType === 'seasonalPick'}
									Showing {phaseCfg?.label ?? ''} games ({phaseCfg
										?.releaseStart(parseInt(seasonYear))
										.slice(5)} — {phaseCfg?.releaseEnd(parseInt(seasonYear)).slice(5)})
								{:else}
									All unreleased games for {seasonYear}
								{/if}
							</p>
						</div>
						{#if gameListLoading}
							<div class="flex flex-1 items-center justify-center">
								<LoaderCircle class="animate-spin text-primary" />
							</div>
						{:else}
							<ScrollArea class="min-h-0 flex-1" bind:viewportRef={gameListViewportRef}>
								<div class="p-3">
									<div class="grid grid-cols-1 gap-0.5">
										{#each gameListAvailable as game}
											<button
												class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
												onclick={() => openGameDetail(game.id)}
											>
												<span class="text-sm font-medium">{game.name}</span>
												<span class="shrink-0 pl-3 font-mono text-xs text-muted-foreground"
													>{formatDateShort(game.releaseDate)}</span
												>
											</button>
										{/each}
									</div>
									<div bind:this={gameListSentinel} class="h-4 w-full" role="presentation"></div>
									{#if gameListLoadingMore}
										<div class="py-3 text-center text-xs text-muted-foreground">Loading more…</div>
									{:else if gameList.length > 0 && gameList.length < gameListTotal}
										<div class="py-2 text-center text-[10px] text-muted-foreground">
											{gameList.length} of {gameListTotal}
										</div>
									{/if}
								</div>
							</ScrollArea>
						{/if}
					</div>
				{:else if modalStep === 'confirm'}
					<div class="flex min-h-0 flex-1 flex-col">
						<GameDetailDialog embedded game={detailGame} loading={detailLoading}>
							{#snippet footer()}
								<div
									class="flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] p-4"
								>
									<div class="flex items-center gap-3">
										{#if selectedPickType && pickConfig[selectedPickType]}
											{@const conf = pickConfig[selectedPickType]}
											{@const Icon = conf.icon}
											<div class="rounded-full border border-white/[0.08] bg-white/[0.03] p-2">
												<Icon class="h-5 w-5 {conf.color}" />
											</div>
											<div>
												<p class="text-[10px] font-semibold text-muted-foreground uppercase">
													Drafting as
												</p>
												<p class="text-sm font-medium">{conf.label} Pick</p>
											</div>
										{/if}
									</div>
									<Button
										size="lg"
										onclick={confirmPick}
										disabled={submitting}
										class="glow-sm-primary px-6"
									>
										{submitting ? 'Submitting...' : 'Confirm Pick'}
									</Button>
								</div>
								{#if error}
									<p class="mt-2 text-center text-sm text-destructive">{error}</p>
								{/if}
							{/snippet}
						</GameDetailDialog>
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
</div>
