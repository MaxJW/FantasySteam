<script lang="ts">
	import { tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { GameListEntry } from '$lib/db';
	import type { Game } from '$lib/db';
	import type { GameListSortBy, GameListOrder } from '$lib/db';
	import type { DraftPhase } from '$lib/db';
	import {
		getGame,
		getGameListPage,
		getGameListGenres,
		getGameListYears,
		getBookmarkedGameIds,
		addBookmark,
		removeBookmark,
		refreshGames,
		DRAFT_PHASES,
		PHASE_CONFIG,
		getPhaseReleaseDateRange
	} from '$lib/db';
	import { currentUser } from '$lib/auth';
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
	import Tags from '@lucide/svelte/icons/tags';
	import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Check from '@lucide/svelte/icons/check';
	import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';

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
	let sortLabel = $derived(SORT_OPTIONS.find((o) => o.value === sortOption)?.label ?? sortOption);

	let years = $state<string[]>([]);
	let selectedYear = $state<string>('');
	let selectedSeason = $state<DraftPhase | ''>('');
	let genres = $state<string[]>([]);
	let selectedGenres = $state<string[]>([]);
	let hideReleased = $state(false);
	let bookmarkedOnly = $state(false);
	let bookmarkedIds = $state<Set<string>>(new Set());
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

	let filtersCollapsed = $state(false);
	let filterSentinelRef = $state<HTMLDivElement | undefined>(undefined);
	let expandedFilterBarRef = $state<HTMLDivElement | undefined>(undefined);
	let collapsedFilterBarRef = $state<HTMLDivElement | undefined>(undefined);
	let scrollY = $state(0);

	const me = $derived($currentUser ?? null);

	function scrollToTop() {
		const start = window.scrollY;
		const startTime = performance.now();
		const duration = Math.min(800, Math.max(400, start * 0.2));

		function easeInOutCubic(t: number) {
			return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
		}

		function step(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(1, elapsed / duration);
			const eased = easeInOutCubic(progress);
			window.scrollTo(0, start * (1 - eased));
			if (progress < 1) requestAnimationFrame(step);
		}
		requestAnimationFrame(step);
	}

	async function setFiltersCollapsed(collapsed: boolean) {
		const beforeHeight = collapsed
			? (expandedFilterBarRef?.offsetHeight ?? 0)
			: (collapsedFilterBarRef?.offsetHeight ?? 0);
		filtersCollapsed = collapsed;
		await tick();
		const afterHeight = collapsed
			? (collapsedFilterBarRef?.offsetHeight ?? 0)
			: (expandedFilterBarRef?.offsetHeight ?? 0);
		window.scrollBy(0, afterHeight - beforeHeight);
	}

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
		if (bookmarkedOnly) loadFirstPage();
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

	$effect(() => {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year)) {
			genres = [];
			return;
		}
		getGameListGenres(year).then((g) => (genres = g));
	});

	$effect(() => {
		const user = me;
		if (!user) {
			bookmarkedIds = new Set();
			return;
		}
		getBookmarkedGameIds(user.uid).then((ids) => (bookmarkedIds = ids));
	});

	function getFilterOpts(year: number): Parameters<typeof getGameListPage>[3] {
		const opts: Parameters<typeof getGameListPage>[3] = {
			sortBy,
			order,
			search: searchQuery.trim() || undefined,
			hideReleased: hideReleased || undefined,
			genres: selectedGenres.length ? selectedGenres : undefined
		};
		if (selectedSeason) {
			const { start, end } = getPhaseReleaseDateRange(selectedSeason, year);
			opts.releaseFrom = start;
			opts.releaseTo = end;
		}
		if (bookmarkedOnly) {
			opts.bookmarkedOnly = true;
			opts.bookmarkedIds = bookmarkedIds;
		}
		return opts;
	}

	async function loadFirstPage() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year)) return;
		loadingGames = true;
		games = [];
		totalCount = 0;
		try {
			const { games: page, total } = await getGameListPage(year, PAGE_SIZE, 0, getFilterOpts(year));
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
		try {
			const { games: page, total } = await getGameListPage(
				year,
				PAGE_SIZE,
				games.length,
				getFilterOpts(year)
			);
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
		sortOption;
		selectedSeason;
		hideReleased;
		selectedGenres;
		bookmarkedOnly;
		if (selectedYear) loadFirstPage();
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
			{ rootMargin: '200px 0px 0px 0px', threshold: 0 }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		const sentinel = filterSentinelRef;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([e]) => {
				if (!e) return;
				// When sentinel scrolls out of view (fully into grid), collapse; when back in view, expand
				filtersCollapsed = !e.isIntersecting;
			},
			{ threshold: 0, rootMargin: '-60px 0px 0px 0px' }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	$effect(() => {
		const onScroll = () => (scrollY = window.scrollY);
		window.addEventListener('scroll', onScroll, { passive: true });
		onScroll();
		return () => window.removeEventListener('scroll', onScroll);
	});
</script>

<svelte:head><title>Browse Games</title></svelte:head>

<div>
	<h1 class="pb-2 text-3xl font-bold tracking-tight">Browse Games</h1>

	<!-- Sticky filter bar -->
	<div class="sticky top-14 z-30 -mx-4 px-4 pt-3 pb-6 md:top-16">
		{#if filtersCollapsed}
			<!-- Collapsed: compact bar with Show filters button -->
			<div
				bind:this={collapsedFilterBarRef}
				class="glass flex items-center rounded-xl px-3 py-2 transition-all duration-200 ease-out"
			>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-center gap-2 text-foreground hover:bg-white/6"
					onclick={() => setFiltersCollapsed(false)}
					aria-label="Show filters"
				>
					<SlidersHorizontal class="h-4 w-4" />
					<span>Show filters</span>
				</Button>
			</div>
		{:else}
			<!-- Expanded: full filters + Hide filters button -->
			<div
				bind:this={expandedFilterBarRef}
				class="glass flex flex-col gap-4 rounded-xl p-4 transition-all duration-200 ease-out sm:p-3"
			>
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-center gap-2 text-muted-foreground hover:bg-white/6 hover:text-foreground"
					onclick={() => setFiltersCollapsed(true)}
					aria-label="Hide filters"
				>
					<ChevronUp class="h-4 w-4" />
					<span>Hide filters</span>
				</Button>

				<!-- Row 1: Search (full width, own line) -->
				<div class="relative w-full min-w-0">
					<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search games..."
						class="border-white/8 bg-white/4 pl-9"
						bind:value={searchQuery}
					/>
				</div>

				<!-- Filters: stacked on mobile, row on desktop -->
				<div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
					<!-- 1. Year + Season (2 cols on mobile, inline on desktop) -->
					<div
						class="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:grid-cols-none sm:flex-wrap sm:items-center"
					>
						<div class="flex min-w-0 items-center gap-2">
							<Calendar class="h-4 w-4 shrink-0 text-muted-foreground" />
							<Select.Root bind:value={selectedYear} type="single">
								<Select.Trigger
									class="min-w-0 flex-1 border-white/8 bg-white/4 sm:w-[120px] sm:flex-initial"
								>
									{selectedYear || 'Year'}
								</Select.Trigger>
								<Select.Content>
									{#each years as y}
										<Select.Item value={String(y)} label={String(y)}>{y}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<div class="flex min-w-0 items-center gap-2">
							<Snowflake class="h-4 w-4 shrink-0 text-muted-foreground" />
							<Select.Root bind:value={selectedSeason} type="single">
								<Select.Trigger
									class="min-w-0 flex-1 border-white/8 bg-white/4 sm:w-[130px] sm:flex-initial"
								>
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
					</div>

					<!-- 2. Genre (full width on mobile) -->
					<div class="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-initial">
						<Tags class="h-4 w-4 shrink-0 text-muted-foreground" />
						<Select.Root bind:value={selectedGenres} type="multiple">
							<Select.Trigger
								class="min-w-0 flex-1 border-white/8 bg-white/4 sm:max-w-[180px] sm:min-w-[140px] sm:flex-initial"
							>
								{selectedGenres.length > 1
									? `${selectedGenres.length} genres`
									: (selectedGenres[0] ?? 'Genre')}
							</Select.Trigger>
							<Select.Content>
								{#each genres as genre}
									<Select.Item value={genre} label={genre}>{genre}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- 3. Hide released + Bookmarked (wrap on narrow screens) -->
					<div class="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:flex-initial">
						<button
							type="button"
							role="checkbox"
							aria-checked={hideReleased}
							aria-label="Hide released"
							class="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-white/8 bg-white/4 px-3 transition-colors hover:bg-white/6"
							onclick={() => (hideReleased = !hideReleased)}
						>
							<span
								class="flex size-4 shrink-0 items-center justify-center rounded border border-white/8 bg-white/4 transition-colors {hideReleased
									? 'border-primary bg-primary text-primary-foreground'
									: ''}"
							>
								{#if hideReleased}
									<Check class="h-2.5 w-2.5" />
								{/if}
							</span>
							<span class="text-sm whitespace-nowrap text-foreground">Hide released</span>
						</button>
						<button
							type="button"
							role="checkbox"
							aria-checked={bookmarkedOnly}
							aria-label="Bookmarked only"
							class="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-white/8 bg-white/4 px-3 transition-colors hover:bg-white/6"
							onclick={() => (bookmarkedOnly = !bookmarkedOnly)}
						>
							<span
								class="flex size-4 shrink-0 items-center justify-center rounded border border-white/8 bg-white/4 transition-colors {bookmarkedOnly
									? 'border-primary bg-primary text-primary-foreground'
									: ''}"
							>
								{#if bookmarkedOnly}
									<Check class="h-2.5 w-2.5" />
								{/if}
							</span>
							<span class="text-sm whitespace-nowrap text-foreground">Bookmarked only</span>
						</button>
					</div>

					<!-- 4. Sort + View toggle + Count -->
					<div class="flex w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto">
						<div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
							<Select.Root bind:value={sortOption} type="single">
								<Select.Trigger
									class="min-w-0 flex-1 border-white/8 bg-white/4 sm:w-[170px] sm:flex-initial"
								>
									{sortLabel}
								</Select.Trigger>
								<Select.Content>
									{#each SORT_OPTIONS as opt}
										<Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>

						<div
							class="flex shrink-0 items-center gap-0.5 rounded-lg border border-white/8 bg-white/4 p-0.5"
						>
							<Button
								variant={viewMode === 'table' ? 'secondary' : 'ghost'}
								size="icon"
								class="size-7 "
								onclick={() => (viewMode = 'table')}
								aria-label="Table view"
							>
								<List class="h-3.5 w-3.5" />
							</Button>
							<Button
								variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
								size="icon"
								class="size-7 "
								onclick={() => (viewMode = 'grid')}
								aria-label="Grid view"
							>
								<LayoutGrid class="h-3.5 w-3.5" />
							</Button>
						</div>

						{#if totalCount > 0 && !loadingGames}
							<span class="shrink-0 text-xs text-muted-foreground">{totalCount} games</span>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div bind:this={filterSentinelRef} class="h-px w-full" aria-hidden="true"></div>

	{#if loadingYears || loadingGames}
		<div
			class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each Array(12) as _, i}
				<div
					class="aspect-2/3 animate-fade-in-up rounded-lg bg-white/4"
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
		<div class="max-w-full overflow-x-auto rounded-xl border border-white/6">
			<Table.Root class="w-full min-w-0 table-fixed">
				<Table.Header>
					<Table.Row class="border-white/6 hover:bg-transparent">
						<Table.Head class="w-[120px]">
							<button
								type="button"
								class="flex cursor-pointer items-center gap-1 rounded text-xs hover:text-foreground"
								onclick={() => setSort('date')}
							>
								Date
								{#if sortBy === 'date'}
									{#if order === 'asc'}<ArrowUp class="size-3 " />{:else}<ArrowDown
											class="size-3 "
										/>{/if}
								{:else}
									<ArrowUpDown class="size-3  opacity-40" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head class="min-w-0">
							<button
								type="button"
								class="flex cursor-pointer items-center gap-1 rounded text-left text-xs hover:text-foreground"
								onclick={() => setSort('name')}
							>
								Game Name
								{#if sortBy === 'name'}
									{#if order === 'asc'}<ArrowUp class="size-3 " />{:else}<ArrowDown
											class="size-3 "
										/>{/if}
								{:else}
									<ArrowUpDown class="size-3  opacity-40" />
								{/if}
							</button>
						</Table.Head>
						<Table.Head class="w-[80px] text-right">
							<button
								type="button"
								class="ml-auto flex cursor-pointer items-center gap-1 rounded text-xs hover:text-foreground"
								onclick={() => setSort('score')}
							>
								Score
								{#if sortBy === 'score'}
									{#if order === 'asc'}<ArrowUp class="size-3 " />{:else}<ArrowDown
											class="size-3 "
										/>{/if}
								{:else}
									<ArrowUpDown class="size-3  opacity-40" />
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
							class="cursor-pointer border-white/4 transition-colors hover:bg-white/3"
							onclick={() => openGameDetail(game.id)}
							onkeydown={(e) => e.key === 'Enter' && openGameDetail(game.id)}
						>
							<Table.Cell class="text-xs text-muted-foreground"
								>{game.releaseDate ?? 'TBA'}</Table.Cell
							>
							<Table.Cell class="min-w-0 overflow-hidden text-sm font-medium">
								<span class="flex items-center gap-2">
									{#if bookmarkedIds.has(game.id)}
										<BookmarkCheck class="h-3.5 w-3.5 shrink-0 text-yellow-400" />
									{/if}
									<span class="truncate" title={game.name}>{game.name}</span>
								</span>
							</Table.Cell>
							<Table.Cell class="text-right font-mono text-xs text-muted-foreground">
								{game.score != null ? Math.round(game.score).toLocaleString() : '—'}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{:else}
		<div
			class="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
		>
			{#each games as game, i}
				<button
					type="button"
					class="group relative aspect-2/3 w-full animate-fade-in-up cursor-pointer overflow-hidden rounded-lg border border-white/6 bg-white/3 text-left transition-all hover:border-white/15 hover:shadow-lg hover:shadow-primary/5 focus:ring-2 focus:ring-ring focus:outline-none"
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
					{#if bookmarkedIds.has(game.id)}
						<div class="absolute top-2 right-2 rounded-full bg-black/60 p-1" aria-hidden="true">
							<BookmarkCheck class="h-4 w-4 text-yellow-400" />
						</div>
					{/if}
					<div
						class="absolute inset-x-0 bottom-0 flex min-h-[50%] flex-col justify-end bg-linear-to-t from-black/90 via-black/40 to-transparent p-3 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100"
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
	{/if}

	{#if games.length > 0}
		<div bind:this={loadMoreSentinel} class="h-4 w-full" role="presentation"></div>
		{#if loadingMore}
			<div class="py-3 text-center text-xs text-muted-foreground">Loading more…</div>
		{:else if games.length < totalCount}
			<div class="py-2 text-center text-[10px] text-muted-foreground">
				{games.length} of {totalCount} games
			</div>
		{/if}
	{/if}

	{#if scrollY > 300}
		<button
			type="button"
			aria-label="Back to top"
			class="glass fixed right-6 bottom-24 z-30 flex size-12 cursor-pointer items-center justify-center rounded-full shadow-lg transition-transform duration-200 hover:scale-105 md:bottom-6"
			onclick={scrollToTop}
			in:fly={{ y: 8, duration: 200 }}
			out:fly={{ y: 8, duration: 150 }}
		>
			<ChevronUp class="h-6 w-6 text-foreground" />
		</button>
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
