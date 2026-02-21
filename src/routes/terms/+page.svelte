<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import FileText from '@lucide/svelte/icons/file-text';
</script>

<svelte:head><title>Terms of Service</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">Terms of Service</h1>
		<p class="text-sm text-muted-foreground">Last updated: February 2025</p>
	</div>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<FileText class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">1. Acceptance</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				By using Fantasy Steam League, you agree to these Terms of Service. If you do not agree, do
				not use the service.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">2. Use of Service</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Fantasy Steam League is provided for personal, non-commercial use. You may create leagues,
				invite friends, and participate in drafts and scoring. You must not use the service for any
				unlawful purpose or in a way that could harm the service or other users.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">3. User Accounts</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				You sign in with Google. You are responsible for maintaining the security of your Google
				account and for all activity under it. We do not store your Google password.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">4. Acceptable Use</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				You must not abuse the service, attempt to gain unauthorised access, interfere with its
				operation, or use it to harass others. We may suspend or terminate your access if you
				violate these terms.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">5. Intellectual Property</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Fantasy Steam League and its original content are owned by us. Game data, covers, and logos
				are the property of their respective rights holders (see our
				<a href="/about" class="text-primary hover:underline">About</a>
				page for data sources). We do not claim ownership of third-party content displayed on the site.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">6. Disclaimer</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				The service is provided "as is" without warranties of any kind. We do not guarantee accuracy
				of game data, scores, or availability. Use at your own risk.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">7. Limitation of Liability</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				To the fullest extent permitted by law, we shall not be liable for any indirect, incidental,
				special, or consequential damages arising from your use of the service.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">8. Termination</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We may terminate or suspend your access at any time. You may stop using the service at any
				time. Your data may be retained as described in our
				<a href="/privacy" class="text-primary hover:underline">Privacy Policy</a>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">9. Governing Law</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				These terms are governed by the laws of England and Wales. Any disputes shall be subject to
				the exclusive jurisdiction of the courts of England and Wales.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">10. Changes</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We may update these terms from time to time. Continued use of the service after changes
				constitutes acceptance. We will indicate the date of the last update at the top of this
				page.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">11. Contact</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				For questions about these terms, contact us at
				<a href="mailto:max@maxwilson.co.uk" class="text-primary hover:underline"
					>max@maxwilson.co.uk</a
				>.
			</p>
		</div>
	</section>
</div>
