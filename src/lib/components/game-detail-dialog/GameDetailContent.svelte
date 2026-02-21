<script lang="ts">
	import type { Game } from '$lib/db';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import BookmarkCheck from '@lucide/svelte/icons/bookmark-check';

	interface Props {
		game: Game & { id: string };
		footer?: import('svelte').Snippet;
		isBookmarked?: boolean;
		onToggleBookmark?: () => void;
	}

	let { game, footer, isBookmarked = false, onToggleBookmark }: Props = $props();
</script>

<div class="relative flex flex-col gap-5">
	{#if onToggleBookmark}
		<Button
			variant="ghost"
			size="icon"
			class="absolute top-0 right-0 z-10 size-8  shrink-0"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onToggleBookmark();
			}}
			aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
		>
			{#if isBookmarked}
				<BookmarkCheck class="size-5  text-yellow-400" />
			{:else}
				<Bookmark class="h-5 w-5 text-muted-foreground" />
			{/if}
		</Button>
	{/if}
	<div class="flex gap-4">
		{#if game.coverUrl}
			<img
				src={game.coverUrl}
				alt=""
				class="h-36 w-24 shrink-0 rounded-lg object-cover shadow-lg ring-1 ring-white/8"
			/>
		{:else}
			<div
				class="flex h-36 w-24 shrink-0 items-center justify-center rounded-lg bg-white/4 text-center text-xs text-muted-foreground ring-1 ring-white/8"
			>
				No cover
			</div>
		{/if}
		<div class="min-w-0 flex-1 space-y-2.5">
			<h3 class="text-lg/tight  font-semibold tracking-tight">{game.name}</h3>
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
						class="inline-flex items-center gap-1.5 border-white/8 text-xs"
					>
						<ExternalLink class="size-3 " />
						Steam Store
					</Button>
				{/if}
			</div>
		</div>
	</div>

	{#if game.description}
		<div class="space-y-2">
			<h4 class="text-xs font-medium text-muted-foreground uppercase">Description</h4>
			<ScrollArea class="max-h-40 rounded-lg border border-white/6 bg-white/2 p-4">
				<p class="text-sm/relaxed  whitespace-pre-wrap text-muted-foreground">
					{game.description}
				</p>
			</ScrollArea>
		</div>
	{/if}

	{#if footer}
		<div class="border-t border-white/6 pt-4">
			{@render footer()}
		</div>
	{/if}
</div>
