<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { DataSources } from '$lib/components/data-sources';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Info from '@lucide/svelte/icons/info';
	import Zap from '@lucide/svelte/icons/zap';
</script>

<svelte:head><title>About</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">About</h1>
		<p class="text-muted-foreground">
			Fantasy Steam League is a year-long fantasy game where you draft upcoming Steam releases and
			compete with friends based on real-world performance.
		</p>
	</div>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Info class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">What is Fantasy Steam League?</h2>
		</div>
		<div class="space-y-4 p-5">
			<p class="text-sm text-muted-foreground">
				Create or join a private league, enter live snake drafts across three seasonal phases, and
				pick your Hits, Bombs, and Seasonal games. Scores update twice daily based on each game's
				real Steam performance: reviews, concurrent players, and growth.
			</p>
			<p class="text-sm text-muted-foreground">
				The player with the highest total score at the end of the season wins.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Zap class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">How It Works</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Each season runs for one calendar year. Draft in December (Winter), April (Summer), and
				August (Fall). Your picks earn points from launch hype, sales estimates, peak CCU, and
				review scores. Milestone bonuses reward breakout hits; bomb picks penalise underperformers.
			</p>
		</div>
	</section>

	<DataSources />
</div>
