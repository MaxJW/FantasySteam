<script lang="ts">
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/auth';
	import { getLeagueByCode, joinLeague } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ArrowLeft, Users } from '@lucide/svelte';

	let code = $state('');
	let teamName = $state('My Studio');
	let loading = $state(false);
	let error = $state('');

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

<div class="mx-auto max-w-md">
	<div class="mb-4">
		<Button
			variant="ghost"
			href="/dashboard"
			class="gap-1.5 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft class="h-4 w-4" /> Back
		</Button>
	</div>

	<div class="glass overflow-hidden rounded-xl">
		<div class="h-1 w-full bg-gradient-to-r from-primary/60 via-primary/30 to-transparent"></div>
		<div class="flex flex-col items-center gap-3 border-b border-white/[0.06] p-6">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
				<Users class="h-6 w-6 text-primary" />
			</div>
			<div class="text-center">
				<h1 class="text-xl font-semibold">Join a League</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Enter the invite code from your league commissioner.
				</p>
			</div>
		</div>
		<form onsubmit={handleSubmit}>
			<div class="space-y-4 p-5">
				<div class="space-y-2">
					<Label for="teamName">Your Team Name</Label>
					<Input
						id="teamName"
						bind:value={teamName}
						placeholder="My Studio"
						class="h-10 border-white/[0.08] bg-white/[0.03]"
					/>
				</div>
				<div class="space-y-2">
					<Label for="code">Invite Code</Label>
					<Input
						id="code"
						bind:value={code}
						required
						placeholder="e.g. STEAM26"
						class="h-12 border-white/[0.08] bg-white/[0.03] text-center text-lg tracking-[0.2em] uppercase"
					/>
				</div>
				{#if error}
					<div
						class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
					>
						{error}
					</div>
				{/if}
			</div>
			<div class="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] p-5">
				<Button type="submit" class="glow-sm-primary w-full" disabled={loading}>
					{loading ? 'Joining...' : 'Join League'}
				</Button>
				<Button variant="ghost" href="/dashboard" class="w-full">Cancel</Button>
			</div>
		</form>
	</div>
</div>
