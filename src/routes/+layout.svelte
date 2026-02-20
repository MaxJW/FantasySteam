<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser } from '$lib/auth';
	import { refreshScores } from '$lib/db';
	import { pwaInfo } from 'virtual:pwa-info';
	import { pwaAssetsHead } from 'virtual:pwa-assets/head';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Zap from '@lucide/svelte/icons/zap';
	import { goto } from '$app/navigation';

	let { children } = $props();

	onMount(() => {
		const handleVisibility = () => {
			if (document.visibilityState === 'visible') {
				refreshScores();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		return () => document.removeEventListener('visibilitychange', handleVisibility);
	});
	let user = $state(get(currentUser));
	let path = $state(get(page).url.pathname);
	currentUser.subscribe((u) => (user = u));

	$effect(() => {
		const unsub = page.subscribe((p) => (path = p.url.pathname));
		return unsub;
	});

	$effect(() => {
		let timeoutId: ReturnType<typeof setTimeout>;
		const unsub = currentUser.subscribe((u) => {
			const publicPaths = ['/', '/how-to-play'];
			if (!publicPaths.includes(path) && u === null) goto('/');
			if (u !== undefined) clearTimeout(timeoutId);
		});
		// If auth never resolves on protected routes (e.g. iOS), redirect to home after 5s
		const publicPaths = ['/', '/how-to-play'];
		if (!publicPaths.includes(path) && get(currentUser) === undefined) {
			timeoutId = setTimeout(() => {
				if (get(currentUser) === undefined) goto('/');
			}, 5000);
		}
		return () => {
			unsub();
			clearTimeout(timeoutId);
		};
	});

	function isActive(href: string) {
		return path === href || (href !== '/' && path.startsWith(href));
	}
</script>

<svelte:head>
	<meta name="theme-color" content={pwaAssetsHead?.themeColor?.content ?? '#171d2b'} />
	{#each pwaAssetsHead?.links ?? [] as link}
		<link rel={link.rel} href={link.href} sizes={link.sizes} type={link.type} />
	{/each}
	{#if pwaInfo?.webManifest?.linkTag}
		{@html pwaInfo.webManifest.linkTag}
	{/if}
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-40 w-full">
		<div class="glass-heavy border-b border-white/[0.06]">
			<div class="container mx-auto flex h-14 items-center justify-between px-4 md:h-16">
				<div class="flex items-center gap-5">
					<a
						href="/"
						class="group flex items-center gap-2 text-lg font-bold tracking-tight transition-opacity hover:opacity-90"
					>
						<div
							class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 transition-colors group-hover:bg-primary/25"
						>
							<Zap class="h-4 w-4 text-primary" />
						</div>
						<span class="inline">
							<span class="text-foreground">Fantasy</span><span class="text-gradient-primary"
								>Steam</span
							>
						</span>
					</a>
					<a
						href="/how-to-play"
						class="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
						aria-label="How to play"
					>
						<CircleQuestionMark class="size-4" />
					</a>
					{#if user}
						<nav class="hidden gap-1 md:flex">
							<a
								href="/dashboard"
								class="relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all {isActive(
									'/dashboard'
								)
									? 'bg-white/[0.08] text-foreground'
									: 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}"
							>
								Dashboard
							</a>
							<a
								href="/games"
								class="relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all {isActive(
									'/games'
								)
									? 'bg-white/[0.08] text-foreground'
									: 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}"
							>
								Browse Games
							</a>
						</nav>
					{/if}
				</div>

				<div class="flex items-center gap-3">
					{#if user}
						<a
							href="/profile"
							class="hidden shrink-0 rounded-full ring-2 ring-transparent transition-all hover:ring-primary/40 md:flex"
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
		</div>
		<div class="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>
	</header>

	<main class="container mx-auto flex-1 px-4 py-6 pb-24 md:py-8 md:pb-8">
		{@render children()}
	</main>

	{#await import('$lib/ReloadPrompt.svelte') then { default: ReloadPrompt }}
		<ReloadPrompt />
	{/await}

	{#if user}
		<nav class="fixed right-0 bottom-0 left-0 z-40 md:hidden" aria-label="Main navigation">
			<div class="h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent"></div>
			<div class="glass-heavy border-t border-white/[0.04] pb-[env(safe-area-inset-bottom)]">
				<div class="flex w-full items-center justify-around px-2 py-1.5">
					<a
						href="/dashboard"
						class="flex flex-col items-center gap-0.5 rounded-xl px-5 py-2 transition-all {isActive(
							'/dashboard'
						)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground active:bg-white/[0.04]'}"
						aria-current={isActive('/dashboard') ? 'page' : undefined}
					>
						<LayoutDashboard class="size-5 shrink-0" aria-hidden="true" />
						<span class="text-[10px] font-medium">Leagues</span>
					</a>
					<a
						href="/games"
						class="flex flex-col items-center gap-0.5 rounded-xl px-5 py-2 transition-all {isActive(
							'/games'
						)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground active:bg-white/[0.04]'}"
						aria-current={isActive('/games') ? 'page' : undefined}
					>
						<Gamepad2 class="size-5 shrink-0" aria-hidden="true" />
						<span class="text-[10px] font-medium">Games</span>
					</a>
					<a
						href="/profile"
						class="flex flex-col items-center gap-0.5 rounded-xl px-5 py-2 transition-all {isActive(
							'/profile'
						)
							? 'bg-primary/10 text-primary'
							: 'text-muted-foreground active:bg-white/[0.04]'}"
						aria-current={isActive('/profile') ? 'page' : undefined}
					>
						<Avatar class="size-5 shrink-0">
							<AvatarImage src={user.photoURL ?? undefined} alt="" />
							<AvatarFallback class="text-[8px]">
								{user.displayName?.slice(0, 1).toUpperCase() ??
									user.email?.slice(0, 1).toUpperCase() ??
									'?'}
							</AvatarFallback>
						</Avatar>
						<span class="text-[10px] font-medium">Profile</span>
					</a>
				</div>
			</div>
		</nav>
	{/if}
</div>
