/** Deterministic geometry helpers for assigning portions of a long media file to states. */

export const LIVE_TIMELINE_MIN_SEGMENT_SECONDS = 0.5;

export interface LiveTimelineRange {
  startAt: number;
  endAt: number;
}

export type LiveTimelineResizeEdge = 'start' | 'end';

function assertDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < LIVE_TIMELINE_MIN_SEGMENT_SECONDS) {
    throw new RangeError(`Timeline duration must be at least ${LIVE_TIMELINE_MIN_SEGMENT_SECONDS} seconds.`);
  }
}

function assertRange(range: LiveTimelineRange, duration: number): void {
  assertDuration(duration);
  if (!Number.isFinite(range.startAt) || !Number.isFinite(range.endAt)
    || range.startAt < 0 || range.endAt > duration
    || range.endAt - range.startAt < LIVE_TIMELINE_MIN_SEGMENT_SECONDS) {
    throw new RangeError('Timeline range must be within the media duration and meet the minimum segment length.');
  }
}

/** Clamps a media timestamp to the available duration. */
export function clampLiveTimelineTime(time: number, duration: number): number {
  assertDuration(duration);
  if (!Number.isFinite(time)) return 0;
  return Math.min(duration, Math.max(0, time));
}

/** Snaps a timestamp to a grid before constraining it to the media duration. */
export function snapLiveTimelineTime(time: number, duration: number, snapSeconds = LIVE_TIMELINE_MIN_SEGMENT_SECONDS): number {
  if (!Number.isFinite(snapSeconds) || snapSeconds <= 0) {
    return clampLiveTimelineTime(time, duration);
  }
  return clampLiveTimelineTime(Math.round(time / snapSeconds) * snapSeconds, duration);
}

/** Moves a complete segment while preserving its duration and keeping it in bounds. */
export function moveLiveTimelineRange(range: LiveTimelineRange, deltaSeconds: number, duration: number): LiveTimelineRange {
  assertRange(range, duration);
  const segmentDuration = range.endAt - range.startAt;
  const requestedStart = range.startAt + (Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
  const startAt = Math.min(duration - segmentDuration, Math.max(0, requestedStart));
  return { startAt, endAt: startAt + segmentDuration };
}

/** Resizes one edge of a segment without allowing it to become shorter than 0.5 seconds. */
export function resizeLiveTimelineRange(
  range: LiveTimelineRange,
  edge: LiveTimelineResizeEdge,
  requestedTime: number,
  duration: number,
): LiveTimelineRange {
  assertRange(range, duration);
  const time = Number.isFinite(requestedTime) ? requestedTime : edge === 'start' ? range.startAt : range.endAt;
  if (edge === 'start') {
    return { startAt: Math.min(range.endAt - LIVE_TIMELINE_MIN_SEGMENT_SECONDS, Math.max(0, time)), endAt: range.endAt };
  }
  return { startAt: range.startAt, endAt: Math.max(range.startAt + LIVE_TIMELINE_MIN_SEGMENT_SECONDS, Math.min(duration, time)) };
}

/** Adjacent segments are valid; only positive shared time is reported as overlap. */
export function liveTimelineRangesOverlap(first: LiveTimelineRange, second: LiveTimelineRange): boolean {
  return first.startAt < second.endAt && second.startAt < first.endAt;
}

/** Reports conflicts for UI warnings without changing state-machine or playback semantics. */
export function findLiveTimelineOverlaps(
  candidate: LiveTimelineRange,
  ranges: readonly LiveTimelineRange[],
  excludeIndex?: number,
): number[] {
  return ranges.flatMap((range, index) => index === excludeIndex || !liveTimelineRangesOverlap(candidate, range) ? [] : [index]);
}
