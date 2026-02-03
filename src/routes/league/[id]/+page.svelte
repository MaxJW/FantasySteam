<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import { getLeague, getTeam, getTeams, getGame, updateLeagueSettings, updateLeagueSeason } from '$lib/db';
	import type { Team } from '$lib/db';

	let league = $state<Awaited<ReturnType<typeof getLeague>>>(null);
	let myTeam = $state<Awaited<ReturnType<typeof getTeam>>>(null);
	let teams = $state<(Team & { id: string })[]>([]);
	let gameNames = $state<Record<string, string>>({});
	let loading = $state(true);
	let leagueId = $state<string | undefined>(undefined);
	let settingsOpen = $state(false);
	let editSeasonalPicks = $state(4);
	let editPickTimer = $state(90);
	let editSeason = $state('');
	let savingSettings = $state(false);

	$effect(() => {
		const id = get(page).params?.id;
		leagueId = id;
		if (id) loading = true;
	});

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) goto('/');
		});
		return unsub;
	});

	$effect(() => {
		const id = leagueId;
		if (!id) return;
		getLeague(id).then((l) => {
			league = l;
			loading = false;
		});
	});

	$effect(() => {
		const user = getCurrentUser();
		const id = leagueId;
		if (!user || !id) return;
		getTeam(id, user.uid).then((t) => (myTeam = t));
	});

	$effect(() => {
		const id = leagueId;
		if (!id) return;
		getTeams(id).then((list) => (teams = list));
	});

	$effect(() => {
		const idList: string[] = [];
		const seen = new Set<string>();
		for (const t of teams) {
			const p = t.picks;
			for (const gid of [p?.hitPick, p?.bustPick, ...(p?.seasonalPicks ?? []), ...(p?.altPicks ?? [])].filter(Boolean) as string[]) {
				if (!seen.has(gid)) {
					seen.add(gid);
					idList.push(gid);
				}
			}
		}
		if (idList.length === 0) return;
		Promise.all(idList.map((gid) => getGame(gid))).then((games) => {
			const map: Record<string, string> = {};
			games.forEach((g, i) => {
				if (g) map[idList[i]] = g.name;
			});
			gameNames = { ...gameNames, ...map };
		});
	});

	function gameName(gameId: string) {
		return gameNames[gameId] ?? gameId;
	}

	const isCommissioner = $derived(!!(league && getCurrentUser()?.uid === league.commissionerId));

	async function openSettings() {
		if (league) {
			editSeasonalPicks = league.settings?.seasonalPicks ?? 4;
			editPickTimer = league.settings?.pickTimer ?? 90;
			editSeason = league.season ?? '';
		}
		settingsOpen = true;
	}

	async function saveSettings() {
		if (!leagueId) return;
		savingSettings = true;
		try {
			await updateLeagueSettings(leagueId, {
				seasonalPicks: editSeasonalPicks,
				pickTimer: editPickTimer
			});
			if (editSeason.trim()) await updateLeagueSeason(leagueId, editSeason.trim());
			if (league) league = { ...league, settings: { ...league.settings, seasonalPicks: editSeasonalPicks, pickTimer: editPickTimer }, season: editSeason.trim() || league.season };
			settingsOpen = false;
		} finally {
			savingSettings = false;
		}
	}
</script>

<svelte:head><title>{league?.name ?? 'League'}</title></svelte:head>

