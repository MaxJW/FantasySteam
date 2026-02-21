<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import Target from '@lucide/svelte/icons/target';
	import Bomb from '@lucide/svelte/icons/bomb';
	import Snowflake from '@lucide/svelte/icons/snowflake';
	import Shuffle from '@lucide/svelte/icons/shuffle';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import Zap from '@lucide/svelte/icons/zap';
	import Star from '@lucide/svelte/icons/star';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Sun from '@lucide/svelte/icons/sun';
	import Leaf from '@lucide/svelte/icons/leaf';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import { DRAFT_PHASES, getPhaseForDate, PHASE_CONFIG } from '$lib/db/types';

	const now = new Date();
	const currentPhase = getPhaseForDate(now);

	const phaseIcons = {
		winter: Snowflake,
		summer: Sun,
		fall: Leaf
	} as const;

	const draftWindowOpen: Record<string, string> = {
		winter: 'December',
		summer: 'April',
		fall: 'August'
	};

	const phaseWindows: Record<string, string> = {
		winter: 'January – April',
		summer: 'May – August',
		fall: 'September – December'
	};

	const phases = DRAFT_PHASES.map((phase) => ({
		phase,
		label: PHASE_CONFIG[phase].label,
		draftOpens: draftWindowOpen[phase],
		window: phaseWindows[phase],
		isCurrent: phase === currentPhase,
		Icon: phaseIcons[phase]
	}));

	const nextDraftsText =
		currentPhase === 'winter'
			? 'Summer and Fall drafts'
			: currentPhase === 'summer'
				? 'Fall draft'
				: "next year's Winter draft";
</script>

