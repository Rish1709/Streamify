// Pure helpers for room playback synchronisation (unit tested).

/** Seconds of drift tolerated before a client hard-seeks to the room position. */
export const DRIFT_TOLERANCE_SEC = 0.75;

/**
 * Where the room's playback should be right now, in seconds.
 * `clockOffsetMs` is serverTime - localTime, from estimateClockOffset().
 */
export function expectedPosition(
  playback,
  { now = Date.now(), clockOffsetMs = 0, durationSec } = {},
) {
  if (!playback) return 0;
  let pos = playback.positionSec;
  if (playback.isPlaying) pos += Math.max(0, now + clockOffsetMs - playback.updatedAt) / 1000;
  return durationSec ? Math.min(pos, durationSec) : pos;
}

/**
 * NTP-style estimate from samples of { sentAt, receivedAt, serverTime }: the sample
 * with the smallest round trip is the most trustworthy.
 */
export function estimateClockOffset(samples) {
  if (!samples.length) return { offsetMs: 0, rttMs: null };
  const best = samples.reduce((a, b) =>
    b.receivedAt - b.sentAt < a.receivedAt - a.sentAt ? b : a,
  );
  const rttMs = best.receivedAt - best.sentAt;
  return { offsetMs: best.serverTime - (best.sentAt + rttMs / 2), rttMs };
}

export const needsSeek = (actual, expected, tolerance = DRIFT_TOLERANCE_SEC) =>
  Math.abs(actual - expected) > tolerance;
