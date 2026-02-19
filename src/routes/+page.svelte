<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, signInWithGoogle } from '$lib/auth';
	import { Button } from '$lib/components/ui/button';
	import { LoaderCircle, Target, Bomb, Snowflake, TrendingUp, Users, Trophy } from '@lucide/svelte';

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
		<LoaderCircle class="size-10 animate-spin text-primary" aria-hidden="true" />
		<p class="text-sm font-medium">Loading...</p>
	</div>
{:else}
	<div class="relative flex flex-col items-center justify-center py-12 md:py-20 lg:py-28">
		<!-- Ambient glow -->
		<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			<div
				class="absolute top-1/4 left-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-[120px]"
			></div>
			<div
				class="absolute right-1/4 bottom-1/4 h-[300px] w-[400px] rounded-full bg-accent/[0.05] blur-[100px]"
			></div>
		</div>

		<div class="relative z-10 flex max-w-3xl flex-col items-center space-y-8 text-center">
			<div class="animate-fade-in-up space-y-4">
				<h1
					class="text-gradient-hero text-5xl font-extrabold tracking-tighter sm:text-6xl md:text-7xl lg:text-8xl"
				>
					Fantasy Steam League
				</h1>
				<p class="mx-auto max-w-[600px] text-base text-muted-foreground sm:text-lg md:text-xl">
					Draft upcoming releases. Score points on
					<span class="font-semibold text-primary">Growth</span>
					&
					<span class="font-semibold text-accent">Peak Players</span>. Compete with friends all year
					long.
				</p>
			</div>

			<div class="animate-fade-in-up" style="animation-delay: 0.15s">
				<Button
					size="lg"
					onclick={handleSignIn}
					disabled={loading}
					class="glow-primary px-10 py-6 text-base font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
				>
					{loading ? 'Signing in...' : 'Sign in with Google'}
				</Button>
			</div>
		</div>

		<!-- Feature cards -->
		<div
			class="relative z-10 mx-auto mt-16 grid w-full max-w-4xl gap-4 px-4 sm:grid-cols-3 md:mt-20"
		>
			<div
				class="glass animate-fade-in-up rounded-xl p-5 transition-colors hover:border-primary/20"
				style="animation-delay: 0.25s"
			>
				<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
					<Users class="h-5 w-5 text-primary" />
				</div>
				<h3 class="mb-1 font-semibold text-foreground">Create a League</h3>
				<p class="text-sm text-muted-foreground">
					Start a private league and invite friends with a simple code.
				</p>
			</div>

			<div
				class="glass animate-fade-in-up rounded-xl p-5 transition-colors hover:border-primary/20"
				style="animation-delay: 0.35s"
			>
				<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
					<Snowflake class="h-5 w-5 text-accent" />
				</div>
				<h3 class="mb-1 font-semibold text-foreground">Draft Games</h3>
				<p class="text-sm text-muted-foreground">
					Enter the live snake draft. Pick your Hits, Bombs, and Seasonal games.
				</p>
			</div>

			<div
				class="glass animate-fade-in-up rounded-xl p-5 transition-colors hover:border-primary/20"
				style="animation-delay: 0.45s"
			>
				<div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
					<Trophy class="h-5 w-5 text-yellow-500" />
				</div>
				<h3 class="mb-1 font-semibold text-foreground">Win the Season</h3>
				<p class="text-sm text-muted-foreground">
					Earn points daily based on real Steam data and climb the leaderboard.
				</p>
			</div>
		</div>

		<!-- Pick type pills -->
		<div
			class="relative z-10 mt-12 flex animate-fade-in-up flex-wrap items-center justify-center gap-3"
			style="animation-delay: 0.55s"
		>
			<div
				class="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
			>
				<Target class="h-3.5 w-3.5 text-accent" /> Hit Picks
			</div>
			<div
				class="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
			>
				<Bomb class="h-3.5 w-3.5 text-destructive" /> Bomb Picks
			</div>
			<div
				class="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
			>
				<Snowflake class="h-3.5 w-3.5 text-sky-400" /> Seasonal Picks
			</div>
			<div
				class="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground"
			>
				<TrendingUp class="h-3.5 w-3.5 text-primary" /> Live Scoring
			</div>
		</div>
	</div>
{/if}
