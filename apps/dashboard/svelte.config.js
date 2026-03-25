import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      precompress: false,
      strict: true,
      fallback: 'index.html'
    }),
    prerender: {
      entries: ['*'],
      handleHttpError: ({ status, path }) => {
        // Suppress 404 errors for missing static assets (e.g., favicon.png)
        if (status === 404) {
          return;
        }
        throw new Error(`Prerender error: ${status} ${path}`);
      }
    }
  }
};

export default config;
