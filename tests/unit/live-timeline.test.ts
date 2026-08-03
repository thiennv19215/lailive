import { describe, expect, it } from 'vitest';
import {
  clampLiveTimelineTime,
  findLiveTimelineOverlaps,
  LIVE_TIMELINE_MIN_SEGMENT_SECONDS,
  liveTimelineRangesOverlap,
  moveLiveTimelineRange,
  resizeLiveTimelineRange,
  snapLiveTimelineTime,
} from '../../src/shared/live-timeline';

describe('long-video timeline geometry', () => {
  it('clamps and snaps a playhead inside the media duration', () => {
    expect(clampLiveTimelineTime(-4, 60)).toBe(0);
    expect(clampLiveTimelineTime(90, 60)).toBe(60);
    expect(snapLiveTimelineTime(12.26, 60, 0.5)).toBe(12.5);
    expect(snapLiveTimelineTime(60.2, 60, 1)).toBe(60);
  });

  it('moves a segment without changing its length or escaping its video', () => {
    expect(moveLiveTimelineRange({ startAt: 10, endAt: 30 }, 45, 60)).toEqual({ startAt: 40, endAt: 60 });
    expect(moveLiveTimelineRange({ startAt: 10, endAt: 30 }, -20, 60)).toEqual({ startAt: 0, endAt: 20 });
  });

  it('resizes a segment while preserving the 0.5 second minimum', () => {
    const range = { startAt: 10, endAt: 20 };
    expect(resizeLiveTimelineRange(range, 'start', 19.9, 60)).toEqual({ startAt: 19.5, endAt: 20 });
    expect(resizeLiveTimelineRange(range, 'end', 10.1, 60)).toEqual({ startAt: 10, endAt: 10.5 });
    expect(resizeLiveTimelineRange(range, 'start', -2, 60)).toEqual({ startAt: 0, endAt: 20 });
    expect(resizeLiveTimelineRange(range, 'end', 99, 60)).toEqual({ startAt: 10, endAt: 60 });
  });

  it('recognizes overlap for warnings but permits adjacent state segments', () => {
    expect(liveTimelineRangesOverlap({ startAt: 0, endAt: 10 }, { startAt: 10, endAt: 30 })).toBe(false);
    expect(liveTimelineRangesOverlap({ startAt: 0, endAt: 10 }, { startAt: 9.5, endAt: 30 })).toBe(true);
    expect(findLiveTimelineOverlaps({ startAt: 9, endAt: 12 }, [
      { startAt: 0, endAt: 10 },
      { startAt: 10, endAt: 20 },
      { startAt: 25, endAt: 30 },
    ])).toEqual([0, 1]);
    expect(findLiveTimelineOverlaps({ startAt: 10, endAt: 20 }, [{ startAt: 10, endAt: 20 }], 0)).toEqual([]);
  });

  it('rejects ranges and media durations that cannot honor the minimum length', () => {
    expect(() => clampLiveTimelineTime(1, LIVE_TIMELINE_MIN_SEGMENT_SECONDS - 0.1)).toThrow(RangeError);
    expect(() => moveLiveTimelineRange({ startAt: 1, endAt: 1.25 }, 0, 10)).toThrow(RangeError);
  });
});
