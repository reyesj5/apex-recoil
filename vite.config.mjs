import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function writeIfChanged(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (content !== current) fs.writeFileSync(file, content);
}

// Tailwind color name for a theme.json key: focusBorder -> focus-border,
// attachment_1 -> attachment-1, colorStartCircle -> start-circle
function tokenName(key) {
  return key
    .replace(/^color(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

// theme.json is the single source of the color theme: game.ts imports it directly, the
// stylesheets read it through theme.scss (formerly gulp's json-sass task) and Tailwind through
// client/styles/theme-tokens.css. Both files are regenerated here, only when their content changes.
function themeJsonToStyles() {
  const jsonPath = resolve(__dirname, 'theme.json');
  const scssPath = resolve(__dirname, 'theme.scss');
  const tokensPath = resolve(__dirname, 'client/styles/theme-tokens.css');
  const toSass = (v) => Array.isArray(v)
    ? '(' + v.map(toSass).join(', ') + ')'
    : (v && typeof v === 'object')
      ? '(' + Object.entries(v).map(([k, x]) => `${k}: ${toSass(x)}`).join(', ') + ')'
      : String(v);

  return {
    name: 'theme-json-to-styles',
    buildStart() {
      this.addWatchFile(jsonPath);
      const theme = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      const current = fs.existsSync(scssPath) ? fs.readFileSync(scssPath, 'utf8') : '';
      const eol = current.includes('\r\n') ? '\r\n' : '\n';
      writeIfChanged(scssPath, '$theme: (' + eol +
        Object.entries(theme).map(([k, v]) => `  ${k}: ${toSass(v)}`).join(',' + eol) +
        eol + ');' + (/\n$/.test(current) ? eol : ''));

      const tokens = [];
      for (const [key, value] of Object.entries(theme)) {
        if (Array.isArray(value)) {
          value.forEach((v, i) => tokens.push(`  --color-${tokenName(key).replace(/-gradient$/, '')}-${i}: ${v};`));
        } else {
          tokens.push(`  --color-${tokenName(key)}: ${value};`);
        }
      }
      writeIfChanged(tokensPath, [
        '/* Generated from theme.json by vite.config.mjs; edit theme.json instead. */',
        '@theme {',
        '  /* Only the project palette: no Tailwind default colors */',
        '  --color-*: initial;',
        '  --color-white: #fff;',
        '  --color-black: #000;',
        ...tokens,
        '}',
        ''
      ].join('\n'));
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'etc',
  plugins: [themeJsonToStyles(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        // Route bundles: views/layout.pug loads trainer.js, views/editor.pug loads editor.js.
        trainer: resolve(__dirname, 'client/trainer_main.ts'),
        editor: resolve(__dirname, 'client/editor_main.ts'),
        // Legacy /bundle.js: tiny router that lazy-loads the bundle for the current route.
        bundle: resolve(__dirname, 'client/main.ts'),
        // Legacy SCSS and the Tailwind layer that is replacing it (loaded after style.css)
        style: resolve(__dirname, 'style.scss'),
        tailwind: resolve(__dirname, 'client/styles/tailwind.css')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return '[name].css';
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
