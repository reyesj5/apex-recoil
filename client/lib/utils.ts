import { createCn } from 'cn/config';
import tokens from '@/styles/tokens.json';

/**
 * Joins class names (like clsx) and resolves Tailwind conflicts (like tailwind-merge), with the
 * design system's names added to Tailwind's scales, so a later class replaces an earlier one of the
 * same kind: h-touch after h-control, rounded-card after rounded-control-lg, bg-panel after
 * bg-card. shadcn/ui components import it as `cn` from "cn"; vite.config.mjs, vitest.config.mts
 * and tsconfig.json point that import here.
 */
export const cn = createCn({
  extend: {
    theme: {
      color: tokens.color.tokens.map((t) => t.name),
      radius: tokens.radius.tokens.map((t) => t.name.replace(/^radius-/, '')),
      shadow: tokens.shadow.tokens.map((t) => t.name.replace(/^shadow-/, '')),
      spacing: tokens.size.tokens.map((t) => t.name.replace(/^size-/, '')),
      font: Object.keys(tokens.type.families),
    },
    classGroups: {
      'type-style': [{ type: tokens.type.groups.flatMap((group) => group.styles.map((style) => style.name)) }],
    },
  },
});
