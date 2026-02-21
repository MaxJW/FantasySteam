<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Team } from '$lib/db';
	import type { ScoreBreakdown } from '$lib/db/types';
	import { getScoreBreakdown } from '$lib/db/types';
	import Target from '@lucide/svelte/icons/target';
	import Bomb from '@lucide/svelte/icons/bomb';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Sun from '@lucide/svelte/icons/sun';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Shuffle from '@lucide/svelte/icons/shuffle';

	interface Game {
		id: string;
		name: string;
		score?: number | null;
	}

	interface BombDamageItem {
		gameId: string;
		gameName: string;
		pickerTeamName: string;
		damage: number;
	}

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		team: (Team & { id: string }) | null;
		games: Record<string, Game>;
		delistedGames: string[];
		teamDisplayName?: string;
		bombBreakdown?: BombDamageItem[];
		onGameClick?: (gameId: string) => void;
	}

	let {
		open,
		onOpenChange,
		team,
		games,
		delistedGames = [],
		teamDisplayName = '',
		bombBreakdown = [],
		onGameClick
	}: Props = $props();

	const displayName = $derived(teamDisplayName || team?.name || 'Unknown');

	const breakdown = $derived.by((): ScoreBreakdown | null => {
		if (!team) return null;
		return getScoreBreakdown(
			team.picks,
			games,
			delistedGames,
			team.bombAdjustment ?? 0
		);
	});

	const groupedPicks = $derived.by(() => {
		if (!breakdown) return [];
		const items = breakdown.items.filter((i) => i.score !== 0);
		const groups = [
			{
				key: 'hit',
				label: 'Hit',
				items: items.filter((i) => i.pickType === 'hitPick'),
				border: 'border-accent/20',
				bg: 'bg-accent/5',
				divider: 'border-accent/10',
				iconColor: 'text-accent'
			},
			{
				key: 'winter',
				label: 'Winter',
				items: items.filter((i) => i.phase === 'winter'),
				border: 'border-sky-400/20',
				bg: 'bg-sky-400/5',
				divider: 'border-sky-400/10',
				iconColor: 'text-sky-400'
			},
			{
				key: 'summer',
				label: 'Summer',
				items: items.filter((i) => i.phase === 'summer'),
				border: 'border-amber-400/20',
				bg: 'bg-amber-400/5',
				divider: 'border-amber-400/10',
				iconColor: 'text-amber-400'
			},
			{
				key: 'fall',
				label: 'Fall',
				items: items.filter((i) => i.phase === 'fall'),
				border: 'border-amber-600/20',
				bg: 'bg-amber-600/5',
				divider: 'border-amber-600/10',
				iconColor: 'text-amber-600'
			}
		];
		return groups
			.map((g) => ({
				...g,
				subtotal: g.items.reduce((s, i) => s + i.score, 0)
			}))
			.filter((g) => g.items.length > 0);
	});

</script>

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-md">
		<div class="border-b border-white/[0.06] px-5 py-4">
			<Dialog.Title class="text-lg font-semibold">Score breakdown</Dialog.Title>
			<Dialog.Description class="mt-0.5 text-sm text-muted-foreground">
				{displayName}
			</Dialog.Description>
		</div>
		<div class="max-h-[60vh] overflow-y-auto px-5 py-4">
			{#if breakdown}
				<div class="space-y-3">
					{#each groupedPicks as group}
						<div
							class="overflow-hidden rounded-lg border {group.border} {group.bg}"
						>
							<div class="flex items-center gap-2 border-b {group.divider} px-3 py-2.5">
								{#if group.key === 'hit'}
									<Target class="h-4 w-4 shrink-0 {group.iconColor}" />
								{:else if group.key === 'winter'}
									<Snowflake class="h-4 w-4 shrink-0 {group.iconColor}" />
								{:else if group.key === 'summer'}
									<Sun class="h-4 w-4 shrink-0 {group.iconColor}" />
								{:else if group.key === 'fall'}
									<Leaf class="h-4 w-4 shrink-0 {group.iconColor}" />
								{/if}
								<p class="text-sm font-medium">{group.label}</p>
							</div>
							<div class="max-h-40 overflow-y-auto">
								{#each group.items as item}
									<button
										type="button"
										class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.04] focus:ring-2 focus:ring-ring focus:outline-none disabled:pointer-events-none disabled:opacity-50"
										onclick={() => onGameClick?.(item.gameId)}
										disabled={!onGameClick}
									>
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-medium">{item.gameName}</p>
											{#if item.label !== group.label}
												<p class="text-xs text-muted-foreground">{item.label}</p>
											{/if}
										</div>
										<span class="shrink-0 font-mono text-sm font-semibold tabular-nums">
											+{Math.round(item.score)}
										</span>
									</button>
								{/each}
							</div>
							<div
								class="flex items-center justify-between border-t {group.divider} bg-white/[0.02] px-3 py-2"
							>
								<span class="text-xs font-medium text-muted-foreground">Subtotal</span>
								<span class="font-mono text-sm font-semibold tabular-nums">
									+{Math.round(group.subtotal)}
								</span>
							</div>
						</div>
					{/each}

					{#if (team?.bombAdjustment ?? 0) !== 0}
						<div class="overflow-hidden rounded-lg border border-destructive/20 bg-destructive/5">
							<div class="flex items-center gap-2 border-b border-destructive/10 px-3 py-2.5">
								<Bomb class="h-4 w-4 shrink-0 text-destructive" />
								<div>
									<p class="text-sm font-medium">Bomb damage received</p>
									<p class="text-xs text-muted-foreground">
										From other players' bomb picks
									</p>
								</div>
							</div>
							{#if bombBreakdown.length > 0}
								<div class="max-h-40 overflow-y-auto">
									{#each bombBreakdown as item}
										<button
											type="button"
											class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-destructive/10 focus:ring-2 focus:ring-ring focus:outline-none disabled:pointer-events-none disabled:opacity-50"
											onclick={() => onGameClick?.(item.gameId)}
											disabled={!onGameClick}
										>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-medium">{item.gameName}</p>
												<p class="text-xs text-muted-foreground">
													{item.pickerTeamName}'s bomb
												</p>
											</div>
											<span class="shrink-0 font-mono text-sm font-semibold tabular-nums text-destructive">
												{Math.round(item.damage)}
											</span>
										</button>
									{/each}
								</div>
							{/if}
							<div
								class="flex items-center justify-between border-t border-destructive/10 bg-destructive/5 px-3 py-2"
							>
								<span class="text-xs font-medium text-muted-foreground">Subtotal</span>
								<span class="font-mono text-sm font-semibold tabular-nums text-destructive">
									{Math.round(breakdown.bombAdjustment)}
								</span>
							</div>
						</div>
					{/if}

					<div
						class="flex items-center justify-between border-t border-white/[0.06] pt-3"
					>
						<p class="font-semibold">Total</p>
						<span class="font-mono text-lg font-bold tabular-nums text-primary">
							{Math.round(breakdown.total)}
						</span>
					</div>
				</div>
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">
					No score data available.
				</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
