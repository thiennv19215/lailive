import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TimelinePlaybackController } from '../../electron/services/timeline-playback-controller';
import { SceneRuntimeService } from '../../electron/services/scene-runtime';
import { createEmptyScene } from '../../src/shared/contracts/projects';
import type { ProjectLayerAssetId } from '../../src/shared/contracts/projects';
import { createDefaultScenePresentationState } from '../../src/shared/contracts/scene-runtime';

describe('Manual Live timeline continuity', () => {
  it('does not issue a new visual playback revision when audio volume or queue changes', () => {
    const runtime = new SceneRuntimeService({ rendererDirectory: path.resolve('scene-runtime'), assets: {} as Record<ProjectLayerAssetId, string> });
    const timeline = new TimelinePlaybackController(runtime);
    const scene = createEmptyScene();
    const visual = {
      ...createDefaultScenePresentationState(), mode: 'playing' as const, activeLayerId: 'manual-video-a',
      activeAudioLayerId: 'manual-audio-a', activePaused: false, activeLoop: true, playbackRevision: 3,
    };

    timeline.handoff('manual-live');
    const started = timeline.publish({ owner: 'manual-live', scene, avatarState: 'idle', presentation: visual, claim: true });
    const audioChanged = timeline.publish({
      owner: 'manual-live', scene, avatarState: 'idle', claim: true,
      presentation: { ...visual, activeAudioLayerId: 'manual-audio-b', activeAudioVolume: 0.4 },
    });

    expect(started.event?.state.presentation.playbackRevision).toBe(1);
    expect(audioChanged.event?.state.presentation.playbackRevision).toBe(1);
    expect(audioChanged.event?.state.presentation.activeLayerId).toBe('manual-video-a');
  });
});
