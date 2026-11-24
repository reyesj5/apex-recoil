import { describe, expect, it } from 'vitest';
import { trainerUrl } from './links';

describe('trainerUrl', () => {
  it('is the trainer in the page language, at the site address', () => {
    expect(trainerUrl('ru', 'https://example.test', 'http://127.0.0.1:3000/ru/patterns')).toBe(
      'https://example.test/ru',
    );
    expect(trainerUrl('en', 'https://example.test/', 'http://127.0.0.1:3000/patterns#cookies')).toBe(
      'https://example.test/',
    );
  });

  it('is the trainer here without a site address', () => {
    expect(trainerUrl('zh-CN', undefined, 'http://127.0.0.1:3000/zh-CN/patterns#cookies')).toBe(
      'http://127.0.0.1:3000/zh-CN',
    );
  });
});
