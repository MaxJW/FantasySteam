import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ strict: false, fallback: '404.html', pages: 'docs' }),
		alias: {
			$lib: 'src/lib',
			'@/*': 'src/lib/*'
		}
	}
};

export default config;
