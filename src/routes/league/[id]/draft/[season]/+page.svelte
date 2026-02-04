<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import {
		getLeague,
		getGameList,
		getGame,
		isGameHidden,
		createDraft,
		getDraft,
		subscribeDraft,
		setPresence,
		removePresence,
		startDraft,
		advanceToNextPick,
		submitPick,
		getCurrentPickUserId,
		getSnakeOrderForRound
	} from '$lib/db';
	import type { Draft, DraftPick, League, Game, GameListEntry } from '$lib/db';
	import { onMount } from 'svelte';

	// UI Components
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
	import * as Avatar from '$lib/components/ui/avatar';

	// Icons
	import {
		Loader2,
		Play,
		SkipForward,
		Plus,
		Search,
		ArrowLeft,
		Snowflake,
		Target,
		Bomb,
		Shuffle,
		HelpCircle,
		Trophy
	} from '@lucide/svelte';

	// -----------------------------------------------------------------------
	// State & Setup
	// -----------------------------------------------------------------------

	// Cache
	const gameListCache = new Map<number, GameListEntry[]>();
	const gameDetailCache = new Map<string, Game & { id: string }>();

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

	// -----------------------------------------------------------------------
	// Derived Values
	// -----------------------------------------------------------------------

	const me = $derived(getCurrentUser());
	const isCommissioner = $derived(!!(me && league && league.commissionerId === me.uid));

	const filteredGameList = $derived(
		gameList.filter((g) => g.name.toLowerCase().includes(modalSearch.toLowerCase()))
	);

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

	// -----------------------------------------------------------------------
	// Lifecycle & Subscriptions
	// -----------------------------------------------------------------------

	$effect(() => {
		const params = get(page).params as { id?: string; season?: string };
		leagueId = params?.id ?? '';
		season = params?.season ?? '';
	});

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) goto('/');
		});
		return unsub;
	});

	$effect(() => {
		if (!leagueId) return;
		getLeague(leagueId).then((l) => (league = l));
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
		setPresence(leagueId, season, me.uid);
	});

	$effect(() => {
		ensureDraft();
	});

	// Preload game details for all picks so everyone sees names/covers (and after refresh)
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
		let d = await getDraft(leagueId, season);
		if (!d && isCommissioner) {
			await createDraft(leagueId, season, league.members);
			d = await getDraft(leagueId, season);
		}
		if (d) draft = d;
	}

	async function handleStartDraft() {
		if (!leagueId || !season || !league) return;
		await ensureDraft();
		await startDraft(leagueId, season);
	}

	async function handleSkip() {
		if (!isCommissioner || !leagueId || !season) return;
		await advanceToNextPick(leagueId, season, { skipCurrent: true });
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
		loadGameList();
	}

	async function loadGameList() {
		const year = new Date().getFullYear();
		if (gameListCache.has(year)) {
			gameList = gameListCache.get(year)!;
			return;
		}
		gameListLoading = true;
		try {
			const list = await getGameList(year);
			gameListCache.set(year, list);
			gameList = list;
		} finally {
			gameListLoading = false;
		}
	}

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
			await submitPick(leagueId, season, me.uid, selectedGameId, selectedPickType);
			await advanceToNextPick(leagueId, season);
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

	function formatDateShort(dateStr: string | null) {
		if (!dateStr) return 'TBA';
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Pick Type Config
	const pickConfig: Record<string, { label: string; icon: any; color: string }> = {
		seasonalPick: { label: 'Seasonal', icon: Snowflake, color: 'text-sky-400' },
		hitPick: { label: 'Hit', icon: Target, color: 'text-accent' },
		bustPick: { label: 'Bust', icon: Bomb, color: 'text-destructive' },
		altPick: { label: 'Alt', icon: Shuffle, color: 'text-purple-400' }
	};

	function getPickData(rowIndex: number, colIndex: number, memberId: string) {
		if (!draft || !league) return null;

		const numPlayers = league.members.length;

		// Snake Logic Calculation (global index into draft.picks)
		let pickIndex: number;
		if (rowIndex % 2 === 0) {
			pickIndex = rowIndex * numPlayers + colIndex;
		} else {
			pickIndex = rowIndex * numPlayers + (numPlayers - 1 - colIndex);
		}

		const pick = draft.picks[pickIndex];
		// currentPick.position is index within the round (0..numPlayers-1), not global pick index
		const snakeOrder = getSnakeOrderForRound(draft.order, draft.currentPick?.round ?? 0);
		const isCurrent =
			!!draft.currentPick &&
			draft.currentPick.round === rowIndex + 1 &&
			(snakeOrder[draft.currentPick.position] === memberId);

		let coverUrl: string | undefined = undefined;
		let gameName: string | undefined = undefined;

		if (pick) {
			const cached = gameDetailCache.get(pick.gameId);
			coverUrl = cached?.coverUrl ?? undefined;
			gameName = cached?.name ?? pick.gameId;
		}

		return { pick, isCurrent, pickIndex, coverUrl, gameName };
	}

	const totalRounds = 6; // Configurable based on league settings? Defaulting to 6 rows.
</script>

<svelte:head><title>Draft Room</title></svelte:head>

<div class="flex h-[calc(100vh-8rem)] flex-col space-y-6">
	{#if !league || !draft}
		<div class="flex h-full flex-col items-center justify-center">
			<Loader2 class="mb-4 h-10 w-10 animate-spin text-primary" />
			<p class="text-muted-foreground">Loading draft room...</p>
		</div>
	{:else}
		<div class="flex shrink-0 items-center justify-between">
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-2xl font-bold tracking-tight">{league.name}</h1>
					<Badge variant="outline">Season {season}</Badge>
				</div>
				<div class="mt-1 flex gap-4 text-sm text-muted-foreground">
					{#if draft.status === 'active'}
						<span class="flex items-center gap-1.5 text-accent"
							><div class="h-2 w-2 animate-pulse rounded-full bg-accent"></div>
							 Live Draft</span
						>
					{:else}
						<span>Status: {draft.status}</span>
					{/if}
					{#if !currentPickUserPresent && draft.status === 'active'}
						<span class="flex items-center gap-1 font-medium text-yellow-500"
							><HelpCircle class="h-3 w-3" /> Current picker away</span
						>
					{/if}
				</div>
			</div>

			<div class="flex gap-2">
				{#if isCommissioner && draft.status === 'pending'}
					<Button onclick={handleStartDraft} disabled={!allPresent} class="gap-2">
						<Play class="h-4 w-4" /> Start Draft
					</Button>
				{:else if isCommissioner && draft.status === 'active' && !currentPickUserPresent}
					<Button variant="secondary" onclick={handleSkip} class="gap-2">
						<SkipForward class="h-4 w-4" /> Force Skip
					</Button>
				{/if}
				<Button variant="outline" href="/league/{leagueId}">Exit</Button>
			</div>
		</div>

		{#if draft.status === 'pending'}
			<div class="flex flex-1 items-center justify-center">
				<Card class="w-full max-w-md">
					<CardContent class="space-y-6 pt-6 text-center">
						<div class="space-y-2">
							<h2 class="text-xl font-semibold">Waiting for Players</h2>
							<p class="text-sm text-muted-foreground">
								The draft will begin when everyone is present.
							</p>
						</div>

						<div class="grid grid-cols-2 gap-3 text-left">
							{#each league.members as memberId}
								{@const present = (draft.presentUserIds ?? []).includes(memberId)}
								<div
									class="flex items-center justify-between rounded-md border p-2 {present
										? 'border-accent/50 bg-accent/10'
										: 'border-transparent bg-muted/50'}"
								>
									<span class="max-w-[100px] truncate text-sm font-medium">{memberId}</span>
									<Badge variant={present ? 'default' : 'secondary'} class="h-5 text-[10px]">
										{present ? 'Ready' : 'Waiting'}
									</Badge>
								</div>
							{/each}
						</div>
					</CardContent>
				</Card>
			</div>
		{:else}
			<div class="flex flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-inner">
				<div class="flex shrink-0 divide-x divide-border overflow-hidden border-b bg-muted/40 pr-4">
					{#each league.members as memberId}
						{@const isMe = me?.uid === memberId}
						<div class="flex min-w-[160px] flex-1 items-center gap-3 p-3">
							<Avatar.Root class="h-8 w-8">
								<Avatar.Fallback class={isMe ? 'bg-primary text-primary-foreground' : ''}
									>{memberId.slice(0, 2).toUpperCase()}</Avatar.Fallback
								>
							</Avatar.Root>
							<div class="overflow-hidden">
								<p class="truncate text-sm font-medium {isMe ? 'text-primary' : ''}">{memberId}</p>
							</div>
						</div>
					{/each}
				</div>

				<ScrollArea class="flex-1">
					<div class="flex flex-col">
						{#each Array(totalRounds) as _, rowIndex}
							{@const __cache = gameDetailCacheVersion}
							<div class="flex min-h-[100px] divide-x divide-border border-b last:border-0">
								{#each league.members as memberId, colIndex}
									{@const data = getPickData(rowIndex, colIndex, memberId)}
									{@const isMyCell = me?.uid === memberId}
									{@const isActive = data?.isCurrent}
									{@const hasPick = !!data?.pick}
									{@const isSnakeTurn = rowIndex % 2 !== 0}

									<div
										class="group relative min-w-[160px] flex-1 transition-colors
											{isActive ? 'bg-primary/5 ring-2 ring-primary ring-inset' : ''}
											{hasPick ? 'bg-card' : 'bg-muted/5'}
										"
									>
										{#if colIndex === 0}
											<span
												class="absolute top-1 left-1 font-mono text-[10px] text-muted-foreground/30"
												>R{rowIndex + 1}</span
											>
										{/if}

										{#if hasPick && data?.pick}
											{@const config = pickConfig[data.pick.pickType] || {
												icon: HelpCircle,
												color: 'text-gray-500',
												label: 'Unknown'
											}}
											{@const Icon = config.icon}

											<div class="absolute inset-0 flex">
												<div
													class="flex w-1/3 flex-col items-center justify-center gap-1 border-r bg-muted/20"
												>
													<Icon class="h-5 w-5 {config.color}" />
													<span
														class="text-[9px] font-semibold tracking-tighter text-muted-foreground uppercase"
														>{config.label}</span
													>
												</div>

												<div
													class="relative flex w-2/3 items-center justify-center overflow-hidden p-2"
												>
													{#if data.coverUrl}
														<img
															src={data.coverUrl}
															alt=""
															class="absolute inset-0 h-full w-full object-cover"
														/>
														<div
															class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"
														></div>
														<span
															class="absolute bottom-1 left-2 line-clamp-1 text-[10px] font-medium text-white"
															>{data.gameName}</span
														>
													{:else}
														<div
															class="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-muted-foreground/20 p-1 text-center"
														>
															<span class="line-clamp-3 text-xs font-medium text-muted-foreground"
																>{data.gameName}</span
															>
														</div>
													{/if}
												</div>
											</div>
										{:else if isActive}
											<div class="absolute inset-0 flex items-center justify-center">
												{#if isMyCell && isMyTurn}
													<Button
														size="icon"
														class="h-12 w-12 animate-bounce rounded-full shadow-[0_0_20px_rgba(var(--primary),0.5)]"
														onclick={startPickProcess}
													>
														<Plus class="h-6 w-6" />
													</Button>
												{:else}
													<div class="flex flex-col items-center gap-2 opacity-50">
														<Loader2 class="h-5 w-5 animate-spin text-primary" />
														<span class="text-xs text-muted-foreground">Picking...</span>
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
					<button
						class="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
						onclick={() => (modalStep = modalStep === 'confirm' ? 'game' : 'type')}
					>
						<ArrowLeft class="h-3 w-3" /> Back
					</button>
				{/if}
			</div>

			<div class="h-[400px] overflow-y-auto p-6">
				{#if modalStep === 'type'}
					<div class="grid h-full grid-cols-2 content-center gap-4">
						{#each Object.entries(pickConfig) as [key, conf]}
							<button
								onclick={() => selectType(key as any)}
								class="group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-muted bg-card p-6 transition-all hover:border-primary hover:bg-primary/5"
							>
								<svelte:component
									this={conf.icon}
									class="h-10 w-10 {conf.color} transition-transform group-hover:scale-110"
								/>
								<span class="text-lg font-bold">{conf.label}</span>
							</button>
						{/each}
					</div>
				{:else if modalStep === 'game'}
					<div class="flex h-full flex-col gap-4">
						<div class="relative">
							<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search games..."
								class="pl-9"
								bind:value={modalSearch}
								autofocus
							/>
						</div>
						{#if gameListLoading}
							<div class="flex flex-1 items-center justify-center">
								<Loader2 class="animate-spin text-primary" />
							</div>
						{:else}
							<ScrollArea class="-mr-2 flex-1 pr-2">
								<div class="grid grid-cols-1 gap-1">
									{#each filteredGameList as game}
										<button
											class="group flex items-center justify-between rounded-md p-3 text-left transition-colors hover:bg-muted"
											onclick={() => openGameDetail(game.id)}
										>
											<span class="font-medium transition-colors group-hover:text-primary"
												>{game.name}</span
											>
											<span class="font-mono text-xs text-muted-foreground"
												>{formatDateShort(game.releaseDate)}</span
											>
										</button>
									{/each}
								</div>
							</ScrollArea>
						{/if}
					</div>
				{:else if modalStep === 'confirm'}
					{#if detailLoading}
						<div class="flex h-full items-center justify-center">
							<Loader2 class="animate-spin text-primary" />
						</div>
					{:else if detailGame}
						<div class="flex h-full flex-col gap-6">
							<div class="flex gap-6">
								{#if detailGame.coverUrl}
									<img
										src={detailGame.coverUrl}
										alt=""
										class="w-32 rounded-lg object-cover shadow-lg"
									/>
								{:else}
									<div
										class="flex w-32 items-center justify-center rounded-lg bg-muted p-2 text-center text-xs text-muted-foreground"
									>
										No Cover Available
									</div>
								{/if}
								<div class="flex-1 space-y-3">
									<h3 class="text-2xl font-bold">{detailGame.name}</h3>
									<Badge variant="secondary">{detailGame.releaseDate ?? 'TBA'}</Badge>
									{#if detailGame.description}
										<p class="line-clamp-6 text-sm leading-relaxed text-muted-foreground">
											{detailGame.description}
										</p>
									{/if}
								</div>
							</div>

							<div
								class="mt-auto flex items-center justify-between rounded-lg border bg-muted/20 p-4"
							>
								<div class="flex items-center gap-3">
									
									{#if selectedPickType && pickConfig[selectedPickType]}
										{@const conf = pickConfig[selectedPickType]}
										<div class="rounded-full border bg-background p-2">
											<svelte:component this={conf.icon} class="h-5 w-5 {conf.color}" />
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
						</div>
					{/if}
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
</div>
