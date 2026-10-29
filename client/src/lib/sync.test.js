import { describe, expect, it } from 'vitest';
import { estimateClockOffset, expectedPosition, needsSeek } from './sync.js';

describe('expectedPosition', () => {
  const base = { positionSec: 10, updatedAt: 1_000_000, isPlaying: true };

  it('extrapolates while playing', () => {
    expect(expectedPosition(base, { now: 1_002_500 })).toBe(12.5);
  });

  it('does not move while paused', () => {
    expect(expectedPosition({ ...base, isPlaying: false }, { now: 1_100_000 })).toBe(10);
  });

  it('applies the clock offset (server ahead of client)', () => {
    // Local clock reads 1_001_000 but the server is 1s ahead -> 2s elapsed.
    expect(expectedPosition(base, { now: 1_001_000, clockOffsetMs: 1000 })).toBe(12);
  });

  it('never goes backwards when the local clock is behind and clamps to duration', () => {
    expect(expectedPosition(base, { now: 999_000 })).toBe(10);
    expect(expectedPosition(base, { now: 2_000_000, durationSec: 60 })).toBe(60);
  });

  it('handles a missing playback state', () => {
    expect(expectedPosition(null)).toBe(0);
  });
});

describe('estimateClockOffset', () => {
  it('uses the sample with the lowest round-trip time', () => {
    const samples = [
      { sentAt: 0, receivedAt: 400, serverTime: 5300 }, // noisy, rtt 400
      { sentAt: 1000, receivedAt: 1100, serverTime: 6050 }, // rtt 100 -> offset 5000
    ];
    expect(estimateClockOffset(samples)).toEqual({ offsetMs: 5000, rttMs: 100 });
  });

  it('defaults to zero without samples', () => {
    expect(estimateClockOffset([])).toEqual({ offsetMs: 0, rttMs: null });
  });
});

describe('needsSeek', () => {
  it('tolerates small drift', () => {
    expect(needsSeek(10.2, 10)).toBe(false);
    expect(needsSeek(11, 10)).toBe(true);
  });
});
