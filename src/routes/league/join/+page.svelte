<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import { getLeagueByCode, joinLeague } from '$lib/db';

	let code = $state('');
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
			await joinLeague(league.id, user.uid);
			await goto(`/league/${league.id}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to join league';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head><title>Join League</title></svelte:head>

<div class="mx-auto max-w-md p-6">
	<h1 class="text-2xl font-bold mb-6 text-[#c7d5e0]">Join a league</h1>
	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="code" class="block text-sm font-medium mb-1 text-[#8f98a0]">Invite code</label>
			<input
				id="code"
				type="text"
				bind:value={code}
				required
				placeholder="e.g. STEAM26"
				class="w-full rounded border border-[#3d5a80] bg-[#2a475e] px-3 py-2 text-[#c7d5e0] placeholder-[#8f98a0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
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
			{loading ? 'Joining…' : 'Join league'}
		</button>
	</form>
	<p class="mt-4 text-sm text-[#8f98a0]">
		<a href="/dashboard" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to dashboard</a>
	</p>
</div>
