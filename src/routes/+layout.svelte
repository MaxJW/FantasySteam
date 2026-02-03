<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, signOut } from '$lib/auth';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
	let user = $state(get(currentUser));
	currentUser.subscribe((u) => (user = u));
	const path = $derived(get(page).url.pathname);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<nav class="border-b border-[#3d5a80] bg-[#171a21] shadow-lg">
	<div class="mx-auto max-w-4xl px-4 sm:px-6 flex items-center justify-between h-14">
		<a href="/" class="font-semibold text-[#c7d5e0] hover:text-[#66c0f4] transition-colors">Fantasy Steam League</a>
		<div class="flex items-center gap-4">
			{#if user}
				<a href="/dashboard" class="text-sm {path === '/dashboard' ? 'font-medium text-[#66c0f4]' : 'text-[#8f98a0] hover:text-[#66c0f4]'} transition-colors">Dashboard</a>
				<span class="text-sm text-[#8f98a0] truncate max-w-[120px] sm:max-w-[200px]">{user.email}</span>
				<button type="button" onclick={() => signOut()} class="text-sm text-[#8f98a0] hover:text-[#66c0f4] transition-colors">Sign out</button>
			{:else if path !== '/'}
				<a href="/" class="text-sm text-[#8f98a0] hover:text-[#66c0f4] transition-colors">Home</a>
			{/if}
		</div>
	</div>
</nav>
<main class="min-h-[calc(100vh-3.5rem)] bg-[#1b2838]">
	{@render children()}
</main>
