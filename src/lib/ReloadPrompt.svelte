<script lang="ts">
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	const { needRefresh, updateServiceWorker, offlineReady } = useRegisterSW({
		immediate: true,
		onRegisteredSW(swScriptUrl, registration) {
			registration?.update();
		},
		onRegisterError(error) {
			console.error('SW registration error:', error);
		}
	});

	function close() {
		offlineReady.set(false);
		needRefresh.set(false);
	}

	$: toast = $offlineReady || $needRefresh;
</script>

{#if toast}
	<div class="pwa-toast" role="alert">
		<div class="pwa-toast-message">
			{#if $offlineReady}
				<span>App ready to work offline</span>
			{:else}
				<span>New content available, click reload to update.</span>
			{/if}
		</div>
		<div class="pwa-toast-actions">
			{#if $needRefresh}
				<button
					type="button"
					class="pwa-toast-btn pwa-toast-btn-primary"
					onclick={() => updateServiceWorker(true)}
				>
					Reload
				</button>
			{/if}
			<button type="button" class="pwa-toast-btn" onclick={close}>Close</button>
		</div>
	</div>
{/if}

<style>
	.pwa-toast {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		margin: 0;
		padding: 1rem 1.25rem;
		border: 1px solid oklch(0.35 0.05 250 / 0.4);
		border-radius: var(--radius);
		z-index: 9999;
		text-align: left;
		box-shadow: 0 10px 40px oklch(0 0 0 / 0.4);
		background: oklch(0.17 0.04 250 / 0.95);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
	}

	.pwa-toast-message {
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		color: oklch(0.95 0.01 250);
	}

	.pwa-toast-actions {
		display: flex;
		gap: 0.5rem;
	}

	.pwa-toast-btn {
		padding: 0.375rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.5rem;
		border: 1px solid oklch(0.35 0.05 250 / 0.5);
		background: oklch(0.22 0.04 255 / 0.6);
		color: oklch(0.95 0.01 250);
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.pwa-toast-btn:hover {
		background: oklch(0.28 0.04 255 / 0.8);
		border-color: oklch(0.4 0.05 250 / 0.6);
	}

	.pwa-toast-btn-primary {
		background: oklch(0.68 0.16 240);
		border-color: oklch(0.68 0.16 240);
		color: oklch(0.13 0.03 250);
	}

	.pwa-toast-btn-primary:hover {
		background: oklch(0.72 0.16 240);
		border-color: oklch(0.72 0.16 240);
	}
</style>
