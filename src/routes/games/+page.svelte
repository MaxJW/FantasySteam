<script lang="ts">
	import type { GameListEntry } from '$lib/db';
	import type { Game } from '$lib/db';
	import type { GameListSortBy, GameListOrder } from '$lib/db';
	import { getGame, getGameListPage, getGameListYears } from '$lib/db';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { GameDetailDialog } from '$lib/components/game-detail-dialog';
	import { Calendar, LayoutGrid, List, ArrowUp, ArrowDown, ArrowUpDown } from '@lucide/svelte';

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
	let games = $state<GameListEntry[]>([]);
	let totalCount = $state(0);
	let loadingYears = $state(true);
	let loadingGames = $state(false);
	let loadingMore = $state(false);
	let viewMode = $state<ViewMode>('table');

	let gameModalOpen = $state(false);
	let selectedGameId = $state<string | null>(null);
	let detailGame = $state<(Game & { id: string }) | null>(null);
	let detailLoading = $state(false);

	let loadMoreSentinel = $state<HTMLDivElement | undefined>(undefined);

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
		getGameListYears().then((y) => {
			years = y.map(String);
			loadingYears = false;
			if (!selectedYear && years.length > 0) selectedYear = years[0];
		});
	});

	async function loadFirstPage() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year)) return;
		loadingGames = true;
		games = [];
		totalCount = 0;
		try {
			const { games: page, total } = await getGameListPage(year, PAGE_SIZE, 0, {
				sortBy,
				order
			});
			games = page;
			totalCount = total;
		} finally {
			loadingGames = false;
		}
	}

	async function loadMore() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year) || loadingMore || loadingGames) return;
		if (games.length >= totalCount) return;
		loadingMore = true;
		try {
			const { games: page, total } = await getGameListPage(year, PAGE_SIZE, games.length, {
				sortBy,
				order
			});
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
		if (selectedYear) {
			loadFirstPage();
		}
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

<svelte:head><title>Games by year</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-col space-y-4">
		<h1 class="text-3xl font-bold tracking-tight">Games by year</h1>

		<div class="flex flex-wrap items-center gap-4 rounded-lg border bg-card/50 p-4">
			<div class="flex items-center gap-2">
				<Calendar class="h-4 w-4 text-muted-foreground" />
				<span class="text-sm font-medium text-muted-foreground">Year</span>
			</div>
			<Select.Root bind:value={selectedYear} type="single">
				<Select.Trigger class="w-[140px]">
					{selectedYear || 'Select year'}
				</Select.Trigger>
				<Select.Content>
					{#each years as y}
						<Select.Item value={String(y)} label={String(y)}>{y}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			{#if viewMode === 'grid'}
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-muted-foreground">Sort by</span>
					<Select.Root bind:value={sortOption} type="single">
						<Select.Trigger class="w-[180px]">
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
			<div class="ml-auto flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
				<Button
					variant={viewMode === 'table' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={() => (viewMode = 'table')}
					aria-label="Table view"
				>
					<List class="h-4 w-4" />
				</Button>
				<Button
					variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-8 w-8"
					onclick={() => (viewMode = 'grid')}
					aria-label="Grid view"
				>
					<LayoutGrid class="h-4 w-4" />
				</Button>
			</div>
		</div>
	</div>

	{#if loadingYears || loadingGames}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="h-24 animate-pulse rounded-lg bg-muted/50"></div>
			{/each}
		</div>
	{:else if years.length === 0}
		<div class="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
			No game lists available. Populate game lists for a year first.
		</div>
	{:else if !selectedYear}
		<div class="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
			Select a year.
		</div>
	{:else if games.length === 0}
		<div class="py-12 text-center text-muted-foreground">
			No games in the list for {selectedYear}.
		</div>
	{:else if viewMode === 'table'}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[120px]">
							<button
								type="button"
								class="flex items-center gap-1 rounded hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
								onclick={() => setSort('date')}
							>
								Date
								{#if sortBy === 'date'}
									{#if order === 'asc'}
										<ArrowUp class="h-3.5 w-3.5" />
									{:else}
										<ArrowDown class="h-3.5 w-3.5" />
									{/if}
								{:else}
									<ArrowUpDown class="h-3.5 w-3.5 opacity-50" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head>
							<button
								type="button"
								class="flex items-center gap-1 rounded text-left hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
								onclick={() => setSort('name')}
							>
								Game Name
								{#if sortBy === 'name'}
									{#if order === 'asc'}
										<ArrowUp class="h-3.5 w-3.5" />
									{:else}
										<ArrowDown class="h-3.5 w-3.5" />
									{/if}
								{:else}
									<ArrowUpDown class="h-3.5 w-3.5 opacity-50" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head class="w-[80px] text-right">
							<button
								type="button"
								class="ml-auto flex items-center gap-1 rounded hover:text-foreground focus:ring-2 focus:ring-ring focus:outline-none"
								onclick={() => setSort('score')}
							>
								Score
								{#if sortBy === 'score'}
									{#if order === 'asc'}
										<ArrowUp class="h-3.5 w-3.5" />
									{:else}
										<ArrowDown class="h-3.5 w-3.5" />
									{/if}
								{:else}
									<ArrowUpDown class="h-3.5 w-3.5 opacity-50" />
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
							class="cursor-pointer transition-colors hover:bg-muted/50"
							onclick={() => openGameDetail(game.id)}
							onkeydown={(e) => e.key === 'Enter' && openGameDetail(game.id)}
						>
							<Table.Cell class="text-muted-foreground">{game.releaseDate ?? 'TBA'}</Table.Cell>
							<Table.Cell class="font-medium">{game.name}</Table.Cell>
							<Table.Cell class="text-right font-mono text-muted-foreground">
								{game.score != null ? Math.round(game.score).toLocaleString() : '—'}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
		<div bind:this={loadMoreSentinel} class="h-4 w-full" role="presentation"></div>
		{#if loadingMore}
			<div class="py-4 text-center text-sm text-muted-foreground">Loading more…</div>
		{:else if games.length < totalCount}
			<div class="py-2 text-center text-xs text-muted-foreground">
				{games.length} of {totalCount} games
			</div>
		{/if}
	{:else}
		<div class="grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
			{#each games as game}
				<Button
					type="button"
					variant="outline"
					class="group relative block aspect-[2/3] h-auto w-full overflow-hidden rounded-lg bg-muted p-0 text-left shadow-sm transition-shadow hover:shadow-md"
					onclick={() => openGameDetail(game.id)}
				>
					{#if game.coverUrl}
						<img
							src={game.coverUrl}
							alt=""
							class="absolute inset-0 h-full w-full object-cover"
							loading="lazy"
							width="264"
							height="396"
						/>
					{:else}
						<div
							class="flex h-full w-full items-center justify-center p-2 text-center text-sm font-medium text-muted-foreground"
						>
							{game.name}
						</div>
					{/if}
					<div
						class="absolute inset-x-0 bottom-0 flex min-h-[80%] flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100"
					>
						<span class="line-clamp-2 text-sm font-medium text-white">{game.name}</span>
						<span class="mt-0.5 text-xs text-white/80">{game.releaseDate ?? 'TBA'}</span>
						{#if game.score != null}
							<span class="mt-0.5 font-mono text-xs text-white/90"
								>Score: {Math.round(game.score).toLocaleString()}</span
							>
						{/if}
					</div>
				</Button>
			{/each}
		</div>
		<div bind:this={loadMoreSentinel} class="h-4 w-full" role="presentation"></div>
		{#if loadingMore}
			<div class="py-4 text-center text-sm text-muted-foreground">Loading more…</div>
		{:else if games.length < totalCount}
			<div class="py-2 text-center text-xs text-muted-foreground">
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
