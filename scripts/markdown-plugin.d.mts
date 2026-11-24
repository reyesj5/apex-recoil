import type { Plugin } from 'vite';

/** A Markdown document as the doc pages show it */
export interface RenderedDoc {
  html: string;
  title: string;
  description: string;
}

export function renderMarkdown(source: string): RenderedDoc;

/** The Vite plugin for `*.md?html` imports */
export function markdownToHtml(): Plugin;
