import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { buildManifest, resolveBuildIdentity } from './scripts/build-identity';

/**
 * Publish `dist/version.json` next to `index.html`.
 *
 * This file is how a bundled WebView (Capacitor APK / OTA bundle) can tell that
 * the deployment has moved on. It is written from the same identity that is
 * compiled into the JS bundle, so the comparison cannot drift.
 */
const versionManifestPlugin = (): Plugin => ({
  name: 'porokh-version-manifest',
  apply: 'build',
  closeBundle() {
    const outDir = path.resolve(process.cwd(), 'dist');
    const manifest = buildManifest();
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'version.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    // eslint-disable-next-line no-console
    console.log(
      `[version-manifest] version=${manifest.version} buildId=${manifest.buildId}`
    );
  },
});

// package.json থেকে ভার্সন পড়ে নেওয়া হচ্ছে
const buildIdentity = resolveBuildIdentity();

export default defineConfig({
  plugins: [react(), versionManifestPlugin()],
  define: {
    // অ্যাপের ভেতরে VITE_APP_VERSION হিসেবে ভার্সনটি ব্যবহার করা যাবে
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(buildIdentity.version),
    // Build identity compiled into the bundle (see src/features/app-update/buildInfo.ts).
    __POROKH_BUILD__: JSON.stringify(buildIdentity),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url))
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // বড় ফাইলের ওয়ার্নিং লিমিট বাড়িয়ে দেওয়া হলো
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      output: {
        manualChunks: {
          // React এর কোর লাইব্রেরিগুলো
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // ডেটা ফেচিং এবং ক্যাশিং
          'query-vendor': [
            '@tanstack/react-query', 
            '@tanstack/react-query-persist-client',
            '@tanstack/query-sync-storage-persister'
          ],
          // ডেটাবেস ও অথেন্টিকেশন
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'supabase-vendor': ['@supabase/supabase-js'],
        }
      }
    }
  }
});
