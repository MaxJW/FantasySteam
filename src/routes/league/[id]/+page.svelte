<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import {
		getLeague,
		getTeam,
		getTeams,
		getGame,
		updateLeagueSettings,
		updateLeagueSeason,
		deleteLeague
	} from '$lib/db';
	import type { Team } from '$lib/db';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardDescription
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Settings, Play, Gamepad2, Trash2 } from '@lucide/svelte';

	let league = $state<Awaited<ReturnType<typeof getLeague>>>(null);
	let myTeam = $state<Awaited<ReturnType<typeof getTeam>>>(null);
	let teams = $state<(Team & { id: string })[]>([]);
	let gameNames = $state<Record<string, string>>({});
	let loading = $state(true);
	let leagueId = $state<string | undefined>(undefined);
	let settingsOpen = $state(false);
	let editSeasonalPicks = $state(4);
	let editSeason = $state('');
	let savingSettings = $state(false);
	let deleteDialogOpen = $state(false);
	let deleting = $state(false);

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
			for (const gid of [
				p?.hitPick,
				p?.bustPick,
				...(p?.seasonalPicks ?? []),
				...(p?.altPicks ?? [])
			].filter(Boolean) as string[]) {
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
			editSeason = league.season ?? '';
		}
		settingsOpen = true;
	}

	async function saveSettings() {
		if (!leagueId) return;
		savingSettings = true;
		try {
			await updateLeagueSettings(leagueId, {
				seasonalPicks: editSeasonalPicks
			});
			if (editSeason.trim()) await updateLeagueSeason(leagueId, editSeason.trim());
			if (league)
				league = {
					...league,
					settings: {
						...league.settings,
						seasonalPicks: editSeasonalPicks
					},
					season: editSeason.trim() || league.season
				};
			settingsOpen = false;
		} finally {
			savingSettings = false;
		}
	}

	async function handleDeleteLeague() {
		if (!leagueId) return;
		deleting = true;
		try {
			await deleteLeague(leagueId);
			deleteDialogOpen = false;
			settingsOpen = false;
			goto('/dashboard');
		} catch (err) {
			// could set error state
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head><title>{league?.name ?? 'League'}</title></svelte:head>

<div class="space-y-8">
	{#if loading}
		<div class="h-64 animate-pulse rounded-xl bg-muted/50"></div>
	{:else if !league}
		<div class="py-12 text-center">
			<h2 class="text-xl font-bold">League not found</h2>
			<Button variant="link" href="/dashboard">Back to dashboard</Button>
		</div>
	{:else}
		<div class="flex flex-col items-start justify-between gap-4 md:flex-row">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">{league.name}</h1>
				<div class="mt-2 flex items-center gap-3 text-muted-foreground">
					<Badge variant="outline" class="font-mono">{league.code}</Badge>
					<span>Season {league.season}</span>
					<Badge variant={league.status === 'active' ? 'default' : 'secondary'}
						>{league.status}</Badge
					>
				</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button
					href="/league/{league?.id}/draft/{league?.season}"
					class="gap-2 shadow-lg shadow-primary/20"
				>
					<Play class="h-4 w-4" /> Enter Draft Room
				</Button>
				<Button variant="outline" href="/games" class="gap-2">
					<Gamepad2 class="h-4 w-4" /> Browse Games
				</Button>
				{#if isCommissioner}
					<Button variant="ghost" onclick={openSettings} size="icon">
						<Settings class="h-4 w-4" />
					</Button>
				{/if}
			</div>
		</div>

		{#if settingsOpen && isCommissioner}
			<Card class="border-primary/50 bg-primary/5">
				<CardHeader>
					<CardTitle class="text-base">League Settings</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex flex-wrap items-end gap-4">
						<div class="w-32">
							<Label for="editSeason">Season</Label>
							<Input id="editSeason" bind:value={editSeason} placeholder="2026" />
						</div>
						<div class="w-32">
							<Label for="seasonalPicks">Picks/Player</Label>
							<Input
								id="seasonalPicks"
								type="number"
								min="3"
								max="5"
								bind:value={editSeasonalPicks}
							/>
						</div>
						<div class="flex gap-2">
							<Button onclick={saveSettings} disabled={savingSettings}
								>{savingSettings ? 'Saving...' : 'Save'}</Button
							>
							<Button variant="ghost" onclick={() => (settingsOpen = false)}>Cancel</Button>
						</div>
					</div>
					<Separator class="my-4" />
					<div class="flex items-center justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-destructive">Delete league</p>
							<p class="text-xs text-muted-foreground"
								>This cannot be undone. The league and its code will be removed.</p
							>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onclick={() => (deleteDialogOpen = true)}
							class="gap-2"
						>
							<Trash2 class="h-4 w-4" /> Delete league
						</Button>
					</div>
				</CardContent>
			</Card>

			<Dialog.Root bind:open={deleteDialogOpen}>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Delete league?</Dialog.Title>
						<Dialog.Description>
							This will permanently delete <strong>{league?.name}</strong>. You cannot undo this.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer class="gap-2 sm:gap-0">
						<Button variant="outline" onclick={() => (deleteDialogOpen = false)} disabled={deleting}
							>Cancel</Button
						>
						<Button variant="destructive" onclick={handleDeleteLeague} disabled={deleting}>
							{deleting ? 'Deleting...' : 'Delete league'}
						</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
		{/if}

		<div class="grid gap-8 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_350px]">
			<div class="space-y-6">
				<h2 class="text-xl font-bold text-primary">Standings</h2>
				{#if teams.length === 0}
					<Card class="border-dashed">
						<CardContent class="py-8 text-center text-muted-foreground">
							No teams yet. Wait for the draft!
						</CardContent>
					</Card>
				{:else}
					<div class="rounded-md border bg-card">
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="w-[60px]">Rank</Table.Head>
									<Table.Head>Team</Table.Head>
									<Table.Head class="text-right">Score</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each teams as team, i}
									<Table.Row>
										<Table.Cell class="font-mono text-accent">#{i + 1}</Table.Cell>
										<Table.Cell class="font-medium">{team.name}</Table.Cell>
										<Table.Cell class="text-right font-mono font-bold text-primary"
											>{team.score ?? 0}</Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{/if}
			</div>

			<div class="space-y-6">
				<h2 class="text-xl font-bold">Rosters</h2>
				<div class="space-y-4">
					{#each teams as team}
						<Card>
							<CardHeader class="bg-muted/30 px-4 py-3">
								<CardTitle class="text-base">{team.name}</CardTitle>
							</CardHeader>
							<CardContent class="space-y-2 p-4 text-sm">
								{#if team.picks?.hitPick}
									<div class="flex justify-between">
										<span class="text-muted-foreground">Hit</span>
										<span class="font-medium text-accent">{gameName(team.picks.hitPick)}</span>
									</div>
								{/if}
								{#if team.picks?.bustPick}
									<div class="flex justify-between">
										<span class="text-muted-foreground">Bust</span>
										<span class="font-medium text-destructive">{gameName(team.picks.bustPick)}</span
										>
									</div>
								{/if}
								{#if (team.picks?.seasonalPicks ?? []).length > 0}
									<Separator class="my-2" />
									<span class="text-xs tracking-wider text-muted-foreground uppercase"
										>Seasonal</span
									>
									<ul class="space-y-1 border-l-2 border-primary/20 pl-2">
										{#each team.picks?.seasonalPicks ?? [] as gid}
											<li>{gameName(gid)}</li>
										{/each}
									</ul>
								{/if}
							</CardContent>
						</Card>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
