<script lang="ts">
	import { goto } from '$app/navigation';
	import { getCurrentUser } from '$lib/auth';
	import { createLeague, LEAGUE_CODE_IN_USE } from '$lib/db';
	import type { LeagueSettings } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { getDefaultStudioName } from '$lib/utils';

	const defaultStudio = () => getDefaultStudioName(getCurrentUser()?.displayName);
	let name = $state('');
	let code = $state('');
	let studioName = $state(defaultStudio());
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
			let codeToUse = generateCode();
			const maxRetries = 5;
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					const id = await createLeague(
						user.uid,
						name.trim(),
						codeToUse,
						settings,
						studioName.trim() || defaultStudio()
					);
					await goto(`/league/${id}`);
					return;
				} catch (err) {
					if (
						err instanceof Error &&
						err.message === LEAGUE_CODE_IN_USE &&
						attempt < maxRetries - 1
					) {
						codeToUse = generateCode();
						continue;
					}
					throw err;
				}
			}
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
		<div class="h-1 w-full bg-linear-to-r from-primary via-primary/60 to-accent/40"></div>
		<div class="border-b border-white/6 p-5">
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
						class="h-10 border-white/8 bg-white/3"
					/>
				</div>
				<div class="space-y-2">
					<Label for="studioName">Your Studio Name</Label>
					<Input
						id="studioName"
						bind:value={studioName}
						placeholder="e.g. John's Studio"
						class="h-10 border-white/8 bg-white/3"
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
			<div class="flex flex-col gap-2 border-t border-white/6 bg-white/2 p-5 sm:flex-row-reverse">
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
