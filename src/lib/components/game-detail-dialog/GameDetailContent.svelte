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
	<div class="flex gap-4">
		{#if game.coverUrl}
			<img
				src={game.coverUrl}
				alt=""
				class="h-36 w-24 shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/[0.08]"
			/>
		{:else}
			<div
				class="flex h-36 w-24 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-center text-xs text-muted-foreground ring-1 ring-white/[0.08]"
			>
				No cover
			</div>
		{/if}
		<div class="min-w-0 flex-1 space-y-2.5">
			<h3 class="text-lg leading-tight font-semibold tracking-tight">{game.name}</h3>
			{#if game.companies?.length}
				<p class="text-sm text-muted-foreground italic">
					{game.companies.join(', ')}
				</p>
			{/if}
			<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
				<dt class="text-muted-foreground">Release</dt>
				<dd>
					<Badge variant="secondary" class="text-[10px] font-normal"
						>{game.releaseDate ?? 'TBA'}</Badge
					>
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
					<dd class="flex flex-wrap gap-1">
						{#each game.genres as genre}
							<Badge variant="secondary" class="text-[10px] font-normal">{genre}</Badge>
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
						class="inline-flex items-center gap-1.5 border-white/[0.08] text-xs"
					>
						<ExternalLink class="h-3 w-3" />
						Steam Store
					</Button>
				{/if}
			</div>
		</div>
	</div>

	{#if game.description}
		<div class="space-y-2">
			<h4 class="text-xs font-medium text-muted-foreground uppercase">Description</h4>
			<ScrollArea class="max-h-40 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
				<p class="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
					{game.description}
				</p>
			</ScrollArea>
		</div>
	{/if}

	{#if footer}
		<div class="border-t border-white/[0.06] pt-4">
			{@render footer()}
		</div>
	{/if}
</div>
