import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { compileToSource, mergeConfigs } from 'cn/compiler';
import { defaultConfig } from 'cn/config';
import { markdownToHtml } from './scripts/markdown-plugin.mjs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function writeIfChanged(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (content !== current) fs.writeFileSync(file, content);
}

// A token value from tokens.json as CSS: a theme's value (the first theme, the only one so far),
// with an alias such as "{volt}" turned into the variable it names
function tokenValue(value, prefix) {
  const v = typeof value === 'string' ? value : Object.values(value)[0];
  const alias = /^\{(.+)\}$/.exec(v);
  return alias ? `var(--${prefix}${alias[1]})` : v;
}

// The new UI's tokens. client/styles/tokens.json is the design system's tokens file (the Design
// System artifact linked from docs/ui-redesign.md). This writes client/styles/design-tokens.css,
// which app.css imports: Tailwind theme variables for every color, radius, shadow, control height
// and font family, and a type-<style> utility for every type style. Spacing tokens are the steps
// of Tailwind's own 4 px scale (space-12 is p-3), so they need no variables. It also writes
// client/lib/cn-tables.ts, the tables cn() in client/lib/utils.ts merges classes with: Tailwind's
// classes as tailwind-merge knows them, with the token names added to Tailwind's scales, compiled
// here so that pages don't download the default config and the compiler (about 6 kB gzip).
function designTokensToTheme() {
  const jsonPath = resolve(__dirname, 'client/styles/tokens.json');
  const cssPath = resolve(__dirname, 'client/styles/design-tokens.css');
  const tablesPath = resolve(__dirname, 'client/lib/cn-tables.ts');

  return {
    name: 'design-tokens-to-theme',
    buildStart() {
      this.addWatchFile(jsonPath);
      const tokens = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const typeUtilities = tokens.type.groups.flatMap((group) =>
        group.styles.map((style) => {
          const declarations = [
            `font-family: var(--font-${style.family || group.family});`,
            `font-size: ${style.fontSize};`,
            style.lineHeight !== undefined && `line-height: ${style.lineHeight};`,
            `font-weight: ${style.fontWeight};`,
            style.letterSpacing && `letter-spacing: ${style.letterSpacing};`,
            // The type grammar has no text-transform; styles whose usage says uppercase get it
            /uppercase/i.test(style.usage || '') && 'text-transform: uppercase;',
          ].filter(Boolean);
          return `@utility type-${style.name} {\n${declarations.map((d) => `  ${d}`).join('\n')}\n}`;
        }),
      );
      // Every size in the type scale as a font-size step (text-13, text-11) for text that takes a
      // size without a whole type style; like an arbitrary size, it leaves the line height alone
      const fontSizes = [
        ...new Set(tokens.type.groups.flatMap((group) => group.styles.map((style) => style.fontSize))),
      ].sort((a, b) => parseFloat(a) - parseFloat(b));
      writeIfChanged(
        cssPath,
        [
          '/* Generated from tokens.json by vite.config.mjs; edit tokens.json (the design system) instead. */',
          '@theme static {',
          '  /* Only the design system: no Tailwind default colors, radii or shadows */',
          '  --color-*: initial;',
          '  --radius-*: initial;',
          '  --shadow-*: initial;',
          '  --color-white: #fff;',
          '  --color-black: #000;',
          ...tokens.color.tokens.map((t) => `  --color-${t.name}: ${tokenValue(t.value, 'color-')};`),
          ...tokens.radius.tokens.map((t) => `  --${t.name}: ${t.value};`),
          ...tokens.shadow.tokens.map((t) => `  --${t.name}: ${tokenValue(t.value, '')};`),
          '  /* Control and tile heights as spacing values: h-control, size-icon, h-touch */',
          ...tokens.size.tokens.map((t) => `  --spacing-${t.name.replace(/^size-/, '')}: ${t.value};`),
          ...Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${stack};`),
          "  /* The type scale's sizes as font-size steps: text-11, text-13 */",
          ...fontSizes.map((size) => `  --text-${parseFloat(size)}: ${size};`),
          '}',
          '',
          ...typeUtilities,
          '',
        ].join('\n'),
      );
      // A later class replaces an earlier one of the same kind: h-touch after h-control,
      // rounded-card after rounded-control-lg, bg-panel after bg-card, type-label after type-micro
      const config = mergeConfigs(defaultConfig(), {
        extend: {
          theme: {
            color: tokens.color.tokens.map((t) => t.name),
            radius: tokens.radius.tokens.map((t) => t.name.replace(/^radius-/, '')),
            shadow: tokens.shadow.tokens.map((t) => t.name.replace(/^shadow-/, '')),
            spacing: tokens.size.tokens.map((t) => t.name.replace(/^size-/, '')),
            font: Object.keys(tokens.type.families),
            // The type scale's sizes as font-size steps (text-13)
            text: fontSizes.map((size) => String(parseFloat(size))),
          },
          classGroups: {
            'type-style': [{ type: tokens.type.groups.flatMap((group) => group.styles.map((style) => style.name)) }],
          },
        },
      });
      writeIfChanged(
        tablesPath,
        compileToSource(config, {
          lang: 'ts',
          banner: "// Generated from tokens.json by vite.config.mjs (cn's merge tables); edit tokens.json instead.",
        }),
      );
    },
  };
}

// Output names: entries by name (the views link them), hashed chunks and assets, CSS by entry name.
// The prerender's build names its assets the same way, so its markup links the client build's files.
const output = {
  entryFileNames: '[name].js',
  chunkFileNames: 'chunks/[name]-[hash].js',
  assetFileNames: (assetInfo) => {
    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
      return '[name].css';
    }
    return 'assets/[name]-[hash].[ext]';
  },
};

const clientBuild = {
  outDir: 'dist',
  emptyOutDir: true,
  sourcemap: true,
  // Oxc, Vite 8's own minifier, leaves about 5 kB (gzip) less JavaScript per new page than esbuild
  minify: 'oxc',
  rollupOptions: {
    input: {
      // The new UI (docs/ui-migration-plan.md): one stylesheet for every new page (app.css, linked
      // by the prerendered pages and views/next.pug; the entries don't import it, or it would land
      // in a shared chunk's CSS) and one React entry per page: the trainer at /, /ru and /zh-CN, its
      // Patterns and Progress pages after each, the documents (/privacy, /faq, /changelog and the
      // 404 page), and the component gallery at /next/components.
      app: resolve(__dirname, 'client/styles/app.css'),
      trainer: resolve(__dirname, 'client/entries/trainer.tsx'),
      patterns: resolve(__dirname, 'client/entries/patterns.tsx'),
      progress: resolve(__dirname, 'client/entries/progress.tsx'),
      docs: resolve(__dirname, 'client/entries/docs.tsx'),
      gallery: resolve(__dirname, 'client/entries/gallery.tsx'),
    },
    output,
  },
};

// The Studio, the rebuilt Recoil Editor previewed at /editor/next (vite build --mode studio, which
// pnpm build runs after the client build), builds on its own into dist/: a page that shares chunks
// with the trainer's splits them further, which costs the trainer's first load (the Studio cost it
// 3.2 kB), while the Studio, a tool for the specs' maintainers, can carry its own copy of React.
const studioBuild = {
  ...clientBuild,
  emptyOutDir: false,
  copyPublicDir: false,
  rollupOptions: { input: { studio: resolve(__dirname, 'client/entries/studio.tsx') }, output },
};

// The prerender (vite build --ssr, which pnpm build runs after the client build): the new pages as a
// Node module, dist-ssr/prerender.mjs, that server/prerender.ts renders into HTML. The client build
// emits the assets it links; dist-ssr/ is outside dist/, so Express never serves it.
const ssrBuild = {
  ssr: true,
  outDir: 'dist-ssr',
  emptyOutDir: true,
  copyPublicDir: false,
  sourcemap: true,
  rollupOptions: {
    input: { prerender: resolve(__dirname, 'client/entries/prerender.tsx') },
    // .mjs (from before package.json declared ES modules), the name the server and the tests look for
    output: { ...output, entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
  },
};

export default defineConfig(({ isSsrBuild, mode }) => ({
  root: '.',
  publicDir: 'etc',
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'client') },
      // shadcn/ui components import `cn` from "cn"; ours is configured with the design tokens
      { find: /^cn$/, replacement: resolve(__dirname, 'client/lib/utils.ts') },
    ],
  },
  plugins: [
    designTokensToTheme(),
    // docs/*.md?html: the documents the doc pages show, as HTML
    markdownToHtml(),
    tailwindcss(),
    react(),
    // React Compiler (automatic memoization) for components; Babel only sees .jsx/.tsx files,
    // so the legacy TypeScript modules are not parsed twice
    babel({ include: /\.[jt]sx$/, presets: [reactCompilerPreset()] }),
  ],
  build: isSsrBuild ? ssrBuild : mode === 'studio' ? studioBuild : clientBuild,
  server: {
    port: 3000,
  },
}));