<svelte:head><title>How to Play</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-8 pb-16">
	<Button onclick={() => history.back()} class="glow-sm-primary gap-2">
		<ArrowLeft class="size-4" /> Back
	</Button>

	<div class="space-y-2">
		<h1 class="text-3xl font-bold tracking-tight md:text-4xl">How to Play</h1>
		<p class="text-muted-foreground">
			Fantasy Steam League is a year-long game where you draft upcoming Steam releases and score
			points based on their real-world performance.
		</p>
	</div>

	<!-- Season -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Calendar class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">The Season</h2>
		</div>
		<div class="space-y-4 p-5">
			<p class="text-sm text-muted-foreground">
				A season runs for one calendar year with <strong class="text-foreground"
					>three draft phases</strong
				>, each covering a portion of the year's releases.
			</p>
			<div class="grid gap-3 sm:grid-cols-3">
				{#each phases as { label, draftOpens, window, isCurrent, Icon }}
					<div
						class="rounded-lg border p-4 transition-colors {isCurrent
							? 'border-primary/40 bg-primary/6'
							: 'border-white/6 bg-white/2'}"
					>
						<div class="flex items-center gap-2">
							<div
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md {isCurrent
									? 'bg-primary/20'
									: 'bg-white/4'}"
							>
								<Icon class="h-4 w-4 {isCurrent ? 'text-primary' : 'text-muted-foreground'}" />
							</div>
							<Badge variant="outline" class="text-[10px]">
								{label}
								{#if isCurrent}
									<span class="ml-1 text-primary">(Current)</span>
								{/if}
							</Badge>
						</div>
						<p class="mt-2 text-xs text-muted-foreground">
							Draft opens in <strong class="text-foreground">{draftOpens}</strong>. Pick games
							releasing <strong class="text-foreground">{window}</strong>.
						</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Pick Types -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Users class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Pick Types</h2>
		</div>
		<div class="space-y-4 p-5">
			<p class="text-sm text-muted-foreground">
				Each draft uses a <strong class="text-foreground">snake draft</strong> format.
			</p>
			<div class="space-y-3">
				{#each [{ icon: Snowflake, color: 'text-sky-400', bg: 'bg-sky-400/10', border: 'border-sky-400/20', label: 'Seasonal Picks', desc: "Your core picks. Choose games releasing within the current phase's window. These earn points based on real-world Steam performance.", badge: 'All 3 drafts' }, { icon: Target, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20', label: 'Hit Pick', desc: 'Your GOTY prediction. Pick any unreleased game from the entire year that you think will be the best performer.', badge: 'First draft only' }, { icon: Bomb, color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', label: 'Bomb Pick', desc: 'Pick a game you think will flop. If it underperforms relative to other games, the damage is distributed equally among all other players, reducing their scores.', badge: 'First draft only' }, { icon: Shuffle, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20', label: 'Alt Pick', desc: 'A backup pick that activates if one of your seasonal picks gets delisted from Steam (e.g., pulled to become an Epic exclusive).', badge: 'All 3 drafts' }] as pick}
					{@const Icon = pick.icon}
					<div class="flex gap-4 rounded-lg border {pick.border} bg-white/1 p-4">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {pick.bg}">
							<Icon class="h-5 w-5 {pick.color}" />
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="font-semibold">{pick.label}</h3>
							<p class="mt-1 text-sm text-muted-foreground">{pick.desc}</p>
							<Badge variant="secondary" class="mt-2 text-[10px]">{pick.badge}</Badge>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Scoring -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Trophy class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Scoring</h2>
		</div>
		<div class="space-y-5 p-5">
			<p class="text-sm text-muted-foreground">
				Scores update <strong class="text-foreground">twice daily</strong> based on each game's real-world
				Steam performance. The system captures peak concurrent players during Steam's busiest hours for
				the most accurate data.
			</p>

			<div class="overflow-hidden rounded-lg border border-white/6">
				<div class="border-b border-white/6 bg-white/2 px-4 py-2.5">
					<h4 class="text-sm font-semibold">Daily Points Formula</h4>
				</div>
				<div class="space-y-2 p-4">
					<p class="mb-3 text-xs text-muted-foreground">
						Points use square-root scaling so breakout hits feel meaningfully different from average
						performers.
					</p>
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Sales Score</span>
						<code class="rounded bg-white/4 px-2 py-0.5 font-mono text-xs text-foreground"
							>sqrt(new copies) &times; 0.2</code
						>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Player Score</span>
						<code class="rounded bg-white/4 px-2 py-0.5 font-mono text-xs text-foreground"
							>sqrt(peak CCU) &times; 0.15</code
						>
					</div>
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">Review Score</span>
						<code class="rounded bg-white/4 px-2 py-0.5 font-mono text-xs text-foreground"
							>sqrt(reviews) &times; ratio &times; 0.8</code
						>
					</div>
				</div>
			</div>

			<div class="overflow-hidden rounded-lg border border-white/6">
				<div class="border-b border-white/6 bg-white/2 px-4 py-2.5">
					<h4 class="text-sm font-semibold">Time Multiplier</h4>
				</div>
				<div class="divide-y divide-white/4">
					{#each [{ period: 'Days 0-14 (Launch Hype)', mult: '2.0x' }, { period: 'Days 15-90 (The Season)', mult: '1.0x' }, { period: 'Days 91-180 (Long Tail)', mult: '0.75x' }, { period: 'Days 181+ (Legacy)', mult: '0.5x' }] as row}
						<div class="flex items-center justify-between px-4 py-2.5 text-sm">
							<span class="text-muted-foreground">{row.period}</span>
							<span class="font-mono font-bold text-foreground">{row.mult}</span>
						</div>
					{/each}
				</div>
			</div>

			<Separator class="opacity-20" />

			<!-- Milestones -->
			<div class="overflow-hidden rounded-lg border border-yellow-500/20 bg-yellow-500/3">
				<div
					class="flex items-center gap-2 border-b border-yellow-500/10 bg-yellow-500/4 px-4 py-2.5"
				>
					<Star class="h-4 w-4 text-yellow-400" />
					<h4 class="text-sm font-semibold">Milestone Bonuses</h4>
				</div>
				<div class="space-y-1.5 p-4">
					<p class="mb-3 text-xs text-muted-foreground">
						One-time bonus points awarded when a game crosses a major threshold.
					</p>
					{#each [{ label: 'First 1,000 reviews', pts: '+50' }, { label: 'First 10,000 peak CCU', pts: '+75' }, { label: 'Very Positive (>80% positive, 200+ reviews)', pts: '+30' }, { label: 'Overwhelmingly Positive (>95% positive, 500+ reviews)', pts: '+100' }] as ms}
						<div class="flex items-center justify-between text-sm">
							<span class="text-muted-foreground">{ms.label}</span>
							<span class="font-mono font-bold text-yellow-400">{ms.pts}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Breakout -->
			<div class="overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/3">
				<div
					class="flex items-center gap-2 border-b border-emerald-500/10 bg-emerald-500/4 px-4 py-2.5"
				>
					<TrendingUp class="h-4 w-4 text-emerald-400" />
					<h4 class="text-sm font-semibold">Breakout Bonus</h4>
				</div>
				<div class="p-4">
					<p class="text-sm text-muted-foreground">
						If a game's peak CCU suddenly exceeds <strong class="text-foreground">3x</strong>
						its 7-day average, it earns a one-time
						<span class="font-mono font-bold text-emerald-400">+50</span> breakout bonus. Rewards picking
						sleeper hits that pop off.
					</p>
				</div>
			</div>

			<!-- Bomb -->
			<div class="overflow-hidden rounded-lg border border-destructive/20 bg-destructive/4">
				<div
					class="flex items-center gap-2 border-b border-destructive/10 bg-destructive/4 px-4 py-2.5"
				>
					<Bomb class="h-4 w-4 text-destructive" />
					<h4 class="text-sm font-semibold">Bomb Damage</h4>
				</div>
				<div class="p-4">
					<p class="text-sm text-muted-foreground">
						Each day, the bomb threshold is set at the <strong class="text-foreground"
							>25th percentile</strong
						>
						of all active games' daily scores. If a bomb game scores below this threshold, the difference
						is split equally among all other players as a penalty. The threshold adapts naturally as more
						games release throughout the season.
					</p>
				</div>
			</div>

			<Separator class="opacity-20" />
		</div>
	</section>

	<!-- Winning -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Trophy class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Winning</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				The player with the highest total score at the end of the season wins. Your total equals the
				sum of all your games' daily points plus any milestone and breakout bonuses, minus bomb
				damage received.
			</p>
		</div>
	</section>

	<!-- Bookmarks -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Bookmark class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Bookmarks</h2>
		</div>
		<div class="p-5">
			<p class="text-sm text-muted-foreground">
				Use the <strong class="text-foreground">bookmark</strong> button on any game to save it to your
				list. Filter by "Bookmarked only" when browsing games or during the draft to quickly find your
				shortlist.
			</p>
		</div>
	</section>

	<!-- Quick Start -->
	<section class="glass overflow-hidden rounded-xl">
		<div class="flex items-center gap-2 border-b border-white/6 px-5 py-3">
			<Zap class="h-4 w-4 text-primary" />
			<h2 class="font-semibold">Quick Start</h2>
		</div>
		<div class="p-5">
			<ol class="space-y-3 text-sm text-muted-foreground">
				{#each [{ title: 'Create or join a league', desc: 'using an invite code from your friends.' }, { title: `Enter the ${PHASE_CONFIG[currentPhase].label} Draft Room`, desc: 'when all players are present. The commissioner starts the draft.' }, { title: 'Draft your picks', desc: 'in snake order — hit, bomb, seasonal games, and an alt backup.' }, { title: 'Watch your scores grow', desc: 'as your games release and perform on Steam throughout the year.' }, { title: `Return for ${nextDraftsText}`, desc: 'to expand your roster with new picks.' }] as step, i}
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
						>
							{i + 1}
						</span>
						<span>
							<strong class="text-foreground">{step.title}</strong>
							{step.desc}
						</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>
</div>
