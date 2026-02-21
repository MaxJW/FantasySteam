<script lang="ts">
	import { get } from 'svelte/store';
	import { currentUser, signOut } from '$lib/auth';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Mail from '@lucide/svelte/icons/mail';
	import User from '@lucide/svelte/icons/user';

	let user = $state(get(currentUser) ?? null);
	$effect(() => {
		const unsub = currentUser.subscribe((u) => (user = u ?? null));
		return unsub;
	});
</script>

<svelte:head><title>Profile | FantasySteam</title></svelte:head>

<div class="mx-auto max-w-md space-y-6">
	<h1 class="text-2xl font-bold tracking-tight">Profile</h1>

	{#if user}
		<div class="glass overflow-hidden rounded-xl">
			<!-- Banner gradient -->
			<div class="h-20 bg-linear-to-br from-primary/20 via-primary/10 to-accent/10"></div>

			<div class="-mt-10 flex flex-col items-center pb-6">
				<div
					class="rounded-full p-1 ring-2 ring-primary/30"
					style="background: oklch(0.15 0.03 250)"
				>
					<Avatar class="size-20">
						<AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? 'Profile'} />
						<AvatarFallback class="text-xl">
							{user.displayName?.slice(0, 2).toUpperCase() ??
								user.email?.slice(0, 2).toUpperCase() ??
								'?'}
						</AvatarFallback>
					</Avatar>
				</div>

				<h2 class="mt-3 text-lg font-semibold">{user.displayName || 'User'}</h2>

				<div class="mt-4 w-full space-y-2 px-6">
					{#if user.email}
						<div
							class="flex items-center gap-3 rounded-lg border border-white/6 bg-white/2 px-4 py-3"
						>
							<Mail class="h-4 w-4 text-muted-foreground" />
							<div class="min-w-0 flex-1">
								<p class="text-[10px] font-medium text-muted-foreground uppercase">Email</p>
								<p class="truncate text-sm">{user.email}</p>
							</div>
						</div>
					{/if}
					<div
						class="flex items-center gap-3 rounded-lg border border-white/6 bg-white/2 px-4 py-3"
					>
						<User class="h-4 w-4 text-muted-foreground" />
						<div class="min-w-0 flex-1">
							<p class="text-[10px] font-medium text-muted-foreground uppercase">Auth Provider</p>
							<p class="text-sm">Google</p>
						</div>
					</div>
				</div>

				<div class="mt-6 w-full px-6">
					<Button variant="outline" class="w-full gap-2 border-white/8" onclick={() => signOut()}>
						<LogOut class="h-4 w-4" /> Sign out
					</Button>
				</div>
			</div>
		</div>

		<!-- Legal links (mobile only — footer is hidden by bottom bar) -->
		<nav class="md:hidden" aria-label="Legal and info">
			<div class="glass overflow-hidden rounded-xl">
				<div class="border-b border-white/6 px-5 py-3">
					<h2 class="font-semibold">Legal & Info</h2>
				</div>
				<ul class="divide-y divide-white/6 p-2">
					<li>
						<a
							href="/about"
							class="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
							>About</a
						>
					</li>
					<li>
						<a
							href="/contact"
							class="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
							>Contact</a
						>
					</li>
					<li>
						<a
							href="/terms"
							class="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
							>Terms of Service</a
						>
					</li>
					<li>
						<a
							href="/privacy"
							class="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
							>Privacy Policy</a
						>
					</li>
					<li>
						<a
							href="/cookies"
							class="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/4 hover:text-foreground"
							>Cookie Policy</a
						>
					</li>
				</ul>
			</div>
		</nav>
	{:else}
		<div class="glass rounded-xl py-10 text-center text-sm text-muted-foreground">
			Sign in to view your profile.
		</div>
	{/if}
</div>
