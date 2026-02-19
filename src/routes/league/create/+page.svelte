<script lang="ts">
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/auth';
	import { createLeague } from '$lib/db';
	import type { LeagueSettings } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ArrowLeft } from '@lucide/svelte';

	let name = $state('');
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
			const settings: LeagueSettings = {};
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
		<div class="h-1 w-full bg-gradient-to-r from-primary via-primary/60 to-accent/40"></div>
		<div class="border-b border-white/[0.06] p-5">
			<h1 class="text-xl font-semibold">Create League</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Name your league and configure the draft settings.
			</p>
		</div>
		<form onsubmit={handleSubmit}>
			<div class="space-y-5 p-5">
				<div class="space-y-2">
					<Label for="name">League Name</Label>
					<Input
						id="name"
						bind:value={name}
						required
						placeholder="e.g. Steam Legends 2026"
						class="h-10 border-white/[0.08] bg-white/[0.03]"
					/>
				</div>
				<div class="space-y-2">
					<Label for="teamName">Your Team Name</Label>
					<Input
						id="teamName"
						bind:value={teamName}
						placeholder="e.g. My Studio"
						class="h-10 border-white/[0.08] bg-white/[0.03]"
					/>
				</div>
				<div class="space-y-2">
					<Label for="code">
						Invite Code
						<span class="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Input
						id="code"
						bind:value={code}
						placeholder="Leave blank to auto-generate"
						class="h-10 border-white/[0.08] bg-white/[0.03] font-mono uppercase placeholder:font-sans placeholder:normal-case"
					/>
				</div>
				{#if error}
					<div
						class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						{error}
					</div>
				{/if}
			</div>
			<div
				class="flex flex-col gap-2 border-t border-white/[0.06] bg-white/[0.02] p-5 sm:flex-row-reverse"
			>
				<Button
					type="submit"
					class="glow-sm-primary w-full sm:w-auto sm:min-w-[140px]"
					disabled={loading}
				>
					{loading ? 'Creating...' : 'Create League'}
				</Button>
				<Button variant="ghost" href="/dashboard" class="w-full sm:w-auto">Cancel</Button>
			</div>
		</form>
	</div>
</div>
