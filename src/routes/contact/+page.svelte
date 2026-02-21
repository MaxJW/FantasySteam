<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Mail from '@lucide/svelte/icons/mail';
</script>

<svelte:head><title>Contact</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">Contact</h1>
		<p class="text-muted-foreground">Questions, feedback, or support? Get in touch.</p>
	</div>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<Mail class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Get in Touch</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				You can reach us by email at
				<a href="mailto:max@maxwilson.co.uk" class="font-medium text-primary hover:underline">
					max@maxwilson.co.uk
				</a>
				.
			</p>
		</div>
	</section>
</div>
