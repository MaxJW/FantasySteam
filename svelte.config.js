import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ strict: false, fallback: 'index.html', pages: 'docs' }),
		alias: {
			$lib: 'src/lib',
			'@/*': 'src/lib/*'
		}
	}
};

export default config;
