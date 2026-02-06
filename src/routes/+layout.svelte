<script lang="ts">
	import './layout.css';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser } from '$lib/auth';
	import favicon from '$lib/assets/favicon.svg';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { LayoutDashboard, Gamepad2 } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let user = $state(get(currentUser));
	let path = $state(get(page).url.pathname);
	currentUser.subscribe((u) => (user = u));

	$effect(() => {
		const unsub = page.subscribe((p) => (path = p.url.pathname));
		return unsub;
	});

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (path !== '/' && u === null) goto('/');
		});
		return unsub;
	});

	function navLink(href: string, active: boolean) {
		return `flex flex-col items-center gap-1 px-4 py-2 text-xs font-medium transition-colors rounded-md min-w-0 flex-1 ${active ? 'text-primary' : 'text-muted-foreground'}`;
	}
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
					class="flex items-center text-xl font-bold tracking-tight text-primary transition-opacity hover:opacity-80"
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
					<a
						href="/profile"
						class="hidden shrink-0 rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none md:flex"
						aria-label="Profile"
					>
						<Avatar class="size-8">
							<AvatarImage src={user.photoURL ?? undefined} alt="" />
							<AvatarFallback class="text-xs">
								{user.displayName?.slice(0, 1).toUpperCase() ??
									user.email?.slice(0, 1).toUpperCase() ??
									'?'}
							</AvatarFallback>
						</Avatar>
					</a>
				{/if}
			</div>
		</div>
	</header>

	<main class="container mx-auto flex-1 px-4 py-8 pb-24 md:pb-8">
		{@render children()}
	</main>

	<!-- Mobile bottom bar: only when logged in, hidden on md+ -->
	{#if user}
		<nav
			class="fixed right-0 bottom-0 left-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
			aria-label="Main navigation"
		>
			<div class="flex w-full items-center justify-around px-2 py-2">
				<a
					href="/dashboard"
					class={navLink('/dashboard', path === '/dashboard')}
					aria-current={path === '/dashboard' ? 'page' : undefined}
				>
					<LayoutDashboard class="size-6 shrink-0" aria-hidden="true" />
					<span>Dashboard</span>
				</a>
				<a
					href="/games"
					class={navLink('/games', path === '/games')}
					aria-current={path === '/games' ? 'page' : undefined}
				>
					<Gamepad2 class="size-6 shrink-0" aria-hidden="true" />
					<span>Browse Games</span>
				</a>
				<a
					href="/profile"
					class={navLink('/profile', path === '/profile')}
					aria-current={path === '/profile' ? 'page' : undefined}
				>
					<Avatar class="size-6 shrink-0">
						<AvatarImage src={user.photoURL ?? undefined} alt="" />
						<AvatarFallback class="text-[10px]">
							{user.displayName?.slice(0, 1).toUpperCase() ??
								user.email?.slice(0, 1).toUpperCase() ??
								'?'}
						</AvatarFallback>
					</Avatar>
					<span>Profile</span>
				</a>
			</div>
		</nav>
	{/if}
</div>
