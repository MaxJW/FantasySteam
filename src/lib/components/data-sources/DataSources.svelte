<script lang="ts">
	import Database from '@lucide/svelte/icons/database';
</script>

<section class="glass overflow-hidden rounded-xl">
	<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
		<Database class="size-4  text-primary" />
		<h2 class="font-semibold">Data Sources</h2>
	</div>
	<div class="space-y-4 p-5">
		<p class="text-sm text-muted-foreground">
			Fantasy Steam League is not affiliated with Steam or Valve. It uses data from the following
			third-party services. Game covers and metadata are attributed to their respective providers.
		</p>
		<div class="space-y-3">
			<div class="rounded-lg border border-white/6 bg-white/2 p-4">
				<h3 class="font-semibold">
					<a
						href="https://www.igdb.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						IGDB
					</a>
					<span class="ml-1 text-xs font-normal text-muted-foreground">(Twitch)</span>
				</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Game metadata, cover images, genres, and company information are sourced from
					<a
						href="https://www.igdb.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						IGDB
					</a>
					. Cover images are served from
					<code class="rounded bg-white/4 px-1 py-0.5 text-xs">images.igdb.com</code>
					.
				</p>
			</div>
			<div class="rounded-lg border border-white/6 bg-white/2 p-4">
				<h3 class="font-semibold">
					<a
						href="https://store.steampowered.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						Steam
					</a>
				</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Review counts and concurrent player (CCU) data come from Steam. Game pages link to the
					<a
						href="https://store.steampowered.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						Steam store
					</a>
					for each title.
				</p>
			</div>
			<div class="rounded-lg border border-white/6 bg-white/2 p-4">
				<h3 class="font-semibold">
					<a
						href="https://firebase.google.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						Firebase
					</a>
					<span class="ml-1 text-xs font-normal text-muted-foreground">(Google)</span>
				</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Authentication (Sign in with Google) and database storage (leagues, teams, picks, scores)
					are provided by
					<a
						href="https://firebase.google.com"
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary hover:underline"
					>
						Firebase
					</a>
					.
				</p>
			</div>
		</div>
	</div>
</section>
