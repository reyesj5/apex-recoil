import { createPersistedStore, field, flag, number, numberIn, oneOf, text } from './index';

// The Studio's values under the keys the current editor writes: its spec and drawing state
// (client/modules/editor/state.ts, namespace 'editor', so 'editor:<name>'), and the layout and scale
// calibration, which the editor writes directly (layout.ts and toolbar.ts). Fallbacks are the current
// defaults.
export const editorFields = {
  weapon: field('editor:weapon', text, 'r301'),
  distance: field('editor:distance', number, 100),
  stock: field('editor:stock', number, 0),
  barrel: field('editor:barrel', number, 0),
  sens: field('editor:sens', number, 5),
  comment: field('editor:comment', text, ''),
  hdrMode: field('editor:hdr-mode', oneOf(['hdr-standard', 'hdr-vibrant']), 'hdr-standard'),
  threshold: field('editor:threshold', number, 0),
  enableThreshold: field('editor:enable-threshold', flag, true),
  targetFrom: field('editor:target-from', number, 0),
  targetTo: field('editor:target-to', number, 0),
  autoTargets: field('editor:auto-targets', flag, true),
  connectHover: field('editor:connect-hover', flag, true),
  // The drawing, as JSON lists; the current editor clears these when it starts
  points: field('editor:points', text, '[]'),
  edges: field('editor:edges', text, '[]'),
  anchors: field('editor:anchors', text, '[]'),
  imageData: field('editor:imagedata', text, '[]'),
  /** Fine-tunes the optic's scale (80 to 120 %); the key is removed at 100 % */
  scaleFactor: field('editor:scale_factor', numberIn(0.8, 1.2), 1, { removeAtFallback: true }),
  sidebarCollapsed: field('editor_sidebar_collapsed', flag, false),
  toolsCollapsed: field('editor_tools_collapsed', flag, false),
  recordingMethod: field('editor_recording_method', oneOf(['live', 'offline', 'legacy']), 'live'),
};

export const useEditorSettings = createPersistedStore(editorFields);
