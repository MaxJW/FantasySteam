<script lang="ts">
	import { currentUser } from '$lib/auth';
	import { getLeaguesForUser } from '$lib/db';
	import { isDraftWindowOpen, isPastSeason } from '$lib/db';
	import type { League } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Plus from '@lucide/svelte/icons/plus';
	import LogIn from '@lucide/svelte/icons/log-in';
	import Zap from '@lucide/svelte/icons/zap';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let leagues = $state<(League & { id: string })[]>([]);
	let loading = $state(true);

	$effect(() => {
		const unsub = currentUser.subscribe((user) => {
			if (!user) return;
			getLeaguesForUser(user.uid).then((list) => {
				leagues = list;
				loading = false;
			});
		});
		return unsub;
	});

	function getStatusLabel(league: League): string {
		if (league.status === 'completed') {
			return league.season && isPastSeason(league.season)
				? `Season ${league.season} Complete`
				: 'Completed';
		}
		if (league.status === 'draft') {
			const phase = league.currentPhase ?? 'winter';
			// If currentPhase is summer/fall, we've completed at least one draft — we're in the season
			if (phase !== 'winter') return 'Scoring';
			const open = league.season && isDraftWindowOpen(phase, league.season);
			return open ? 'Drafting' : 'Pre-Season';
		}
		return 'Scoring';
	}

	function getPhaseProgress(league: League): number {
		const phases = ['winter', 'summer', 'fall'] as const;
		if (league.status === 'completed') return 3;
		return phases.indexOf(league.currentPhase);
	}
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-8">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">My Leagues</h1>
			<p class="mt-1 text-sm text-muted-foreground">Manage and view your fantasy leagues</p>
		</div>
		<div class="flex gap-2">
			<Button
				variant="outline"
				href="/league/join"
				class="gap-2 border-white/8 hover:border-white/15"
			>
				<LogIn class="h-4 w-4" /> Join
			</Button>
			<Button href="/league/create" class="glow-sm-primary gap-2">
				<Plus class="h-4 w-4" /> Create
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _, i}
				<div
					class="animate-fade-in-up rounded-xl border border-white/6 bg-card/50 p-6"
					style="animation-delay: {i * 0.1}s"
				>
					<div class="space-y-3">
						<div class="h-5 w-2/3 animate-pulse rounded bg-white/6"></div>
						<div class="h-4 w-1/3 animate-pulse rounded bg-white/4"></div>
						<div class="mt-4 h-2 w-full rounded-full bg-white/4"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if leagues.length === 0}
		<div class="glass flex flex-col items-center rounded-xl py-16 text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
				<Zap class="h-8 w-8 text-primary" />
			</div>
			<h2 class="text-lg font-semibold text-foreground">No leagues yet</h2>
			<p class="mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
				Create a new league to start drafting games, or join one with an invite code.
			</p>
			<div class="flex gap-3">
				<Button variant="outline" href="/league/join" class="gap-2">
					<LogIn class="h-4 w-4" /> Join League
				</Button>
				<Button href="/league/create" class="glow-sm-primary gap-2">
					<Plus class="h-4 w-4" /> Create League
				</Button>
			</div>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each leagues as league, i}
				<a
					href="/league/{league.id}"
					class="group block animate-fade-in-up cursor-pointer"
					style="animation-delay: {i * 0.06}s"
				>
					<div
						class="relative overflow-hidden rounded-xl border border-white/6 bg-card/60 transition-all duration-200 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5"
					>
						<div
							class="h-1 w-full bg-linear-to-r from-primary/60 via-primary/30 to-transparent"
						></div>
						<div class="p-5">
							<div class="flex items-start justify-between gap-2">
								<h3
									class="text-lg font-semibold text-foreground transition-colors group-hover:text-primary"
								>
									{league.name}
								</h3>
								<Badge
									variant={league.status === 'active'
										? 'default'
										: league.status === 'completed'
											? 'secondary'
											: 'outline'}
									class="shrink-0 text-[10px]"
								>
									{getStatusLabel(league)}
								</Badge>
							</div>

							<div class="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
								<span>Season {league.season}</span>
								<span class="text-border">|</span>
								<span
									class="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-foreground"
								>
									{league.code}
								</span>
							</div>

							<!-- Phase progress -->
							<div class="mt-4 flex items-center gap-2">
								<div class="flex flex-1 gap-1">
									{#each [0, 1, 2] as step}
										<div
											class="h-1.5 flex-1 rounded-full transition-colors {step <
											getPhaseProgress(league)
												? 'bg-accent'
												: step === getPhaseProgress(league) &&
													  league.status !== 'draft' &&
													  league.status !== 'completed'
													? 'bg-primary'
													: 'bg-white/6'}"
										></div>
									{/each}
								</div>
								<span class="text-[10px] text-muted-foreground">
									{getPhaseProgress(league)}/3 drafts
								</span>
								<ChevronRight
									class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
								/>
							</div>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
