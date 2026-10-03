import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Keep file watching quiet during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
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
