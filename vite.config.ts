import { defineConfig } from 'vite';

/* The demo is the whole app here: `npm run dev` serves demo/index.html,
   `npm run build` puts a static copy in dist/ ready for any host. */
export default defineConfig({
	root: 'demo',
	base: './',
	build: { outDir: '../dist', emptyOutDir: true },
	server: { port: 5180, open: true }
});
