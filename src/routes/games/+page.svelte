<script lang="ts">
	import type { GameListEntry } from '$lib/db';
	import type { Game } from '$lib/db';
	import type { GameListSortBy, GameListOrder } from '$lib/db';
	import type { DraftPhase } from '$lib/db';
	import {
		getGame,
		getGameListPage,
		getGameListYears,
		refreshGames,
		DRAFT_PHASES,
		PHASE_CONFIG,
		getPhaseReleaseDateRange
	} from '$lib/db';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { GameDetailDialog } from '$lib/components/game-detail-dialog';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Calendar from '@lucide/svelte/icons/calendar';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import List from '@lucide/svelte/icons/list';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';
	import Search from '@lucide/svelte/icons/search';

	type ViewMode = 'table' | 'grid';

	const PAGE_SIZE = 24;

	type SortOption = `${GameListSortBy}-${GameListOrder}`;
	const SORT_OPTIONS: { value: SortOption; label: string }[] = [
		{ value: 'date-asc', label: 'Date (oldest first)' },
		{ value: 'date-desc', label: 'Date (newest first)' },
		{ value: 'name-asc', label: 'Name (A–Z)' },
		{ value: 'name-desc', label: 'Name (Z–A)' },
		{ value: 'score-asc', label: 'Score (low–high)' },
		{ value: 'score-desc', label: 'Score (high–low)' }
	];

	let sortOption = $state<SortOption>('date-asc');
	let sortBy = $derived(sortOption.split('-')[0] as GameListSortBy);
	let order = $derived(sortOption.split('-')[1] as GameListOrder);

	let years = $state<string[]>([]);
	let selectedYear = $state<string>('');
	let selectedSeason = $state<DraftPhase | ''>('');
	let hideReleased = $state(false);
	let games = $state<GameListEntry[]>([]);
	let totalCount = $state(0);
	let loadingYears = $state(true);
	let loadingGames = $state(false);
	let loadingMore = $state(false);
	let viewMode = $state<ViewMode>('grid');
	let searchQuery = $state('');
	let lastSearch = $state('');

	let gameModalOpen = $state(false);
	let selectedGameId = $state<string | null>(null);
	let detailGame = $state<(Game & { id: string }) | null>(null);
	let detailLoading = $state(false);

	let loadMoreSentinel = $state<HTMLDivElement | undefined>(undefined);
	let loadError = $state<string | null>(null);

	async function retryLoad() {
		loadError = null;
		refreshGames();
		loadingYears = true;
		loadingGames = true;
		try {
			const y = await getGameListYears();
			years = y.map(String);
			if (!selectedYear && years.length > 0) selectedYear = years[0];
			if (selectedYear) await loadFirstPage();
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Load failed';
		} finally {
			loadingYears = false;
			loadingGames = false;
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

	$effect(() => {
		loadError = null;
		getGameListYears()
			.then((y) => {
				years = y.map(String);
				loadingYears = false;
				if (!selectedYear && years.length > 0) selectedYear = years[0];
			})
			.catch((e) => {
				loadError = e instanceof Error ? e.message : 'Load failed';
				loadingYears = false;
			});
	});

	async function loadFirstPage() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year)) return;
		loadingGames = true;
		games = [];
		totalCount = 0;
		const opts: Parameters<typeof getGameListPage>[3] = {
			sortBy,
			order,
			search: searchQuery.trim() || undefined,
			hideReleased: hideReleased || undefined
		};
		if (selectedSeason) {
			const { start, end } = getPhaseReleaseDateRange(selectedSeason, year);
			opts.releaseFrom = start;
			opts.releaseTo = end;
		}
		try {
			const { games: page, total } = await getGameListPage(year, PAGE_SIZE, 0, opts);
			games = page;
			totalCount = total;
			loadError = null;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Load failed';
		} finally {
			loadingGames = false;
		}
	}

	async function loadMore() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year) || loadingMore || loadingGames) return;
		if (games.length >= totalCount) return;
		loadingMore = true;
		const opts: Parameters<typeof getGameListPage>[3] = {
			sortBy,
			order,
			search: searchQuery.trim() || undefined,
			hideReleased: hideReleased || undefined
		};
		if (selectedSeason) {
			const { start, end } = getPhaseReleaseDateRange(selectedSeason, year);
			opts.releaseFrom = start;
			opts.releaseTo = end;
		}
		try {
			const { games: page, total } = await getGameListPage(year, PAGE_SIZE, games.length, opts);
			games = [...games, ...page];
			totalCount = total;
		} finally {
			loadingMore = false;
		}
	}

	function setSort(col: GameListSortBy) {
		if (sortBy === col) {
			sortOption = (order === 'asc' ? `${col}-desc` : `${col}-asc`) as SortOption;
		} else {
			sortOption = `${col}-asc` as SortOption;
		}
		loadFirstPage();
	}

	$effect(() => {
		const _ = sortOption;
		const __ = selectedSeason;
		const ___ = hideReleased;
		if (selectedYear) {
			loadFirstPage();
		}
	});

	$effect(() => {
		if (searchQuery === lastSearch) return;
		const q = searchQuery;
		const t = setTimeout(() => {
			lastSearch = q;
			if (selectedYear) loadFirstPage();
		}, 300);
		return () => clearTimeout(t);
	});

	$effect(() => {
		const sentinel = loadMoreSentinel;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				const [e] = entries;
				if (
					e?.isIntersecting &&
					games.length > 0 &&
					games.length < totalCount &&
					!loadingMore &&
					!loadingGames
				) {
					loadMore();
				}
			},
			{ rootMargin: '200px', threshold: 0 }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});
