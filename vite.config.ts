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
				start_url: '/',
				icons: [
					{
						src: 'pwa-64x64.png',
						sizes: '64x64',
						type: 'image/png'
					},
					{
						src: 'apple-touch-icon-180x180.png',
						sizes: '180x180',
						type: 'image/png'
					},
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: 'favicon.svg',
						sizes: 'any',
						type: 'image/svg+xml'
					}
				]
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
