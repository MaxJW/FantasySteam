<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { currentUser, getCurrentUser } from '$lib/auth';
	import {
		getLeague,
		getGameList,
		getGame,
		isGameHidden,
		createDraft,
		getDraft,
		subscribeDraft,
		setPresence,
		removePresence,
		startDraft,
		advanceToNextPick,
		submitPick,
		getCurrentPickUserId
	} from '$lib/db';
	import type { Draft, DraftPick, League, Game, GameListEntry } from '$lib/db';
	import { onMount } from 'svelte';

	// Cache to limit Firestore reads: list by year, full game by id
	const gameListCache = new Map<number, GameListEntry[]>();
	const gameDetailCache = new Map<string, Game & { id: string }>();

	let leagueId = $state('');
	let season = $state('');
	let league = $state<(League & { id: string }) | null>(null);
	let draft = $state<(Draft & { id: string }) | null>(null);
	let gameList = $state<GameListEntry[]>([]);
	let gameListModalOpen = $state(false);
	let gameListLoading = $state(false);
	let detailGameId = $state<string | null>(null);
	let detailGame = $state<(Game & { id: string }) | null>(null);
	let detailLoading = $state(false);
	let selectedGameId = $state('');
	let selectedGameName = $state('');
	let selectedPickType = $state<DraftPick['pickType']>('seasonalPick');
	let submitting = $state(false);
	let error = $state('');
	let unsubDraftFn: (() => void) | null = null;

	$effect(() => {
		const params = get(page).params as { id?: string; season?: string };
		leagueId = params?.id ?? '';
		season = params?.season ?? '';
	});

	$effect(() => {
		const unsub = currentUser.subscribe((u) => {
			if (u === null) goto('/');
		});
		return unsub;
	});

	$effect(() => {
		if (!leagueId) return;
		getLeague(leagueId).then((l) => (league = l));
	});

	$effect(() => {
		if (!leagueId || !season) return;
		unsubDraftFn?.();
		const unsub = subscribeDraft(leagueId, season, (d) => (draft = d));
		unsubDraftFn = unsub;
		return () => unsub();
	});

	// Presence: add when draft exists, remove on leave
	$effect(() => {
		if (!draft || !me || !leagueId || !season) return;
		setPresence(leagueId, season, me.uid);
	});

	$effect(() => {
		if (draft?.status !== 'active') return;
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	onMount(() => {
		const user = getCurrentUser();
		if (!user || !leagueId || !season) return;
		const handleLeave = () => {
			removePresence(leagueId, season, user.uid).catch(() => {});
		};
		window.addEventListener('beforeunload', handleLeave);
		window.addEventListener('pagehide', handleLeave);
		return () => {
			handleLeave();
			window.removeEventListener('beforeunload', handleLeave);
			window.removeEventListener('pagehide', handleLeave);
		};
	});

	const me = $derived(getCurrentUser());
	const isCommissioner = $derived(!!(me && league && league.commissionerId === me.uid));
	const allPresent = $derived.by(() => {
		if (!league || !draft) return false;
		const present = draft.presentUserIds ?? [];
		return league.members.every((id) => present.includes(id));
	});
	const currentPickUserId = $derived(draft ? getCurrentPickUserId(draft) : null);
	const isMyTurn = $derived(!!(me && currentPickUserId === me.uid));
	const currentPickUserPresent = $derived(
		!!(currentPickUserId && (draft?.presentUserIds ?? []).includes(currentPickUserId))
	);
	const waitingFor = $derived(
		league?.members.filter((id) => !(draft?.presentUserIds ?? []).includes(id)) ?? []
	);

	async function ensureDraft() {
		if (!leagueId || !season || !league) return;
		let d = await getDraft(leagueId, season);
		if (!d && isCommissioner) {
			await createDraft(leagueId, season, league.members);
			d = await getDraft(leagueId, season);
		}
		if (d) draft = d;
	}

	async function handleStartDraft() {
		if (!leagueId || !season || !league) return;
		await ensureDraft();
		await startDraft(leagueId, season);
	}

	async function handlePickGame() {
		if (!me || !leagueId || !season || !selectedGameId || !league) return;
		if (await isGameHidden(selectedGameId)) {
			error = 'That game cannot be drafted.';
			return;
		}
		submitting = true;
		error = '';
		try {
			await submitPick(leagueId, season, me.uid, selectedGameId, selectedPickType);
			await advanceToNextPick(leagueId, season);
			selectedGameId = '';
			selectedGameName = '';
			detailGameId = null;
			detailGame = null;
			gameListModalOpen = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Pick failed';
		} finally {
			submitting = false;
		}
	}

	async function handleSkip() {
		if (!isCommissioner || !leagueId || !season) return;
		await advanceToNextPick(leagueId, season);
	}

	async function openGameListModal() {
		gameListModalOpen = true;
		detailGameId = null;
		detailGame = null;
		const year = new Date().getFullYear();
		if (gameListCache.has(year)) {
			gameList = gameListCache.get(year)!;
			return;
		}
		gameListLoading = true;
		try {
			const list = await getGameList(year);
			gameListCache.set(year, list);
			gameList = list;
		} finally {
			gameListLoading = false;
		}
	}

	function closeGameListModal() {
		gameListModalOpen = false;
		detailGameId = null;
		detailGame = null;
	}

	async function openGameDetail(id: string) {
		detailGameId = id;
		if (gameDetailCache.has(id)) {
			detailGame = gameDetailCache.get(id)!;
			return;
		}
		detailLoading = true;
		try {
			const g = await getGame(id);
			if (g) {
				gameDetailCache.set(id, g);
				detailGame = g;
			} else {
				detailGame = null;
			}
		} finally {
			detailLoading = false;
		}
	}

	function closeGameDetail() {
		detailGameId = null;
		detailGame = null;
	}

	function selectGameForPick() {
		if (detailGameId && detailGame) {
			selectedGameId = detailGameId;
			selectedGameName = detailGame.name;
			closeGameDetail();
		}
	}

	$effect(() => {
		ensureDraft();
	});
</script>

<svelte:head><title>Draft — {league?.name ?? 'League'}</title></svelte:head>

<div class="mx-auto max-w-4xl p-6">
	{#if !league}
		<p class="text-[#8f98a0]">Loading league…</p>
	{:else}
		<h1 class="text-2xl font-bold mb-2 text-[#c7d5e0]">{league.name} — Draft {season}</h1>
		<p class="text-sm text-[#8f98a0] mb-6">
			<a href="/league/{leagueId}" class="text-[#66c0f4] hover:text-[#8bb8e8] underline">Back to league</a>
		</p>

		{#if !draft}
			<p class="text-[#8f98a0]">No draft for this season yet. Commissioner can create one.</p>
			{#if isCommissioner}
				<button
					type="button"
					onclick={() => ensureDraft()}
					class="mt-4 rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
				>
					Create draft
				</button>
			{/if}
		{:else if draft.status === 'pending'}
			<div class="rounded border border-[#3d5a80] bg-[#2a475e] p-4 mb-6">
				<h2 class="font-semibold mb-2 text-[#66c0f4]">Waiting for everyone</h2>
				{#if waitingFor.length > 0}
					<p class="text-sm text-[#8f98a0]">
						Still waiting for: {waitingFor.length} player(s) to join the draft page.
					</p>
				{:else}
					<p class="text-sm text-[#a4d007]">Everyone is here!</p>
				{/if}
				{#if isCommissioner && allPresent}
					<button
						type="button"
						onclick={handleStartDraft}
						class="mt-4 rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
					>
						Start draft
					</button>
				{:else if isCommissioner}
					<p class="mt-2 text-sm text-[#8f98a0]">Start draft when all members are on this page.</p>
				{/if}
			</div>
		{:else if draft.status === 'active'}
			<div class="rounded border border-[#3d5a80] bg-[#2a475e] p-4 mb-6">
				<h2 class="font-semibold mb-2 text-[#66c0f4]">Current pick</h2>
				{#if !currentPickUserPresent}
					<p class="text-amber-400">Waiting for current picker to rejoin.</p>
				{:else}
					<p class="text-sm text-[#c7d5e0]">
						Round {draft.currentPick?.round}, position {(draft.currentPick?.position ?? 0) + 1}.
						{#if isMyTurn}
							<span class="font-medium text-[#66c0f4]">— It’s your turn!</span>
						{:else}
							<span class="text-[#8f98a0]">— Picker: {currentPickUserId}</span>
						{/if}
					</p>
				{/if}
				{#if isCommissioner && !currentPickUserPresent}
					<button
						type="button"
						onclick={handleSkip}
						class="mt-2 rounded bg-[#3d5a80] px-3 py-1 text-[#c7d5e0] text-sm hover:bg-[#4a6a90] transition-colors"
					>
						Skip pick (commissioner)
					</button>
				{/if}
			</div>

			{#if isMyTurn && currentPickUserPresent}
				<div class="rounded border border-[#3d5a80] bg-[#2a475e] p-4 mb-6">
					<h2 class="font-semibold mb-2 text-[#66c0f4]">Make your pick</h2>
					<div class="mb-4">
						<label for="pick-type" class="block text-sm font-medium mb-1 text-[#8f98a0]">Pick type</label>
						<select
							id="pick-type"
							bind:value={selectedPickType}
							class="rounded border border-[#3d5a80] bg-[#1b2838] px-3 py-2 text-[#c7d5e0] focus:outline-none focus:ring-2 focus:ring-[#66c0f4]"
						>
							<option value="seasonalPick">Seasonal</option>
							<option value="hitPick">Hit Pick</option>
							<option value="bustPick">Bust Pick</option>
							<option value="altPick">Alt Pick</option>
						</select>
					</div>
					<div class="flex flex-wrap items-center gap-4 mb-4">
						<button
							type="button"
							onclick={openGameListModal}
							class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
						>
							Choose game
						</button>
						{#if selectedGameId}
							<span class="text-sm text-[#8f98a0]">
								Selected: <span class="text-[#a4d007]">{selectedGameName || selectedGameId}</span>
							</span>
						{/if}
					</div>
					{#if error}
						<p class="text-red-400 text-sm mb-2">{error}</p>
					{/if}
					<button
						type="button"
						disabled={!selectedGameId || submitting}
						onclick={handlePickGame}
						class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors disabled:opacity-50"
					>
						{submitting ? 'Submitting…' : 'Submit pick'}
					</button>
				</div>
			{/if}

			<!-- Game list modal -->
			{#if gameListModalOpen}
				<div
					class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
					role="dialog"
					aria-modal="true"
					aria-label="Games this year"
					tabindex="-1"
					onclick={(e) => e.target === e.currentTarget && closeGameListModal()}
					onkeydown={(e) => e.key === 'Escape' && closeGameListModal()}
				>
					<div class="bg-[#1b2838] rounded-lg shadow-xl border border-[#3d5a80] max-w-3xl w-full max-h-[85vh] flex flex-col" tabindex="-1">
						<div class="flex items-center justify-between p-4 border-b border-[#3d5a80]">
							<h3 class="text-lg font-semibold text-[#66c0f4]">Games releasing this year</h3>
							<button
								type="button"
								onclick={closeGameListModal}
								class="rounded p-1 text-[#c7d5e0] hover:bg-[#2a475e] transition-colors"
								aria-label="Close"
							>
								×
							</button>
						</div>
						<div class="flex-1 overflow-auto p-4">
							{#if gameListLoading}
								<p class="text-[#8f98a0]">Loading list…</p>
							{:else}
								<div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
									<div class="font-medium text-[#66c0f4]">Date</div>
									<div class="font-medium text-[#66c0f4]">Game</div>
									{#each gameList as game}
										<span class="text-[#8f98a0]">{game.releaseDate ?? 'TBA'}</span>
										<button
											type="button"
											onclick={() => openGameDetail(game.id)}
											class="text-left rounded px-2 py-1.5 text-[#c7d5e0] hover:bg-[#2a475e] transition-colors"
										>
											{game.name}
										</button>
									{/each}
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- Game detail modal -->
			{#if detailGameId && gameListModalOpen}
				<div
					class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
					role="dialog"
					aria-modal="true"
					aria-label="Game details"
					tabindex="-1"
					onclick={(e) => e.target === e.currentTarget && closeGameDetail()}
					onkeydown={(e) => e.key === 'Escape' && closeGameDetail()}
				>
					<div class="bg-[#1b2838] rounded-lg shadow-xl border border-[#3d5a80] max-w-lg w-full max-h-[85vh] overflow-auto" tabindex="-1">
						<div class="p-4">
							{#if detailLoading}
								<p class="text-[#8f98a0]">Loading…</p>
							{:else if detailGame}
								<div class="flex gap-4">
									{#if detailGame.coverUrl}
										<img
											src={detailGame.coverUrl}
											alt=""
											class="w-32 h-40 object-cover rounded flex-shrink-0 border border-[#3d5a80]"
										/>
									{/if}
									<div class="min-w-0 flex-1">
										<h4 class="text-xl font-semibold mb-2 text-[#c7d5e0]">{detailGame.name}</h4>
										{#if detailGame.releaseDate}
											<p class="text-sm text-[#a4d007] mb-2">{detailGame.releaseDate}</p>
										{/if}
										{#if detailGame.description}
											<p class="text-sm text-[#8f98a0] mb-3 whitespace-pre-wrap">{detailGame.description}</p>
										{/if}
										{#if detailGame.companies && detailGame.companies.length > 0}
											<p class="text-sm text-[#8f98a0]">
												<span class="text-[#66c0f4]">Companies: </span>
												{detailGame.companies.join(', ')}
											</p>
										{/if}
									</div>
								</div>
								<div class="mt-4 flex gap-2">
									<button
										type="button"
										onclick={selectGameForPick}
										class="rounded bg-[#66c0f4] px-4 py-2 text-[#1b2838] font-medium hover:bg-[#8bb8e8] transition-colors"
									>
										Select this game
									</button>
									<button
										type="button"
										onclick={closeGameDetail}
										class="rounded border border-[#3d5a80] px-4 py-2 text-[#c7d5e0] hover:bg-[#2a475e] transition-colors"
									>
										Back to list
									</button>
								</div>
							{:else}
								<p class="text-[#8f98a0]">Game not found.</p>
								<button
									type="button"
									onclick={closeGameDetail}
									class="mt-2 rounded border border-[#3d5a80] px-4 py-2 text-[#c7d5e0] hover:bg-[#2a475e] transition-colors"
								>
									Back
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<div class="rounded border border-[#3d5a80] bg-[#2a475e] p-4">
				<h2 class="font-semibold mb-2 text-[#66c0f4]">Pick history</h2>
				{#if draft.picks.length === 0}
					<p class="text-sm text-[#8f98a0]">No picks yet.</p>
				{:else}
					<ul class="space-y-1 text-sm text-[#c7d5e0]">
						{#each draft.picks as pick, i}
							<li>
								Pick {i + 1}: {pick.userId} — <span class="text-[#a4d007]">{pick.gameId}</span> ({pick.pickType})
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{:else if draft.status === 'completed'}
			<p class="text-[#a4d007] font-medium mb-4">Draft completed!</p>
			<div class="rounded border border-[#3d5a80] bg-[#2a475e] p-4">
				<h2 class="font-semibold mb-2 text-[#66c0f4]">Pick history</h2>
				<ul class="space-y-1 text-sm text-[#c7d5e0]">
					{#each draft.picks as pick, i}
						<li>Pick {i + 1}: {pick.userId} — <span class="text-[#a4d007]">{pick.gameId}</span> ({pick.pickType})</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</div>
