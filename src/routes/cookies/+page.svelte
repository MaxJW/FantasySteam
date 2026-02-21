<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Cookie from '@lucide/svelte/icons/cookie';
</script>

<svelte:head><title>Cookie Policy</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">Cookie Policy</h1>
		<p class="text-sm text-muted-foreground">Last updated: February 2025. UK PECR compliant.</p>
	</div>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<Cookie class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">What Are Cookies?</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Cookies are small text files stored on your device when you visit a website. They help the
				site remember your preferences and keep you signed in.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">Cookies We Use</h2>
		</div>
		<div class="space-y-3 p-5">
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">Firebase Authentication:</strong> We use cookies set by Firebase
				(Google) to keep you signed in. These are strictly necessary for the service to function.
			</p>
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">Lawful basis:</strong> These cookies are necessary for the performance
				of the contract (providing the service you requested) and for our legitimate interest in securing
				your session. Under UK PECR, strictly necessary cookies do not require prior consent.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">Third-Party Cookies</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Firebase (Google) may set cookies when you sign in. These are used for authentication and
				session management. Google's use of cookies is governed by their
				<a
					href="https://policies.google.com/privacy"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary hover:underline"
				>
					privacy policy
				</a>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">How to Manage Cookies</h2>
		</div>
		<div class="space-y-3 p-5">
			<p class="text-sm text-muted-foreground">
				You can control cookies through your browser settings. Most browsers allow you to block or
				delete cookies. Note: blocking our authentication cookies will prevent you from signing in
				and using the service.
			</p>
			<p class="text-sm text-muted-foreground">
				For more guidance on cookies and your rights, see the
				<a
					href="https://ico.org.uk/for-the-public/online/cookies/"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary hover:underline"
				>
					ICO's guidance on cookies
				</a>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
			<h2 class="font-semibold">Contact</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				For questions about our use of cookies:
				<a href="mailto:max@maxwilson.co.uk" class="text-primary hover:underline"
					>max@maxwilson.co.uk</a
				>.
			</p>
		</div>
	</section>
</div>
