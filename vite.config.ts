import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			manifest: {
				name: 'Fantasy Steam',
				short_name: 'FantasySteam',
				description: 'Fantasy Steam - draft games and compete with friends',
				theme_color: '#171d2b',
				background_color: '#171d2b',
				display: 'standalone',
				start_url: '/'
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
				maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 // 3 MiB for games data chunk
			},
			devOptions: {
				enabled: true
			},
			kit: {
				adapterFallback: '404.html',
				spa: true
			}
		})
	]
});
