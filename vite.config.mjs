import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
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

// Lighter background shades and translucent theme colors used by the stylesheets, computed exactly
// as Sass's adjust-color()/rgba() did when the styles were written in SCSS
function derivedTokens(theme) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const lighten = (hex, percent) => {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    let s = 0;
    const l = Math.min(1, Math.max(0, (max + min) / 2 + percent / 100));
    if (d) {
      s = (max + min) / 2 > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const channel = (t) => {
      t = (t + 1) % 1;
      const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
      return Math.round(v * 255);
    };
    return toHex([channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]);
  };
  const alpha = (hex, a) => `rgba(${rgb(hex).join(', ')}, ${a})`;
  return [
    ['menu', lighten(theme.background, 2)],
    ['panel', lighten(theme.background, 3)],
    ['modal', lighten(theme.background, 5)],
    ['background-a95', alpha(theme.background, 0.95)],
    ...[20, 30, 40, 50, 60, 70].map((p) => [`active-a${p}`, alpha(theme.active, p / 100)]),
    ...[1, 2, 3].map((i) => [`attachment-${i}-a50`, alpha(theme[`attachment_${i}`], 0.5)]),
    ...[40, 50, 60, 85].map((p) => [`attachment-4-a${p}`, alpha(theme.attachment_4, p / 100)])
  ].map(([name, value]) => `  --color-${name}: ${value};`);
}

// theme.json is the single source of the color theme: game.ts imports it directly and the
// stylesheets read it through client/styles/theme-tokens.css (Tailwind theme variables), which is
// regenerated here only when its content changes.
function themeJsonToStyles() {
  const jsonPath = resolve(__dirname, 'theme.json');
  const tokensPath = resolve(__dirname, 'client/styles/theme-tokens.css');

  return {
    name: 'theme-json-to-styles',
    buildStart() {
      this.addWatchFile(jsonPath);
      const theme = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

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
        '  /* Derived shades and alpha variants */',
        ...derivedTokens(theme),
        '}',
        ''
      ].join('\n'));
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'etc',
  resolve: {
    alias: { '@': resolve(__dirname, 'client') }
  },
  plugins: [
    themeJsonToStyles(),
    tailwindcss(),
    react(),
    // React Compiler (automatic memoization) for components; Babel only sees .jsx/.tsx files,
    // so the legacy TypeScript modules are not parsed twice
    babel({ include: /\.[jt]sx$/, presets: [reactCompilerPreset()] })
  ],
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
        // All styles (Tailwind with the project's base, component and page CSS)
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
