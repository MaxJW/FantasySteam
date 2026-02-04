<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/auth';
	import { getLeaguesForUser } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardDescription,
		CardFooter
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Plus, LogIn } from '@lucide/svelte';

	let leagues = $state<Awaited<ReturnType<typeof getLeaguesForUser>>>([]);
	let loading = $state(true);

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) goto('/');
		});
		return unsub;
	});

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
</script>

<svelte:head><title>Dashboard</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-8">
	<div class="flex items-center justify-between">
		<h1 class="text-3xl font-bold tracking-tight">My Leagues</h1>
		<div class="flex gap-2">
			<Button variant="outline" href="/league/join" class="gap-2">
				<LogIn class="h-4 w-4" /> Join
			</Button>
			<Button href="/league/create" class="gap-2">
				<Plus class="h-4 w-4" /> Create
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(3) as _}
				<div class="h-40 animate-pulse rounded-xl bg-muted/50"></div>
			{/each}
		</div>
	{:else if leagues.length === 0}
		<Card class="border-2 border-dashed bg-transparent py-12 text-center">
			<CardContent class="space-y-4">
				<p class="text-muted-foreground">You don't have any active leagues.</p>
				<Button href="/league/create">Get Started</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each leagues as league}
				<a href="/league/{league.id}" class="group block">
					<Card class="h-full transition-all hover:border-primary/50 hover:bg-card/80">
						<CardHeader>
							<div class="flex items-start justify-between">
								<CardTitle class="text-xl transition-colors group-hover:text-primary"
									>{league.name}</CardTitle
								>
								<Badge variant={league.status === 'active' ? 'default' : 'secondary'}
									>{league.status}</Badge
								>
							</div>
							<CardDescription>Season {league.season}</CardDescription>
						</CardHeader>
						<CardContent>
							<p class="text-sm text-muted-foreground">
								Code: <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
									>{league.code}</span
								>
							</p>
						</CardContent>
					</Card>
				</a>
			{/each}
		</div>
	{/if}
</div>