<div class="mx-auto max-w-4xl p-6">
	{#if loading}
		<p class="text-[#8f98a0]">Loading…</p>
	{:else if !league}
		<p class="text-[#8f98a0]">League not found.</p>
		<a href="/dashboard" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to dashboard</a>
	{:else}
		<h1 class="text-2xl font-bold mb-2 text-[#c7d5e0]">{league.name}</h1>
		<p class="text-sm text-[#8f98a0] mb-6">
			Invite code: <strong class="text-[#66c0f4]">{league.code}</strong> · Season {league.season} · <span class="text-[#a4d007]">{league.status}</span>
		</p>

		<div class="mb-8 flex flex-wrap gap-4">
			<a
				href="/league/{league?.id}/draft/{league?.season}"
				class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
			>
				Draft room
			</a>
			<a
				href="/games"
				class="rounded border border-[#3d5a80] bg-[#2a475e] px-4 py-2 text-[#c7d5e0] hover:bg-[#3d6a8a] transition-colors"
			>
				Browse games
			</a>
			{#if isCommissioner}
				<button
					type="button"
					onclick={openSettings}
					class="rounded border border-[#3d5a80] bg-[#2a475e] px-4 py-2 text-[#c7d5e0] hover:bg-[#3d6a8a] transition-colors"
				>
					League settings
				</button>
			{/if}
		</div>

		{#if settingsOpen && isCommissioner}
			<div class="mb-6 rounded border border-[#3d5a80] bg-[#2a475e] p-4">
				<h3 class="font-semibold mb-2 text-[#66c0f4]">League settings</h3>
				<div class="flex flex-wrap gap-4 items-end">
					<div>
						<label for="editSeason" class="block text-sm mb-1 text-[#8f98a0]">Season (e.g. 2026)</label>
						<input
							id="editSeason"
							type="text"
							placeholder="2026"
							bind:value={editSeason}
							class="rounded border border-[#3d5a80] bg-[#1b2838] px-3 py-2 text-[#c7d5e0] w-24 focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
						/>
					</div>
					<div>
						<label for="seasonalPicks" class="block text-sm mb-1 text-[#8f98a0]">Seasonal picks per player</label>
						<input
							id="seasonalPicks"
							type="number"
							min="3"
							max="5"
							bind:value={editSeasonalPicks}
							class="rounded border border-[#3d5a80] bg-[#1b2838] px-3 py-2 text-[#c7d5e0] w-24 focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
						/>
					</div>
					<div>
						<label for="pickTimer" class="block text-sm mb-1 text-[#8f98a0]">Pick timer (seconds)</label>
						<input
							id="pickTimer"
							type="number"
							min="30"
							max="300"
							bind:value={editPickTimer}
							class="rounded border border-[#3d5a80] bg-[#1b2838] px-3 py-2 text-[#c7d5e0] w-24 focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
						/>
					</div>
					<button
						type="button"
						onclick={saveSettings}
						disabled={savingSettings}
						class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] disabled:opacity-50 transition-colors"
					>
						{savingSettings ? 'Saving…' : 'Save'}
					</button>
					<button
						type="button"
						onclick={() => (settingsOpen = false)}
						class="rounded border border-[#3d5a80] px-4 py-2 text-[#c7d5e0] hover:bg-[#3d6a8a] transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}

		<h2 class="text-lg font-semibold mb-2 text-[#66c0f4]">Standings</h2>
		{#if teams.length === 0}
			<p class="text-sm text-[#8f98a0] mb-4">No teams yet. Scores appear after the draft and daily scoring.</p>
		{:else}
			<ul class="space-y-2 mb-6">
				{#each teams as team, i}
					<li class="flex items-center gap-4 rounded border border-[#3d5a80] bg-[#2a475e] p-3">
						<span class="font-mono text-[#a4d007] w-6">#{i + 1}</span>
						<span class="font-medium text-[#c7d5e0]">{team.name}</span>
						<span class="ml-auto font-mono text-[#66c0f4]">{team.score ?? 0} pts</span>
					</li>
				{/each}
			</ul>
			<h3 class="text-md font-semibold mb-2 text-[#66c0f4]">Rosters</h3>
			<ul class="space-y-4">
				{#each teams as team}
					<li class="rounded border border-[#3d5a80] bg-[#2a475e] p-3">
						<p class="font-medium mb-2 text-[#c7d5e0]">{team.name}</p>
						<ul class="text-sm space-y-1 text-[#8f98a0]">
							{#if team.picks?.hitPick}
								<li>Hit: <span class="text-[#a4d007]">{gameName(team.picks.hitPick)}</span></li>
							{/if}
							{#if team.picks?.bustPick}
								<li>Bust: {gameName(team.picks.bustPick)}</li>
							{/if}
							{#each team.picks?.seasonalPicks ?? [] as gid}
								<li>Seasonal: {gameName(gid)}</li>
							{/each}
							{#each team.picks?.altPicks ?? [] as gid}
								<li>Alt: {gameName(gid)}</li>
							{/each}
						</ul>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="mt-6"><a href="/dashboard" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to dashboard</a></p>
	{/if}
</div>
