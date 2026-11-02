import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const sha = (process.env.GITHUB_SHA || '').slice(0, 7);
const version = sha ? `${pkg.version}+${sha}` : pkg.version;

export default defineConfig({
  base: '/planeraren/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    preact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'] },
      manifest: {
        name: 'Planeraren',
        short_name: 'Planeraren',
        description: 'Planera allt baklänges från en deadline',
        lang: 'sv',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF7F2',
        theme_color: '#FBF7F2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: './',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' }
        }
      } as never
    })
  ],
  test: { environment: 'jsdom' }
} as never);
