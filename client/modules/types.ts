/**
 * Core type and interface definitions for Recoil Editor and Discovery suite.
 */
import Konva from 'konva';

export interface Edge {
  from: string;
  to: string;
  line: Konva.Line;
}

export interface SessionTrialData {
  source: string;
  shots: number;
  x: number[];
  y: number[];
  raw_x?: number[];
  raw_y?: number[];
  frame_points?: [number, number][];
  origin?: [number, number];
  frame_image?: string;
  frame_width?: number;
  frame_height?: number;
  rpm?: number;
}

export interface ActiveSessionData {
  spec: any;
  baseline_spec?: any;
  candidate_spec?: any;
  standalone_batch_spec?: any;
  merge_strategy?: string;
  sample_count?: number;
  existing_sample_count?: number;
  new_sample_count?: number;
  preview_image?: string;
  preview_points?: [number, number][];
  preview_origin?: [number, number];
  frame_width?: number;
  frame_height?: number;
  individual_trials?: SessionTrialData[];
  zoom: number;
  multiplier?: number;
}

export interface DiscrepancyReport {
  weapon: string;
  baselineShots: number;
  candidateShots: number;
  shotCountMatches: boolean;
  shotCountDelta: number;
  meanDeviationPx: number;
  maxDeviationPx: number;
  maxDeviationShotIdx: number;
  meanDeviationMickeys: number;
  maxDeviationMickeys: number;
  hasMajorDiscrepancy: boolean;
  hasDifferences: boolean;
  warnings: string[];
  status: 'safe' | 'warning' | 'danger';
  savedSamplesText: string;
  candidateSamplesText: string;
}

export interface BatchScreenshotItem {
  id: string;
  name: string;
  dataUrl: string;
  source: string;
  sourceUrl?: string;
  status: 'pending' | 'analyzing' | 'done' | 'error';
  shots?: number;
  expectedShots?: number;
}

export interface RecordedSample {
  id: string;
  name: string;
  blob: Blob;
  objectUrl: string;
  durationSec: number;
  timestamp: Date;
  screenshotData?: string;
  screenshotUrl?: string;
}
