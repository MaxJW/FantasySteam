<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import { createLeague } from '$lib/db';
	import type { LeagueSettings } from '$lib/db';

	let name = $state('');
	let code = $state('');
	let seasonalPicks = $state(4);
	let pickTimer = $state(90);
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
				pickTimer,
				hypeMultiplier
			};
			const id = await createLeague(user.uid, name.trim(), code.trim() || generateCode(), settings);
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

<div class="mx-auto max-w-md p-6">
	<h1 class="text-2xl font-bold mb-6 text-[#c7d5e0]">Create a league</h1>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium mb-1 text-[#8f98a0]">League name</label>
			<input
				id="name"
				type="text"
				bind:value={name}
				required
				class="w-full rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] placeholder-[#8f98a0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
			/>
		</div>
		<div>
			<label for="code" class="block text-sm font-medium mb-1 text-[#8f98a0]">Invite code (leave blank to generate)</label>
			<input
				id="code"
				type="text"
				bind:value={code}
				placeholder="e.g. STEAM26"
				class="w-full rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] placeholder-[#8f98a0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
			/>
		</div>
		<div>
			<label for="seasonalPicks" class="block text-sm font-medium mb-1 text-[#8f98a0]">Seasonal picks per player</label>
			<input
				id="seasonalPicks"
				type="number"
				min="3"
				max="5"
				bind:value={seasonalPicks}
				class="w-full rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
			/>
		</div>
		<div>
			<label for="pickTimer" class="block text-sm font-medium mb-1 text-[#8f98a0]">Pick timer (seconds)</label>
			<input
				id="pickTimer"
				type="number"
				min="30"
				max="300"
				bind:value={pickTimer}
				class="w-full rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
			/>
		</div>
		{#if error}
			<p class="text-red-400 text-sm">{error}</p>
		{/if}
		<button
			type="submit"
			disabled={loading}
			class="w-full rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] disabled:opacity-50 transition-colors"
		>
			{loading ? 'Creating…' : 'Create league'}
		</button>
	</form>
	<p class="mt-4 text-sm text-[#8f98a0]">
		<a href="/dashboard" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to dashboard</a>
	</p>
</div>