</script>

<svelte:head><title>Browse Games</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-4">
		<h1 class="text-3xl font-bold tracking-tight">Browse Games</h1>

		<!-- Filter bar -->
		<div class="sticky top-14 z-20 -mx-4 px-4 md:top-16">
			<div
				class="glass flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:p-3"
			>
				<div class="flex flex-wrap items-center gap-3">
					<div class="flex items-center gap-2">
						<Calendar class="h-4 w-4 text-muted-foreground" />
						<Select.Root bind:value={selectedYear} type="single">
							<Select.Trigger class="w-[120px] border-white/[0.08] bg-white/[0.04]">
								{selectedYear || 'Year'}
							</Select.Trigger>
							<Select.Content>
								{#each years as y}
									<Select.Item value={String(y)} label={String(y)}>{y}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="flex items-center gap-2">
						<Snowflake class="h-4 w-4 text-muted-foreground" />
						<Select.Root bind:value={selectedSeason} type="single">
							<Select.Trigger class="w-[130px] border-white/[0.08] bg-white/[0.04]">
								{selectedSeason ? PHASE_CONFIG[selectedSeason].label : 'All seasons'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" label="All seasons">All seasons</Select.Item>
								{#each DRAFT_PHASES as phase}
									<Select.Item value={phase} label={PHASE_CONFIG[phase].label}>
										{PHASE_CONFIG[phase].label}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<label
						class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<input
							type="checkbox"
							bind:checked={hideReleased}
							class="h-4 w-4 rounded-md border border-white/[0.08] bg-white/[0.04] accent-primary"
						/>
						Hide released
					</label>
				</div>

				<div class="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search games..."
						class="border-white/[0.08] bg-white/[0.04] pl-9"
						bind:value={searchQuery}
					/>
				</div>

				<div class="flex items-center gap-3 sm:ml-auto">
					{#if viewMode === 'grid'}
						<div class="hidden items-center gap-2 sm:flex">
							<Select.Root bind:value={sortOption} type="single">
								<Select.Trigger class="w-[170px] border-white/[0.08] bg-white/[0.04]">
									{SORT_OPTIONS.find((o) => o.value === sortOption)?.label ?? sortOption}
								</Select.Trigger>
								<Select.Content>
									{#each SORT_OPTIONS as opt}
										<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}

					<div
						class="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5"
					>
						<Button
							variant={viewMode === 'table' ? 'secondary' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => (viewMode = 'table')}
							aria-label="Table view"
						>
							<List class="h-3.5 w-3.5" />
						</Button>
						<Button
							variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
							size="icon"
							class="h-7 w-7"
							onclick={() => (viewMode = 'grid')}
							aria-label="Grid view"
						>
							<LayoutGrid class="h-3.5 w-3.5" />
						</Button>
					</div>

					{#if totalCount > 0 && !loadingGames}
						<span class="text-[10px] text-muted-foreground">{totalCount} games</span>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if loadingYears || loadingGames}
		<div
			class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each Array(12) as _, i}
				<div
					class="aspect-[2/3] animate-fade-in-up rounded-lg bg-white/[0.04]"
					style="animation-delay: {i * 0.03}s"
				></div>
			{/each}
		</div>
	{:else if loadError}
		<div class="glass flex flex-col items-center justify-center gap-4 rounded-xl py-12 text-center">
			<p class="text-sm text-destructive">{loadError}</p>
			<Button onclick={retryLoad} variant="outline">Retry</Button>
		</div>
	{:else if years.length === 0}
		<div class="glass rounded-xl py-10 text-center text-sm text-muted-foreground">
			No game lists available.
		</div>
	{:else if !selectedYear}
		<div class="glass rounded-xl py-10 text-center text-sm text-muted-foreground">
			Select a year to browse games.
		</div>
	{:else if games.length === 0}
		<div class="glass rounded-xl py-10 text-center text-sm text-muted-foreground">
			No games found{searchQuery
				? ` matching "${searchQuery}"`
				: selectedSeason
					? ` for ${selectedYear} ${PHASE_CONFIG[selectedSeason].label}`
					: ` for ${selectedYear}`}.
		</div>
	{:else if viewMode === 'table'}
		<div class="overflow-hidden rounded-xl border border-white/[0.06]">
			<Table.Root>
				<Table.Header>
					<Table.Row class="border-white/[0.06] hover:bg-transparent">
						<Table.Head class="w-[120px]">
							<button
								type="button"
								class="flex items-center gap-1 rounded text-xs hover:text-foreground"
								onclick={() => setSort('date')}
							>
								Date
								{#if sortBy === 'date'}
									{#if order === 'asc'}<ArrowUp class="h-3 w-3" />{:else}<ArrowDown
											class="h-3 w-3"
										/>{/if}
								{:else}
									<ArrowUpDown class="h-3 w-3 opacity-40" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head>
							<button
								type="button"
								class="flex items-center gap-1 rounded text-left text-xs hover:text-foreground"
								onclick={() => setSort('name')}
							>
								Game Name
								{#if sortBy === 'name'}
									{#if order === 'asc'}<ArrowUp class="h-3 w-3" />{:else}<ArrowDown
											class="h-3 w-3"
										/>{/if}
								{:else}
									<ArrowUpDown class="h-3 w-3 opacity-40" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head class="w-[80px] text-right">
							<button
								type="button"
								class="ml-auto flex items-center gap-1 rounded text-xs hover:text-foreground"
								onclick={() => setSort('score')}
							>
								Score
								{#if sortBy === 'score'}
									{#if order === 'asc'}<ArrowUp class="h-3 w-3" />{:else}<ArrowDown
											class="h-3 w-3"
										/>{/if}
								{:else}
									<ArrowUpDown class="h-3 w-3 opacity-40" />
								{/if}
							</button>
						</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each games as game}
						<Table.Row
							role="button"
							tabindex={0}
							class="cursor-pointer border-white/[0.04] transition-colors hover:bg-white/[0.03]"
							onclick={() => openGameDetail(game.id)}
							onkeydown={(e) => e.key === 'Enter' && openGameDetail(game.id)}
						>
							<Table.Cell class="text-xs text-muted-foreground"
								>{game.releaseDate ?? 'TBA'}</Table.Cell
							>
							<Table.Cell class="text-sm font-medium">{game.name}</Table.Cell>
							<Table.Cell class="text-right font-mono text-xs text-muted-foreground">
								{game.score != null ? Math.round(game.score).toLocaleString() : '—'}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<div bind:this={loadMoreSentinel} class="h-4 w-full" role="presentation"></div>
		{#if loadingMore}
			<div class="py-3 text-center text-xs text-muted-foreground">Loading more…</div>
		{:else if games.length < totalCount}
			<div class="py-2 text-center text-[10px] text-muted-foreground">
				{games.length} of {totalCount} games
			</div>
		{/if}
	{:else}
		<div
			class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each games as game, i}
				<button
					type="button"
					class="group relative aspect-[2/3] w-full animate-fade-in-up cursor-pointer overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.03] text-left transition-all hover:border-white/[0.15] hover:shadow-lg hover:shadow-primary/[0.05] focus:ring-2 focus:ring-ring focus:outline-none"
					style="animation-delay: {Math.min(i * 0.02, 0.3)}s"
					onclick={() => openGameDetail(game.id)}
				>
					{#if game.coverUrl}
						<img
							src={game.coverUrl}
							alt=""
							class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
							loading="lazy"
							width="264"
							height="396"
						/>
					{:else}
						<div
							class="flex h-full w-full items-center justify-center p-3 text-center text-sm text-muted-foreground"
						>
							{game.name}
						</div>
					{/if}
					<div
						class="absolute inset-x-0 bottom-0 flex min-h-[50%] flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
					>
						<span class="line-clamp-2 text-sm font-medium text-white">{game.name}</span>
						<span class="mt-0.5 text-[10px] text-white/70">{game.releaseDate ?? 'TBA'}</span>
						{#if game.score != null}
							<span class="mt-0.5 font-mono text-[10px] text-white/80">
								Score: {Math.round(game.score).toLocaleString()}
							</span>
						{/if}
					</div>
				</button>
			{/each}
		</div>
		<div bind:this={loadMoreSentinel} class="h-4 w-full" role="presentation"></div>
		{#if loadingMore}
			<div class="py-3 text-center text-xs text-muted-foreground">Loading more…</div>
		{:else if games.length < totalCount}
			<div class="py-2 text-center text-[10px] text-muted-foreground">
				{games.length} of {totalCount} games
			</div>
		{/if}
	{/if}
</div>

<GameDetailDialog
	open={gameModalOpen}
	onOpenChange={(open) => !open && closeGameModal()}
	game={detailGame}
	loading={detailLoading}
	showNotFound={selectedGameId != null && !detailLoading && detailGame == null}
/>
