<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/auth';
	import { getLeaguesForUser } from '$lib/db';

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

<div class="mx-auto max-w-2xl p-6">
	<h1 class="text-2xl font-bold mb-6 text-[#c7d5e0]">My leagues</h1>
	{#if loading}
		<p class="text-[#8f98a0]">Loading…</p>
	{:else if leagues.length === 0}
		<p class="text-[#8f98a0] mb-4">You’re not in any leagues yet.</p>
		<p class="text-[#c7d5e0]">
			<a href="/league/create" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Create a league</a>
			or
			<a href="/league/join" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">join with a code</a>.
		</p>
	{:else}
		<ul class="space-y-3">
			{#each leagues as league}
				<li>
					<a
						href="/league/{league.id}"
						class="block rounded border border-[#3d5a80] p-4 bg-[#2a475e] hover:bg-[#3d6a8a] transition-colors"
					>
						<span class="font-medium text-[#c7d5e0]">{league.name}</span>
						<span class="text-sm text-[#8f98a0] ml-2">({league.code})</span>
						<span class="text-sm text-[#a4d007] ml-2">— {league.status}</span>
					</a>
				</li>
			{/each}
		</ul>
		<p class="mt-6 text-[#c7d5e0]">
			<a href="/league/create" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Create league</a>
			·
			<a href="/league/join" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Join league</a>
		</p>
	{/if}
</div>
