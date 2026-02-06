<script lang="ts">
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
		skipCurrentPick,
		submitPick,
		getCurrentPickUserId,
		getSnakeOrderForRound,
		getDisplayNames,
		getAllowedPickTypesForUser
	} from '$lib/db';
	import type { Draft, DraftPick, League, Game, GameListEntry } from '$lib/db';
	import { onMount } from 'svelte';

	// UI Components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import { GameDetailDialog } from '$lib/components/game-detail-dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Avatar from '$lib/components/ui/avatar';

	// Icons
	import {
		LoaderCircle,
		Search,
		ArrowLeft,
		Snowflake,
		Target,
		Bomb,
		Shuffle,
		CircleQuestionMark
	} from '@lucide/svelte';

	// -----------------------------------------------------------------------
	// State & Setup
	// -----------------------------------------------------------------------

	const gameDetailCache = new Map<string, Game & { id: string }>();

	// Modal game list pagination
	const GAME_LIST_PAGE_SIZE = 24;
	let gameListTotal = $state(0);
	let gameListLoadingMore = $state(false);
	let gameListSentinel = $state<HTMLDivElement | undefined>(undefined);
	let lastSearchQuery = $state('');

	let leagueId = $state('');
	let season = $state('');
	let league = $state<(League & { id: string }) | null>(null);
	let draft = $state<(Draft & { id: string }) | null>(null);

	// Modal State
	let isModalOpen = $state(false);
	let modalStep = $state<'type' | 'game' | 'confirm'>('type');
	let gameListLoading = $state(false);
	let detailLoading = $state(false);

	// Selection State
	let selectedPickType = $state<DraftPick['pickType'] | null>(null);
	let selectedGameId = $state<string | null>(null);
	let selectedGameName = $state('');
	let detailGame = $state<(Game & { id: string }) | null>(null);

	// Search
	let gameList = $state<GameListEntry[]>([]);
	let modalSearch = $state('');

	let submitting = $state(false);
	let error = $state('');
	let unsubDraftFn: (() => void) | null = null;

	// Bump when we load game details for picks so grid re-renders with names/covers
	let gameDetailCacheVersion = $state(0);

	// Display names for league members (uid -> displayName)
	let memberDisplayNames = $state<Map<string, string>>(new Map());

	// -----------------------------------------------------------------------
	// Derived Values
	// -----------------------------------------------------------------------

	const me = $derived(getCurrentUser());
	const isCommissioner = $derived(!!(me && league && league.commissionerId === me.uid));
	const alreadyPickedGameIds = $derived(new Set((draft?.picks ?? []).map((p) => p.gameId)));
	const maxSeasonalPicks = $derived(league?.settings?.seasonalPicks ?? 6);
	const totalRounds = $derived(3 + maxSeasonalPicks);

	// Calculate allowed picks for the current turn only
	const availablePickTypes = $derived.by(() => {
		if (!me || !draft || !isMyTurn) return [];
		return getAllowedPickTypesForUser(draft.picks ?? [], me.uid, maxSeasonalPicks);
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

	// -----------------------------------------------------------------------
	// Lifecycle & Subscriptions
	// -----------------------------------------------------------------------

	$effect(() => {
		const params = get(page).params as { id?: string; season?: string };
		leagueId = params?.id ?? '';
		season = params?.season ?? '';
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
		if (!leagueId || !season) return;
		unsubDraftFn?.();
		const unsub = subscribeDraft(leagueId, season, (d) => (draft = d));
		unsubDraftFn = unsub;
		return () => unsub();
	});

	$effect(() => {
		if (!draft || !me || !leagueId || !season) return;
		// Just fire and forget, don't await in effect
		setPresence(leagueId, season, me.uid).catch(() => {});
	});

	// Ensure draft exists
	$effect(() => {
		if (leagueId && season && league) {
			ensureDraft();
		}
	});

	// Preload game details
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
		if (!user || !leagueId || !season) return;

		const handleLeave = () => {
			// Use navigator.sendBeacon if possible for reliability,
			// otherwise just fire the promise
			removePresence(leagueId, season, user.uid).catch(() => {});
		};

		window.addEventListener('beforeunload', handleLeave);
		window.addEventListener('pagehide', handleLeave);

		return () => {
			handleLeave();
			window.removeEventListener('beforeunload', handleLeave);
			window.removeEventListener('pagehide', handleLeave);
		};
	});

	// -----------------------------------------------------------------------
	// Actions
	// -----------------------------------------------------------------------

	async function ensureDraft() {
		if (!leagueId || !season || !league) return;
		// Check availability first to avoid unnecessary creates
		const d = await getDraft(leagueId, season);
		if (d) {
			draft = d;
		} else if (isCommissioner) {
			await createDraft(leagueId, season, league.members);
			// Draft subscription will catch the update
		}
	}

	async function handleStartDraft() {
		if (!leagueId || !season || !league) return;
		await startDraft(leagueId, season);
	}

	async function handleSkip() {
		if (!isCommissioner || !leagueId || !season) return;
		await skipCurrentPick(leagueId, season);
	}

	// -----------------------------------------------------------------------
	// Modal & Selection Logic
	// -----------------------------------------------------------------------

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

	function getReleaseFromDate(): string {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return (
			d.getFullYear() +
			'-' +
			String(d.getMonth() + 1).padStart(2, '0') +
			'-' +
			String(d.getDate()).padStart(2, '0')
		);
	}

	async function loadGameListFirstPage() {
		const year = new Date().getFullYear();
		const search = modalSearch.trim() || undefined;
		gameListLoading = true;
		gameList = [];
		gameListTotal = 0;
		try {
			const { games, total } = await getGameListPage(year, GAME_LIST_PAGE_SIZE, 0, {
				search,
				releaseFrom: getReleaseFromDate()
			});
			gameList = games;
			gameListTotal = total;
		} finally {
			gameListLoading = false;
		}
	}

	async function loadGameListMore() {
		const year = new Date().getFullYear();
		const search = modalSearch.trim() || undefined;
		if (gameListLoading || gameListLoadingMore || gameList.length >= gameListTotal) return;

		gameListLoadingMore = true;
		try {
			const { games, total } = await getGameListPage(year, GAME_LIST_PAGE_SIZE, gameList.length, {
				search,
				releaseFrom: getReleaseFromDate()
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

	async function openGameDetail(id: string) {
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
		if (!me || !leagueId || !season || !selectedGameId || !selectedPickType) return;

		if (await isGameHidden(selectedGameId)) {
			error = 'That game cannot be drafted.';
			return;
		}

		submitting = true;
		try {
			// This now handles both submitting AND advancing safely
			await submitPick(leagueId, season, me.uid, selectedGameId, selectedPickType);
			isModalOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Pick failed';
		} finally {
			submitting = false;
		}
	}

	// -----------------------------------------------------------------------
	// Helpers & Formatters
	// -----------------------------------------------------------------------

	function formatDateShort(dateStr: string | null): string {
		if (!dateStr) return '—';
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	const pickConfig: Record<
		string,
		{ label: string; icon: any; color: string; borderHover: string }
	> = {
		seasonalPick: {
			label: 'Seasonal',
			icon: Snowflake,
			color: 'text-sky-400',
			borderHover: 'hover:border-sky-400 hover:bg-sky-400/10'
		},
		hitPick: {
			label: 'Hit',
			icon: Target,
			color: 'text-accent',
			borderHover: 'hover:border-accent hover:bg-accent/10'
		},
		bustPick: {
			label: 'Bomb',
			icon: Bomb,
			color: 'text-destructive',
			borderHover: 'hover:border-destructive hover:bg-destructive/10'
		},
		altPick: {
			label: 'Alt',
			icon: Shuffle,
			color: 'text-purple-400',
			borderHover: 'hover:border-purple-400 hover:bg-purple-400/10'
		}
	};

	function getPickData(rowIndex: number, colIndex: number, memberId: string) {
		const _v = gameDetailCacheVersion;
		if (!draft || !league) return null;

		const numPlayers = league.members.length;
		let pickIndex: number;

		// Snake Logic
		if (rowIndex % 2 === 0) {
			pickIndex = rowIndex * numPlayers + colIndex;
		} else {
			pickIndex = rowIndex * numPlayers + (numPlayers - 1 - colIndex);
		}

		const pick = draft.picks[pickIndex];

		// Determine if this cell is the "current" active pick
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

		return { pick, isCurrent, pickIndex, coverUrl, gameName };
	}
</script>

<svelte:head>
	<title>{league?.name ? `${league.name} – Draft` : ''}</title>
</svelte:head>

<div class="flex h-[calc(100vh-8rem)] flex-col space-y-6">
	{#if !league || !draft}
		<div class="flex h-full flex-col items-center justify-center">
			<LoaderCircle class="mb-4 h-10 w-10 animate-spin text-primary" />
			<p class="text-muted-foreground">Loading draft room...</p>
		</div>
	{:else}
		<div class="flex flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-inner">
			<ScrollArea class="min-h-0 flex-1" orientation="both">
				<div class="sticky top-0 z-10 flex min-w-max gap-3 border-b bg-muted/90 p-3 backdrop-blur">
					{#each league.members as memberId}
						{@const isMe = me?.uid === memberId}
						{@const isCurrentPickColumn = currentPickUserId === memberId}
						<div
							class="flex min-w-[200px] flex-1 items-center justify-center rounded-lg border px-2 py-2 shadow-sm {isCurrentPickColumn
								? 'border-primary/30 bg-primary/10'
								: 'bg-card'}"
						>
							<div class="flex max-w-full min-w-0 items-center gap-2">
								<Avatar.Root class="h-8 w-8 shrink-0">
									<Avatar.Fallback class={isMe ? 'bg-primary text-primary-foreground' : ''}
										>{getInitials(memberDisplayName(memberId))}</Avatar.Fallback
									>
								</Avatar.Root>
								<div class="min-w-0 overflow-hidden">
									<p
										class="truncate text-sm font-medium {isMe ? 'text-primary' : ''}"
										title={memberDisplayName(memberId) || undefined}
									>
										{memberDisplayName(memberId) || '…'}
									</p>
								</div>
							</div>
						</div>
					{/each}
				</div>

				<div class="flex flex-col gap-3 p-3">
					{#each Array(totalRounds) as _, rowIndex}
						{@const __cache = gameDetailCacheVersion}
						<div class="flex min-w-max gap-3">
							{#each league.members as memberId, colIndex}
								{@const data = getPickData(rowIndex, colIndex, memberId)}
								{@const isMyCell = me?.uid === memberId}
								{@const isActive = data?.isCurrent}
								{@const hasPick = !!data?.pick}
								{@const isCurrentPickColumn = currentPickUserId === memberId}

								<div
									class="group relative min-h-[100px] min-w-[200px] flex-1 overflow-hidden rounded-lg border shadow-sm transition-colors {isActive
										? 'ring-2 ring-primary ring-inset'
										: 'border-border'} {isCurrentPickColumn
										? 'bg-primary/5'
										: hasPick
											? 'bg-card'
											: 'bg-muted/5'}"
								>
									{#if hasPick && data?.pick}
										{@const config = pickConfig[data.pick.pickType] || {
											icon: CircleQuestionMark,
											color: 'text-gray-500',
											label: 'Unknown'
										}}
										{@const Icon = config.icon}
										<div class="absolute inset-0 flex">
											<div
												class="flex w-1/2 flex-col items-center justify-center gap-1 border-r bg-muted/20"
											>
												<Icon class="h-5 w-5 {config.color}" />
												<span
													class="text-[9px] font-semibold tracking-tighter text-muted-foreground uppercase"
													>{config.label}</span
												>
											</div>
											<div
												class="relative flex w-1/2 items-center justify-center overflow-hidden p-2"
											>
												{#if data.coverUrl}
													<img
														src={data.coverUrl}
														alt=""
														class="absolute inset-0 h-full w-full object-cover"
													/>
													<div
														class="absolute inset-0 bg-linear-to-t from-black/80 to-transparent"
													></div>
													<span
														class="absolute bottom-1 left-2 line-clamp-1 text-[10px] font-medium text-white"
														>{data.gameName || '…'}</span
													>
												{:else}
													<div
														class="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-muted-foreground/20 p-1 text-center"
													>
														<span class="line-clamp-3 text-xs font-medium text-muted-foreground"
															>{data.gameName || '…'}</span
														>
													</div>
												{/if}
											</div>
										</div>
									{:else if isActive}
										<div class="absolute inset-0 flex items-center justify-center">
											{#if isMyCell && isMyTurn}
												<Button size="sm" onclick={startPickProcess}>Make Pick</Button>
											{:else}
												<span class="animate-pulse text-xs font-medium text-muted-foreground"
													>Picking...</span
												>
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

	<Dialog.Root bind:open={isModalOpen}>
		<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-2xl">
			<div class="border-b p-6 pb-4">
				<Dialog.Title class="text-xl">
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

			<div class="flex h-[400px] flex-col overflow-hidden">
				{#if modalStep === 'type'}
					<div class="overflow-y-auto p-6">
						<div class="grid h-full min-h-[320px] grid-cols-2 content-center gap-4">
							{#each availablePickTypes as type}
								{@const conf = pickConfig[type]}
								{#if conf}
									{@const Icon = conf.icon}
									<Button
										variant="outline"
										class="group flex h-auto flex-col items-center justify-center gap-3 rounded-xl border-2 border-muted bg-card p-6 transition-all {conf.borderHover}"
										onclick={() => selectType(type)}
									>
										<Icon class="size-10 {conf.color} transition-transform group-hover:scale-110" />
										<span class="text-lg font-bold {conf.color}">{conf.label}</span>
									</Button>
								{/if}
							{/each}
						</div>
					</div>
				{:else if modalStep === 'game'}
					<div class="flex min-h-0 flex-1 flex-col">
						<div class="flex-shrink-0 border-b bg-background px-6 py-4">
							<div class="relative">
								<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search games..."
									class="pl-9"
									bind:value={modalSearch}
									autofocus
								/>
							</div>
						</div>
						{#if gameListLoading}
							<div class="flex flex-1 items-center justify-center">
								<LoaderCircle class="animate-spin text-primary" />
							</div>
						{:else}
							<ScrollArea class="min-h-0 flex-1">
								<div class="px-6 py-4">
									<div class="grid grid-cols-1 gap-1">
										{#each gameListAvailable as game}
											<Button
												variant="ghost"
												class="group h-auto justify-between rounded-md p-3 text-left font-normal transition-colors duration-150 hover:bg-muted/50 hover:text-foreground dark:hover:bg-muted/40"
												onclick={() => openGameDetail(game.id)}
											>
												<span
													class="font-medium transition-colors duration-150 group-hover:text-foreground"
													>{game.name}</span
												>
												<span class="font-mono text-xs text-muted-foreground"
													>{formatDateShort(game.releaseDate)}</span
												>
											</Button>
										{/each}
									</div>
									<div bind:this={gameListSentinel} class="h-4 w-full" role="presentation"></div>
									{#if gameListLoadingMore}
										<div class="py-3 text-center text-sm text-muted-foreground">Loading more…</div>
									{:else if gameList.length > 0 && gameList.length < gameListTotal}
										<div class="py-2 text-center text-xs text-muted-foreground">
											{gameList.length} of {gameListTotal} games
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
									class="flex w-full items-center justify-between rounded-lg border bg-muted/20 p-4"
								>
									<div class="flex items-center gap-3">
										{#if selectedPickType && pickConfig[selectedPickType]}
											{@const conf = pickConfig[selectedPickType]}
											{@const Icon = conf.icon}
											<div class="rounded-full border bg-background p-2">
												<Icon class="h-5 w-5 {conf.color}" />
											</div>
											<div>
												<p class="text-xs font-semibold text-muted-foreground uppercase">
													Drafting as
												</p>
												<p class="font-medium">{conf.label} Pick</p>
											</div>
										{/if}
									</div>
									<Button size="lg" onclick={confirmPick} disabled={submitting} class="px-8">
										{submitting ? 'Submitting...' : 'Confirm Pick'}
									</Button>
								</div>
								{#if error}
									<p class="text-center text-sm text-destructive">{error}</p>
								{/if}
							{/snippet}
						</GameDetailDialog>
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
</div>
