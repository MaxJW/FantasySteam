<script lang="ts">
	import type { Game } from '$lib/db';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { ExternalLink } from '@lucide/svelte';

	interface Props {
		game: Game & { id: string };
		footer?: import('svelte').Snippet;
	}

	let { game, footer }: Props = $props();
</script>

<div class="flex flex-col gap-5">
	<!-- Header: cover + title & meta -->
	<div class="flex gap-5">
		{#if game.coverUrl}
			<img
				src={game.coverUrl}
				alt=""
				class="h-40 w-28 shrink-0 rounded-lg object-cover shadow-md ring-1 ring-border/50"
			/>
		{:else}
			<div
				class="flex h-40 w-28 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-center text-xs text-muted-foreground ring-1 ring-border/50"
			>
				No cover
			</div>
		{/if}
		<div class="min-w-0 flex-1 space-y-3">
			<h3 class="text-xl leading-tight font-semibold tracking-tight">{game.name}</h3>
			{#if game.companies?.length}
				<p class="text-sm text-muted-foreground italic">
					{game.companies.join(', ')}
				</p>
			{/if}
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
				<dt class="text-muted-foreground">Release</dt>
				<dd>
					<Badge variant="secondary" class="font-normal">{game.releaseDate ?? 'TBA'}</Badge>
				</dd>
				{#if game.score != null}
					<dt class="text-muted-foreground">Score</dt>
					<dd>
						<span class="font-mono font-medium tabular-nums"
							>{Math.round(game.score).toLocaleString()}</span
						>
					</dd>
				{/if}
				{#if game.genres?.length}
					<dt class="text-muted-foreground">Genres</dt>
					<dd>
						{#each game.genres as genre}
							<Badge variant="secondary" class="mr-1 font-normal">{genre}</Badge>
						{/each}
					</dd>
				{/if}
			</dl>
			<div class="flex flex-wrap items-center gap-2 pt-0.5">
				{#if game.steamAppId}
					<Button
						variant="outline"
						size="sm"
						href="https://store.steampowered.com/app/{game.steamAppId}"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5"
					>
						<ExternalLink class="h-3.5 w-3.5" />
						Steam
					</Button>
				{/if}
			</div>
		</div>
	</div>

	{#if game.description}
		<div class="mb-6 space-y-2">
			<h4 class="text-sm font-medium text-muted-foreground">Description</h4>
			<ScrollArea class="rounded-lg border bg-muted/30 p-4">
				<p class="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
					{game.description}
				</p>
			</ScrollArea>
		</div>
	{/if}

	{#if footer}
		<div class="mt-6 border-t pt-4">
			{@render footer()}
		</div>
	{/if}
</div>
