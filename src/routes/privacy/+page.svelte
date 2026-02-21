<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { DataSources } from '$lib/components/data-sources';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Shield from '@lucide/svelte/icons/shield';
</script>

<svelte:head><title>Privacy Policy</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">Privacy Policy</h1>
		<p class="text-sm text-muted-foreground">Last updated: February 2025. UK GDPR compliant.</p>
	</div>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Shield class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Data Controller</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				The data controller for Fantasy Steam League is Max Wilson. Contact:
				<a href="mailto:max@maxwilson.co.uk" class="text-primary hover:underline"
					>max@maxwilson.co.uk</a
				>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Lawful Basis for Processing</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We process your data on the basis of: (a) contract — to provide the service you sign up for;
				(b) legitimate interests — to operate and improve the service; and (c) consent — where you
				explicitly opt in (e.g. marketing, if applicable).
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">What Data We Collect</h2>
		</div>
		<div class="space-y-3 p-5">
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">Authentication (Google):</strong> When you sign in with Google,
				we receive your email address, display name, and profile photo. This is used to identify you and
				display your profile in leagues.
			</p>
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">Firestore:</strong> We store your league memberships, team names,
				draft picks, and scores. This data is necessary to run the fantasy league.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">How We Use Your Data</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We use your data to provide the Fantasy Steam League service: creating and joining leagues,
				running drafts, calculating scores, and displaying leaderboards. We do not sell your data.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Third Parties</h2>
		</div>
		<div class="space-y-3 p-5">
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">Firebase (Google):</strong> Hosts our authentication and
				database. Google processes data in accordance with their
				<a
					href="https://firebase.google.com/support/privacy"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary hover:underline"
				>
					privacy policy
				</a>.
			</p>
			<p class="text-sm text-muted-foreground">
				<strong class="text-foreground">IGDB / Steam:</strong> We fetch game metadata and scores from
				these services. We do not send your personal data to them.
			</p>
		</div>
	</section>

	<DataSources />

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Data Retention</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We retain your data for as long as your account and leagues are active. If you request
				erasure, we will delete your personal data within 30 days, except where we must retain it
				for legal obligations.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Your UK GDPR Rights</h2>
		</div>
		<div class="space-y-2 p-5">
			<p class="text-sm text-muted-foreground">Under UK GDPR you have the right to:</p>
			<ul class="list-inside list-disc space-y-1 text-sm text-muted-foreground">
				<li><strong class="text-foreground">Access</strong> — request a copy of your data</li>
				<li><strong class="text-foreground">Rectification</strong> — correct inaccurate data</li>
				<li><strong class="text-foreground">Erasure</strong> — request deletion of your data</li>
				<li>
					<strong class="text-foreground">Restriction</strong> — limit how we process your data
				</li>
				<li>
					<strong class="text-foreground">Portability</strong> — receive your data in a portable format
				</li>
				<li>
					<strong class="text-foreground">Object</strong> — object to processing based on legitimate interests
				</li>
				<li>
					<strong class="text-foreground">Withdraw consent</strong> — where processing is based on consent
				</li>
				<li>
					<strong class="text-foreground">Complain to the ICO</strong> — the UK supervisory
					authority:
					<a
						href="https://ico.org.uk"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline">ico.org.uk</a
					>
				</li>
			</ul>
			<p class="mt-3 text-sm text-muted-foreground">
				To exercise any of these rights, contact
				<a href="mailto:max@maxwilson.co.uk" class="text-primary hover:underline"
					>max@maxwilson.co.uk</a
				>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">International Transfers</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Firebase may process data in the US or other countries. Google provides appropriate
				safeguards (e.g. Standard Contractual Clauses) for international transfers. See
				<a
					href="https://firebase.google.com/support/privacy"
					target="_blank"
					rel="noopener noreferrer"
					class="text-primary hover:underline"
				>
					Firebase's privacy documentation
				</a>.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Cookies</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				We use cookies for authentication and session management. See our
				<a href="/cookies" class="text-primary hover:underline">Cookie Policy</a> for details.
			</p>
		</div>
	</section>

	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<h2 class="font-semibold">Contact</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				For privacy enquiries:
				<a href="mailto:max@maxwilson.co.uk" class="text-primary hover:underline"
					>max@maxwilson.co.uk</a
				>.
			</p>
		</div>
	</section>
</div>
