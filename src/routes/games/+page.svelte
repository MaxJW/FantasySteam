<script lang="ts">
	import { getDraftableGames } from '$lib/db';
	import type { Game } from '$lib/db';

	let games = $state<(Game & { id: string })[]>([]);
	let loading = $state(true);
	let search = $state('');
	let genre = $state('');
	let releaseFrom = $state('');
	let releaseTo = $state('');

	async function load() {
		loading = true;
		try {
			const list = await getDraftableGames({
				search: search || undefined,
				genre: genre || undefined,
				releaseFrom: releaseFrom || undefined,
				releaseTo: releaseTo || undefined,
				limitCount: 500
			});
			games = list;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		[search, genre, releaseFrom, releaseTo];
		load();
	});
</script>

<svelte:head><title>Browse games</title></svelte:head>

<div class="mx-auto max-w-4xl p-6">
	<h1 class="text-2xl font-bold mb-6 text-[#c7d5e0]">Upcoming Steam games</h1>

	<div class="mb-6 flex flex-wrap gap-4">
		<input
			type="search"
			placeholder="Search by name"
			bind:value={search}
			class="rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] placeholder-[#8f98a0] min-w-[200px] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
		/>
		<input
			type="text"
			placeholder="Genre"
			bind:value={genre}
			class="rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] placeholder-[#8f98a0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
		/>
		<input
			type="date"
			placeholder="From"
			bind:value={releaseFrom}
			class="rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
		/>
		<input
			type="date"
			placeholder="To"
			bind:value={releaseTo}
			class="rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
		/>
		<button
			type="button"
			onclick={() => load()}
			class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
		>
			Apply
		</button>
	</div>

	{#if loading}
		<p class="text-[#8f98a0]">Loading…</p>
	{:else if games.length === 0}
		<p class="text-[#8f98a0]">No games found. Add games via the populate script.</p>
	{:else}
		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each games as game}
				<li class="rounded border border-[#3d5a80] overflow-hidden bg-[#2a475e] hover:bg-[#3d6a8a] transition-colors">
					{#if game.coverUrl}
						<img
							src={game.coverUrl}
							alt=""
							class="h-32 w-full object-cover"
						/>
					{:else}
						<div class="h-32 w-full bg-[#1b2838] flex items-center justify-center text-[#8f98a0]">No cover</div>
					{/if}
					<div class="p-3">
						<p class="font-medium truncate text-[#c7d5e0]" title={game.name}>{game.name}</p>
						<p class="text-sm text-[#8f98a0]">
							{game.releaseDate ?? 'TBA'} · {game.genres?.join(', ') || '—'}
						</p>
						<p class="text-xs text-[#66c0f4]">Steam ID: {game.id}</p>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="mt-6">
		<a href="/dashboard" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to dashboard</a>
	</p>
</div>
