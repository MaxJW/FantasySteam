<script lang="ts">
	import { get } from 'svelte/store';
	import { currentUser, signOut } from '$lib/auth';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';

	let user = $state(get(currentUser) ?? null);
	$effect(() => {
		const unsub = currentUser.subscribe((u) => (user = u ?? null));
		return unsub;
	});
</script>

<svelte:head><title>Profile | FantasySteam</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	<h1 class="text-2xl font-bold tracking-tight">Profile</h1>

	{#if user}
		<div
			class="flex flex-col items-center gap-4 rounded-lg border bg-card p-8 text-card-foreground"
		>
			<Avatar class="size-24">
				<AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? 'Profile'} />
				<AvatarFallback class="text-2xl">
					{user.displayName?.slice(0, 2).toUpperCase() ??
						user.email?.slice(0, 2).toUpperCase() ??
						'?'}
				</AvatarFallback>
			</Avatar>
			<div class="space-y-4 text-center">
				<p class="font-medium">{user.displayName || 'User'}</p>
				<p class="text-sm text-muted-foreground">{user.email}</p>
				<Button variant="outline" onclick={() => signOut()}>Sign out</Button>
			</div>
		</div>
	{:else}
		<p class="text-muted-foreground">Sign in to view your profile.</p>
	{/if}
</div>
