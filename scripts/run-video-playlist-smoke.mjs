import assert from 'node:assert/strict';
import { ManualVideoPlaybackController } from '../src/modules/playback/manual-video-playback.ts';

const layers = ['r1', 'r2', 'r3'].map((id) => ({ id, kind: 'video', loop: false, muted: false, volume: 1, available: true }));
const controller = new ManualVideoPlaybackController();
controller.configure({ enabled: true, playlist: layers.map((layer) => ({ layerId: layer.id, enabled: true })) }, layers);
assert.equal(controller.start(), true);
const observed = [];
for (let index = 0; index < 100; index += 1) {
  const snapshot = controller.snapshot();
  observed.push(snapshot.activeLayerId);
  assert.equal(controller.onEnded(snapshot.activeLayerId, snapshot.playbackRevision), true);
}
assert.deepEqual(observed.slice(0, 4), ['r1', 'r2', 'r3', 'r1']);
assert.equal(controller.snapshot().activeLayerId, 'r2');
console.log('VIDEO_PLAYLIST_CONTROLLER_SMOKE_OK transitions=100 cycle=R1-R2-R3');
