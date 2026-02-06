<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import { getLeagueByCode, joinLeague } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let code = $state('');
	let teamName = $state('My Studio');
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
			const league = await getLeagueByCode(code.trim());
			if (!league) {
				error = 'No league found with that code';
				loading = false;
				return;
			}
			await joinLeague(league.id, user.uid, teamName.trim() || 'My Studio');
			await goto(`/league/${league.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join league';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Join League</title></svelte:head>

<div class="mx-auto max-w-md py-10">
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">Join a League</Card.Title>
		</Card.Header>
		<form onsubmit={handleSubmit}>
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="teamName">Your Team Name</Label>
					<Input id="teamName" bind:value={teamName} placeholder="My Studio" />
				</div>
				<div class="space-y-2">
					<Label for="code">Invite Code</Label>
					<Input
						id="code"
						bind:value={code}
						required
						placeholder="e.g. STEAM26"
						class="text-center text-lg tracking-widest uppercase"
					/>
				</div>
				{#if error}
					<p class="text-center text-sm font-medium text-destructive">{error}</p>
				{/if}
			</Card.Content>
			<Card.Footer class="flex flex-col gap-2">
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Joining...' : 'Join League'}
				</Button>
				<Button variant="ghost" href="/dashboard" class="w-full">Cancel</Button>
			</Card.Footer>
		</form>
	</Card.Root>
</div>
