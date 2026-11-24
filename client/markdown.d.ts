// A document of docs/ converted at build time (scripts/markdown-plugin.mjs)
declare module '*.md?html' {
  const doc: {
    /** The document as HTML */
    html: string;
    /** Its first heading */
    title: string;
    /** The `<!-- description: ... -->` comment it starts with, or an empty string */
    description: string;
  };
  export default doc;
}
