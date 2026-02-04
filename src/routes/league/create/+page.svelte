<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import { createLeague } from '$lib/db';
	import type { LeagueSettings } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card';

	let name = $state('');
	let code = $state('');
	let teamName = $state('My Studio');
	let seasonalPicks = $state(4);
	let hypeMultiplier = $state(1);
	let loading = $state(false);
	let error = $state('');

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) goto('/');
		});
		return unsub;
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const user = getCurrentUser();
		if (!user) return;
		loading = true;
		error = '';
		try {
			const settings: LeagueSettings = {
				seasonalPicks,
				hypeMultiplier
			};
			const id = await createLeague(
				user.uid,
				name.trim(),
				code.trim() || generateCode(),
				settings,
				teamName.trim() || 'My Studio'
			);
			await goto(`/league/${id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create league';
		} finally {
			loading = false;
		}
	}

	function generateCode(): string {
		return Math.random().toString(36).slice(2, 8).toUpperCase();
	}
</script>

<svelte:head><title>Create League</title></svelte:head>

<div class="mx-auto max-w-md py-10">
	<Card>
		<CardHeader>
			<CardTitle class="text-2xl">Create a League</CardTitle>
		</CardHeader>
		<form onsubmit={handleSubmit}>
			<CardContent class="space-y-4">
				<div class="space-y-2">
					<Label for="name">League Name</Label>
					<Input id="name" bind:value={name} required placeholder="My Awesome League" />
				</div>
				<div class="space-y-2">
					<Label for="teamName">Your Team Name</Label>
					<Input id="teamName" bind:value={teamName} placeholder="My Studio" />
				</div>
				<div class="space-y-2">
					<Label for="code"
						>Invite Code <span class="text-xs font-normal text-muted-foreground">(Optional)</span
						></Label
					>
					<Input id="code" bind:value={code} placeholder="Leave blank to auto-generate" />
				</div>
				<div class="space-y-2">
					<Label for="seasonalPicks">Seasonal Picks</Label>
					<Input id="seasonalPicks" type="number" min="3" max="5" bind:value={seasonalPicks} />
				</div>
				{#if error}
					<p class="text-sm font-medium text-destructive">{error}</p>
				{/if}
			</CardContent>
			<CardFooter class="flex flex-col gap-2">
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Creating...' : 'Create League'}
				</Button>
				<Button variant="ghost" href="/dashboard" class="w-full">Cancel</Button>
			</CardFooter>
		</form>
	</Card>
</div>
