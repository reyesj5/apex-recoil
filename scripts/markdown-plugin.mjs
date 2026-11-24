// Markdown documents as HTML at build time, for the pages that show docs/ (the privacy policy, the
// FAQ and the changelog): `import doc from '../../docs/faq.md?html'` gives { html, title, description }
// converted by marked, so the pages carry HTML instead of a Markdown parser.
// - The title is the document's first heading, the description the HTML comment
//   `<!-- description: ... -->` it may start with (GitHub doesn't show comments).
// - Headings get ids from their text, so a page can link to a section (/faq#mouse-sensitivity).
// - A link to another document of docs/ keeps only its text: the rest of docs/ is for developers
//   and isn't published.
// - Tables take keyboard focus: on a phone a wide one scrolls sideways in its own box.
import fs from 'node:fs';
import { Marked } from 'marked';

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderMarkdown(source) {
  const description = /^<!--\s*description:\s*([\s\S]*?)\s*-->/.exec(source)?.[1].replace(/\s+/g, ' ') ?? '';
  let title = '';
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }) {
        if (depth === 1 && !title) title = text;
        return `<h${depth} id="${slug(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        if (!/^[a-z]+:|^#/i.test(href)) return text;
        return `<a href="${escapeHtml(href)}">${text}</a>`;
      },
    },
  });
  const html = marked.parse(source.replace(/^<!--[\s\S]*?-->\s*/, '')).replace(/<table>/g, '<table tabindex="0">');
  return { html, title, description };
}

/** The Vite plugin: `*.md?html` imports */
export function markdownToHtml() {
  return {
    name: 'markdown-to-html',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.md?html')) return null;
      const file = id.slice(0, -'?html'.length);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(renderMarkdown(fs.readFileSync(file, 'utf8')))};`;
    },
  };
}
