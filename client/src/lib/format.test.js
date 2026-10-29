import { describe, expect, it } from 'vitest';
import { formatTime, formatTotalDuration, plural, timeAgo } from './format.js';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [65, '1:05'],
    [3600 + 61, '1:01:01'],
    [NaN, '0:00'],
    [-3, '0:00'],
  ])('formats %s as %s', (input, expected) => expect(formatTime(input)).toBe(expected));
});

describe('helpers', () => {
  it('formats totals, plurals and relative times', () => {
    expect(formatTotalDuration(59 * 60)).toBe('59 min');
    expect(formatTotalDuration(125 * 60)).toBe('2 hr 5 min');
    expect(plural(1, 'track')).toBe('1 track');
    expect(plural(3, 'track')).toBe('3 tracks');
    const now = Date.UTC(2025, 0, 1, 12);
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d ago');
  });
});
