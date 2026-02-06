<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, signInWithGoogle } from '$lib/auth';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { LoaderCircle } from '@lucide/svelte';

	let loading = $state(true);

	function handleSignIn() {
		loading = true;
		signInWithGoogle()
			.then(() => goto('/dashboard'))
			.catch(() => (loading = false))
			.finally(() => (loading = false));
	}

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) loading = false;
			if (u) goto('/dashboard');
		});
		return unsub;
	});
</script>

<svelte:head><title>Fantasy Steam League</title></svelte:head>

{#if loading}
	<div
		class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground"
		aria-live="polite"
		aria-busy="true"
	>
		<LoaderCircle class="size-10 animate-spin" aria-hidden="true" />
		<p class="text-sm font-medium">Loading...</p>
	</div>
{:else}
	<div
		class="flex flex-col items-center justify-center space-y-12 py-12 text-center md:py-24 lg:py-32"
	>
		<div class="max-w-3xl space-y-6">
			<h1
				class="bg-linear-to-r from-white to-gray-400 bg-clip-text text-4xl font-extrabold tracking-tighter text-transparent sm:text-5xl md:text-6xl lg:text-7xl"
			>
				Fantasy Steam League
			</h1>
			<p class="mx-auto max-w-[700px] text-lg text-muted-foreground md:text-xl">
				Draft upcoming releases. Score points on <span class="font-semibold text-primary"
					>Growth</span
				>
				& <span class="font-semibold text-accent">Peak Players</span>. Compete with friends in
				real-time.
			</p>
			<div class="flex justify-center gap-4">
				<Button
					size="lg"
					onclick={handleSignIn}
					disabled={loading}
					class="px-8 text-base shadow-lg shadow-primary/25"
				>
					{loading ? 'Signing in...' : 'Sign in with Google'}
				</Button>
			</div>
		</div>

		<Card.Root class="w-full max-w-4xl border-muted bg-card/50 text-left backdrop-blur-sm">
			<Card.Header>
				<Card.Title class="text-primary">How to play</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					<div class="space-y-2">
						<h3 class="font-bold text-foreground">1. Join a League</h3>
						<p class="text-sm text-muted-foreground">
							Create your own private league or join one using an invite code.
						</p>
					</div>
					<div class="space-y-2">
						<h3 class="font-bold text-foreground">2. The Draft</h3>
						<p class="text-sm text-muted-foreground">
							Enter the live snake draft. Pick your Hits, Bombs, and Seasonal games in order.
						</p>
					</div>
					<div class="space-y-2">
						<h3 class="font-bold text-foreground">3. Score Points</h3>
						<p class="text-sm text-muted-foreground">
							Earn points daily based on real Steam data: owner growth and concurrent user counts.
						</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
{/if}
