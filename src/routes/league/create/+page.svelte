<script lang="ts">
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/auth';
	import { createLeague } from '$lib/db';
	import type { LeagueSettings } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let name = $state('');
	let code = $state('');
	let teamName = $state('My Studio');
	let seasonalPicks = $state(4);
	let loading = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		const user = getCurrentUser();
		if (!user) return;
		loading = true;
		error = '';
		try {
			const settings: LeagueSettings = {
				seasonalPicks
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

<div class="mx-auto max-w-lg">
	<Card.Root
		class="overflow-hidden border-primary/20 bg-card/80 shadow-xl shadow-primary/5 backdrop-blur-sm"
	>
		<div class="h-1 w-full bg-linear-to-r from-primary via-primary/80 to-accent"></div>
		<Card.Header class="pb-2">
			<Card.Title class="text-xl font-semibold text-foreground">League settings</Card.Title>
			<p class="text-sm text-muted-foreground">Name your league and choose how to invite others.</p>
		</Card.Header>
		<form onsubmit={handleSubmit}>
			<Card.Content class="space-y-6">
				<div class="space-y-2">
					<Label for="name" class="text-foreground">League Name</Label>
					<Input
						id="name"
						bind:value={name}
						required
						placeholder="e.g. Steam Legends 2025"
						class="h-10"
					/>
				</div>
				<div class="space-y-2">
					<Label for="teamName" class="text-foreground">Your Team Name</Label>
					<Input id="teamName" bind:value={teamName} placeholder="e.g. My Studio" class="h-10" />
				</div>
				<div class="space-y-2">
					<Label for="code" class="text-foreground"
						>Invite Code
						<span class="ml-1 text-xs font-normal text-muted-foreground">(optional)</span></Label
					>
					<Input
						id="code"
						bind:value={code}
						placeholder="Leave blank to auto-generate"
						class="h-10 font-mono uppercase placeholder:font-sans placeholder:normal-case"
					/>
				</div>
				<div class="space-y-2">
					<Label for="seasonalPicks" class="text-foreground">Seasonal Picks</Label>
					<div class="flex items-center gap-3">
						<Input
							id="seasonalPicks"
							type="number"
							min="3"
							max="5"
							bind:value={seasonalPicks}
							class="h-10 w-20 text-center tabular-nums"
						/>
						<span class="text-sm text-muted-foreground">games per season (3–5)</span>
					</div>
				</div>
				{#if error}
					<div
						class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
					>
						{error}
					</div>
				{/if}
			</Card.Content>
			<Card.Footer
				class="flex flex-col gap-3 border-t border-border/50 bg-muted/20 px-6 py-5 sm:flex-row-reverse"
			>
				<Button type="submit" class="w-full sm:w-auto sm:min-w-[140px]" disabled={loading}>
					{loading ? 'Creating...' : 'Create League'}
				</Button>
				<Button variant="ghost" href="/dashboard" class="w-full sm:w-auto">Cancel</Button>
			</Card.Footer>
		</form>
	</Card.Root>
</div>
