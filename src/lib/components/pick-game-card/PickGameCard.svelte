<script lang="ts">
	import Target from '@lucide/svelte/icons/target';
	import Bomb from '@lucide/svelte/icons/bomb';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Sun from '@lucide/svelte/icons/sun';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import { PHASE_CONFIG } from '$lib/db/types';
	import type { DraftPhase } from '$lib/db/types';

	interface Game {
		id: string;
		name: string;
		coverUrl?: string | null;
		score?: number | null;
	}

	type PickType = 'hitPick' | 'bombPick' | 'seasonalPick' | 'altPick';

	interface Props {
		game: Game;
		pickType: PickType;
		phase?: DraftPhase;
		isPastSeasonView?: boolean;
		/** For bomb received from another team: custom label (e.g. "Studio A's bomb") */
		bombReceivedLabel?: string;
		/** For bomb received: damage dealt to this player (shown as negative) */
		bombDamageReceived?: number;
		onclick: () => void;
	}

	let {
		game,
		pickType,
		phase = 'winter',
		isPastSeasonView = false,
		bombReceivedLabel,
		bombDamageReceived,
		onclick
	}: Props = $props();

	const isBombReceived = $derived(
		pickType === 'bombPick' && bombReceivedLabel != null && bombDamageReceived != null
	);

	const config = $derived.by(() => {
		switch (pickType) {
			case 'hitPick':
				return {
					icon: Target,
					label: 'Hit',
					color: 'text-accent',
					hoverBorder: 'hover:border-accent/40',
					border: 'border-white/[0.08]'
				};
			case 'bombPick':
				return {
					icon: Bomb,
					label: 'Bomb',
					color: 'text-destructive',
					hoverBorder: 'hover:border-destructive/40',
					border: 'border-white/[0.08]'
				};
			case 'seasonalPick':
				const phaseIcons = { winter: Snowflake, summer: Sun, fall: Leaf } as const;
				const phaseColors = {
					winter: 'text-sky-400',
					summer: 'text-amber-400',
					fall: 'text-amber-600'
				} as const;
				return {
					icon: phaseIcons[phase],
					label: PHASE_CONFIG[phase].label,
					color: phaseColors[phase],
					hoverBorder: 'hover:border-sky-400/40',
					border: 'border-white/[0.08]'
				};
			case 'altPick':
				return {
					icon: Shuffle,
					label: 'Alt',
					color: 'text-purple-400',
					hoverBorder: 'hover:border-purple-400/40',
					border: 'border-dashed border-purple-400/20'
				};
		}
	});

	const showScore = $derived(
		pickType === 'hitPick' || pickType === 'seasonalPick' || isBombReceived
	);
	const displayLabel = $derived(isBombReceived ? bombReceivedLabel! : config.label);
	const Icon = $derived(config.icon);
</script>

<button
	type="button"
	class="group relative block w-full cursor-pointer overflow-hidden rounded-lg text-left transition-all focus:ring-2 focus:ring-ring focus:outline-none {config.border} {config.hoverBorder} {pickType ===
	'altPick'
		? 'opacity-60 hover:opacity-100'
		: ''} hover:shadow-md"
	{onclick}
>
	{#if game.coverUrl}
		<img src={game.coverUrl} alt={game.name} class="aspect-[3/4] w-full object-cover" />
	{:else}
		<div class="flex aspect-[3/4] w-full items-center justify-center bg-muted">
			<span class="px-1 text-center text-[9px] text-muted-foreground">{game.name}</span>
		</div>
	{/if}
	<div
		class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/80 px-2 py-1.5"
	>
		<div class="flex min-w-0 flex-1 items-center gap-1">
			<Icon class="h-3.5 w-3.5 shrink-0 {config.color}" />
			<span class="truncate text-xs font-medium text-white">{displayLabel}</span>
		</div>
		<div class="flex h-4 min-w-6 shrink-0 items-center justify-end">
			{#if showScore}
				{#if isBombReceived}
					<span
						class="font-mono text-xs font-bold text-destructive"
						title="{Math.round(bombDamageReceived!)} damage from this bomb"
					>
						{Math.round(bombDamageReceived!)}
					</span>
				{:else if !isPastSeasonView && game.score != null}
					<span class="font-mono text-xs font-bold text-white">{Math.round(game.score)}</span>
				{:else if isPastSeasonView}
					<span class="text-xs text-white/70">—</span>
				{/if}
			{/if}
		</div>
	</div>
</button>
