<script lang="ts">
	import { goto } from '$app/navigation';
	import { currentUser, signInWithGoogle } from '$lib/auth';

	let loading = $state(false);

	function handleSignIn() {
		loading = true;
		signInWithGoogle()
			.then(() => goto('/dashboard'))
			.catch(() => (loading = false))
			.finally(() => (loading = false));
	}

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u) goto('/dashboard');
		});
		return unsub;
	});
</script>

<svelte:head><title>Fantasy Steam League</title></svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center p-6 bg-[#1b2838]">
	<div class="max-w-xl w-full text-center">
		<h1 class="text-4xl font-bold mb-4 text-[#c7d5e0]">Fantasy Steam League</h1>
		<p class="text-lg text-[#8f98a0] mb-8">
			Draft upcoming Steam games. Score points from owner growth and peak CCU. Compete with friends in real-time snake drafts.
		</p>

		<section class="text-left mb-10 rounded-lg border border-[#3d5a80] p-6 bg-[#2a475e] shadow-xl">
			<h2 class="text-xl font-semibold mb-3 text-[#66c0f4]">How it works</h2>
			<ol class="list-decimal list-inside space-y-2 text-[#c7d5e0]">
				<li>Create or join a league with an invite code.</li>
				<li>Everyone joins the draft room; when all are present, the commissioner starts the draft.</li>
				<li>Snake draft: pick games (Hit, Seasonal, Alt, Bust) in order. Timer per pick; draft pauses if you disconnect until you rejoin.</li>
				<li>Daily scoring: your picks earn points from Steam owner growth and peak concurrent players, weighted by recency.</li>
				<li class="text-[#a4d007]">Check standings and rosters on your league page.</li>
			</ol>
		</section>

		<button
			type="button"
			onclick={handleSignIn}
			disabled={loading}
			class="rounded-lg bg-[#66c0f4] px-8 py-3 text-[#1b2838] font-medium hover:bg-[#8bb8e8] disabled:opacity-50 transition shadow-lg"
		>
			{loading ? 'Signing in…' : 'Sign in with Google'}
		</button>
	</div>
</div>
