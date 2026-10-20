import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {createRequire} from 'node:module';
import firebaseConfig from './firebase-applet-config.json';
const require = createRequire(import.meta.url);

export default defineConfig(({mode}) => ({
  plugins: [react(), tailwindcss(), {
    name: 'noviq-local-ai',
    apply: 'serve',
    configureServer(server) {
      if (mode === 'audit' || mode === 'test') return;
      const membershipPath = require.resolve('./server/local-membership.cjs');
      delete require.cache[membershipPath];
      server.middlewares.use(require(membershipPath)({ firebaseConfig }));
      const env = loadEnv(mode, path.resolve(__dirname, 'functions'), 'GEMINI_');
      // A Vite restart must load the current middleware, not a cached model setup.
      const middlewarePath = require.resolve('./server/local-ai.cjs');
      delete require.cache[middlewarePath];
      server.middlewares.use(require(middlewarePath)({ apiKey: env.GEMINI_API_KEY, firebaseApiKey: firebaseConfig.apiKey, models: (env.GEMINI_LOCAL_MODELS || "gemini-3.5-flash,gemini-3.1-flash-lite").split(",").map(value=>value.trim()) }));
      const telegramPath = require.resolve('./server/local-telegram.cjs');
      delete require.cache[telegramPath];
      server.middlewares.use(require(telegramPath)({ firebaseConfig }));
    },
  }],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Keep file watching quiet during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Reports and private backups are not application source. Writing them must
    // not reload a student's page during an AI request.
    watch: { ignored: [
      '**/artifacts/**',
      '**/backups/**',
      '**/design-system/**',
      '**/PRODUCTION_AUDIT.md',
      '**/FOUNDATION_REDESIGN_STATUS.md',
    ] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/');
          const hasPackage = (name: string) => moduleId.includes(`/node_modules/${name}/`);

          if (!moduleId.includes('node_modules')) return undefined;
          if (hasPackage('@firebase/firestore') || moduleId.includes('firebase/firestore')) return 'firebase-firestore';
          if (hasPackage('@firebase/auth') || moduleId.includes('firebase/auth')) return 'firebase-auth';
          if (
            hasPackage('@firebase/functions') ||
            hasPackage('@firebase/storage') ||
            moduleId.includes('firebase/functions') ||
            moduleId.includes('firebase/storage')
          ) {
            return 'firebase-services';
          }
          if (moduleId.includes('/node_modules/@firebase/') || moduleId.includes('firebase/app')) return 'firebase-core';
          if (
            hasPackage('react-markdown') ||
            moduleId.includes('/node_modules/remark-') ||
            moduleId.includes('/node_modules/rehype-') ||
            moduleId.includes('/node_modules/micromark') ||
            moduleId.includes('/node_modules/mdast-') ||
            moduleId.includes('/node_modules/hast-') ||
            hasPackage('unified') ||
            hasPackage('property-information') ||
            moduleId.includes('/node_modules/vfile') ||
            moduleId.includes('/node_modules/unist-util') ||
            moduleId.includes('/node_modules/estree-util') ||
            moduleId.includes('/node_modules/style-to-') ||
            hasPackage('inline-style-parser') ||
            hasPackage('html-url-attributes') ||
            hasPackage('space-separated-tokens') ||
            hasPackage('comma-separated-tokens') ||
            hasPackage('decode-named-character-reference') ||
            hasPackage('trim-lines') ||
            hasPackage('devlop') ||
            hasPackage('bail') ||
            hasPackage('trough')
          ) {
            return 'markdown-vendor';
          }
          if (hasPackage('react') || hasPackage('react-dom') || hasPackage('scheduler')) return 'react-vendor';
          if (hasPackage('recharts') || moduleId.includes('/node_modules/d3-') || hasPackage('victory-vendor')) return 'charts-vendor';
          if (hasPackage('underscore') || hasPackage('bluebird')) return 'document-runtime';
          if (
            hasPackage('mammoth') ||
            hasPackage('xmlbuilder') ||
            hasPackage('@xmldom/xmldom') ||
            hasPackage('dingbat-to-unicode') ||
            hasPackage('jszip') ||
            hasPackage('lop') ||
            hasPackage('option')
          ) {
            return 'document-vendor';
          }
          if (
            hasPackage('es-toolkit') ||
            hasPackage('@reduxjs/toolkit') ||
            hasPackage('react-redux') ||
            hasPackage('redux') ||
            hasPackage('redux-thunk') ||
            hasPackage('immer') ||
            hasPackage('reselect') ||
            hasPackage('use-sync-external-store') ||
            hasPackage('react-is') ||
            hasPackage('decimal.js-light') ||
            hasPackage('internmap')
          ) {
            return 'charts-vendor';
          }
          if (
            hasPackage('motion') ||
            hasPackage('framer-motion') ||
            hasPackage('motion-dom') ||
            hasPackage('motion-utils')
          ) {
            return 'motion-vendor';
          }
          if (hasPackage('lucide-react')) return 'icons-vendor';
          return 'vendor';
        },
      },
    },
  },
}));
