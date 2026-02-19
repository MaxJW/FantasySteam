<script lang="ts">
	import type { Game } from '$lib/db';
	import * as Dialog from '$lib/components/ui/dialog';
	import GameDetailContent from './GameDetailContent.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	interface Props {
		embedded?: boolean;
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		game: (Game & { id: string }) | null;
		loading: boolean;
		title?: string;
		showNotFound?: boolean;
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
			<div class="flex h-full min-h-0 flex-col">
				<div class="min-h-0 flex-1 overflow-y-auto px-5 pt-5">
					<GameDetailContent {game} />
				</div>
				<div class="shrink-0 border-t border-white/[0.06] bg-white/[0.02] px-5 py-4">
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
			<div class="border-b border-white/[0.06] px-5 py-4">
				<Dialog.Title class="text-lg font-semibold">{title}</Dialog.Title>
			</div>
			<div class="max-h-[70vh] overflow-y-auto px-5 py-5">
				{#if loading}
					<div class="flex min-h-[200px] items-center justify-center">
						<LoaderCircle class="h-6 w-6 animate-spin text-primary" />
					</div>
				{:else if game}
					<GameDetailContent {game} {footer} />
				{:else if showNotFound}
					<p class="py-10 text-center text-sm text-muted-foreground">Game not found.</p>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
