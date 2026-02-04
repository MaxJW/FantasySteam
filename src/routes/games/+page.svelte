<script lang="ts">
	import type { GameListEntry } from '$lib/db';
	import { getGameList } from '$lib/db';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import { Calendar } from '@lucide/svelte';

	let years = $state<string[]>(['2026']);
	let selectedYear = $state<string>('');
	let games = $state<GameListEntry[]>([]);
	let loadingYears = $state(false);
	let loadingGames = $state(false);

	// Set default selection to the only available year if not already selected
	if (!selectedYear && years.length > 0) {
		selectedYear = years[0];
	}

	async function loadGames() {
		const year = selectedYear ? parseInt(selectedYear, 10) : 0;
		if (!year || Number.isNaN(year)) return;
		loadingGames = true;
		try {
			games = await getGameList(year);
		} finally {
			loadingGames = false;
		}
	}

	$effect(() => {
		if (selectedYear) {
			loadGames();
		}
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
		</div>
	</div>

	{#if loadingYears}
		<div class="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
			Loading years…
		</div>
	{:else if years.length === 0}
		<div class="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
			No game lists available. Populate game lists for a year first.
		</div>
	{:else if !selectedYear}
		<div class="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
			Select a year.
		</div>
	{:else if loadingGames}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="h-24 animate-pulse rounded-lg bg-muted/50"></div>
			{/each}
		</div>
	{:else if games.length === 0}
		<div class="py-12 text-center text-muted-foreground">No games in the list for {selectedYear}.</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each games as game}
				<Card class="flex flex-col overflow-hidden border-muted transition-colors hover:border-primary/50">
					<CardContent class="flex flex-1 flex-col gap-2 px-4">
						<h3 class="line-clamp-1 text-lg font-semibold" title={game.name}>{game.name}</h3>
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" class="w-fit">
								{game.releaseDate ?? 'TBA'}
							</Badge>
						</div>
						<div class="mt-1 truncate font-mono text-xs text-muted-foreground">ID: {game.id}</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
