import { createCn } from 'cn/engine';
// The merge tables, compiled from the design tokens by vite.config.mjs (designTokensToTheme)
import tables from './cn-tables';

/**
 * Joins class names (like clsx) and resolves Tailwind conflicts (like tailwind-merge), with the
 * design system's names added to Tailwind's scales, so a later class replaces an earlier one of the
 * same kind: h-touch after h-control, rounded-card after rounded-control-lg, bg-panel after
 * bg-card. shadcn/ui components import it as `cn` from "cn"; vite.config.mjs, vitest.config.mts
 * and tsconfig.json point that import here.
 */
export const cn = createCn(tables);
