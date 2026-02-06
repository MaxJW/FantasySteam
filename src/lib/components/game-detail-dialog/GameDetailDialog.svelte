<script lang="ts">
	import type { Game } from '$lib/db';
	import * as Dialog from '$lib/components/ui/dialog';
	import GameDetailContent from './GameDetailContent.svelte';
	import { LoaderCircle } from '@lucide/svelte';

	interface Props {
		/** When true, render only the content (no Dialog wrapper). Use inside an existing dialog (e.g. draft). */
		embedded?: boolean;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		game: (Game & { id: string }) | null;
		loading: boolean;
		title?: string;
		/** When true and !game && !loading, show "Game not found." (e.g. browse games). */
		showNotFound?: boolean;
		/** Optional footer (e.g. "Confirm Pick" on draft). Hidden when not provided (e.g. browse games). */
		footer?: import('svelte').Snippet;
	}

	let {
		embedded = false,
		open = false,
		onOpenChange,
		game,
		loading,
		title = 'Game details',
		showNotFound = false,
		footer
	}: Props = $props();
</script>

{#if embedded}
	{#if loading}
		<div class="flex h-full items-center justify-center">
			<LoaderCircle class="animate-spin text-primary" />
		</div>
	{:else if game}
		{#if footer}
			<!-- Split layout: scrollable content + fixed footer so Confirm Pick is always visible -->
			<div class="flex h-full min-h-0 flex-col">
				<div class="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
					<GameDetailContent {game} />
				</div>
				<div class="shrink-0 border-t bg-muted/30 px-6 py-4">
					{@render footer()}
				</div>
			</div>
		{:else}
			<div class="flex h-full flex-col">
				<GameDetailContent {game} />
			</div>
		{/if}
	{/if}
{:else}
	<Dialog.Root bind:open {onOpenChange}>
		<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-2xl">
			<div class="border-b px-6 py-4">
				<Dialog.Title class="text-xl">{title}</Dialog.Title>
			</div>
			<div class="max-h-[70vh] overflow-y-auto px-6 py-5">
				{#if loading}
					<div class="flex min-h-[200px] items-center justify-center">
						<LoaderCircle class="h-8 w-8 animate-spin text-primary" />
					</div>
				{:else if game}
					<GameDetailContent {game} {footer} />
				{:else if showNotFound}
					<p class="text-center text-muted-foreground">Game not found.</p>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
