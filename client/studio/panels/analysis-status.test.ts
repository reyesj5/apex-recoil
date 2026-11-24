import { describe, expect, it } from 'vitest';
import type { JobProgress } from '@/lib/api';
import { describeProgress } from './analysis-status';

/** A running job at a stage, as the job's events report it */
const running = (stage: string, details: JobProgress['details']): JobProgress => ({
  status: 'running',
  progress: 50,
  stage,
  details,
  result: null,
  error: null,
});

describe('describeProgress', () => {
  it("says a file's stage once, with the count the pipeline put in its name", () => {
    expect(describeProgress(running('processing_clip_1_of_2', { clip_index: 1, total_clips: 2 }))).toBe(
      'Processing clip 1 of 2',
    );
    expect(describeProgress(running('processing_image_2_of_3', { image_index: 2, total_images: 3 }))).toBe(
      'Processing image 2 of 3',
    );
  });

  it('adds the count from the details to a stage without one', () => {
    expect(describeProgress(running('splitting_clips', { clip_index: 1, total_clips: 2 }))).toBe(
      'Splitting clips, clip 1 of 2',
    );
    expect(describeProgress(running('aggregating', { trials: 3 }))).toBe('Aggregating');
  });
});
