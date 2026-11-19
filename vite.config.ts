import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: './',
  plugins: [
    // MOCK=1 : remplace Supabase par un faux en mémoire (essais d'interface sans réseau). Jamais utilisé pour la vraie appli.
    {
      name: 'mock-supabase',
      enforce: 'pre',
      resolveId(id, importer) {
        if (process.env.MOCK && importer && /(^|\/)supabase$/.test(id) && !importer.includes('node_modules')) return resolve(root, 'dev/supabase.mock.ts')
      },
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Pagaille',
        short_name: 'Pagaille',
        description: 'Lis un peu chaque jour, avec ton cercle.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#E8EBF2',
        theme_color: '#161D3A',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // Les appels à Supabase et Open Library ne sont jamais mis en cache : données toujours fraîches.
        runtimeCaching: [],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
