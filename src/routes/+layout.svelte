<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, signOut } from '$lib/auth';
	import favicon from '$lib/assets/favicon.svg';
	import { Button } from '$lib/components/ui/button';

	let { children } = $props();
	let user = $state(get(currentUser));
	currentUser.subscribe((u) => (user = u));
	const path = $derived(get(page).url.pathname);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col bg-background">
	<header
		class="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
	>
		<div class="container mx-auto flex h-16 items-center justify-between px-4">
			<div class="flex items-center gap-6">
				<a
					href="/"
					class="flex items-center gap-2 text-xl font-bold tracking-tight text-primary transition-opacity hover:opacity-80"
				>
					<span class="text-foreground">Fantasy</span>Steam
				</a>
				{#if user}
					<nav class="hidden gap-4 md:flex">
						<a
							href="/dashboard"
							class="text-sm font-medium transition-colors hover:text-primary {path === '/dashboard'
								? 'text-primary'
								: 'text-muted-foreground'}"
						>
							Dashboard
						</a>
						<a
							href="/games"
							class="text-sm font-medium transition-colors hover:text-primary {path === '/games'
								? 'text-primary'
								: 'text-muted-foreground'}"
						>
							Browse Games
						</a>
					</nav>
				{/if}
			</div>

			<div class="flex items-center gap-4">
				{#if user}
					<div class="flex items-center gap-4">
						<span class="hidden text-xs text-muted-foreground sm:inline-block">{user.email}</span>
						<Button variant="ghost" size="sm" onclick={() => signOut()}>Sign out</Button>
					</div>
				{:else if path !== '/'}
					<Button variant="ghost" href="/">Home</Button>
				{/if}
			</div>
		</div>
	</header>

	<main class="container mx-auto flex-1 px-4 py-8">
		{@render children()}
	</main>
</div>
