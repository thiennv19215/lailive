import { describe, expect, it } from 'vitest';
import { AudioPlaylistController } from '../../electron/services/audio-playlist-controller';
import { ManualLiveController } from '../../electron/services/manual-live-controller';
import type { ProjectMediaReference } from '../../src/shared/contracts/projects';

const video = (id: string): ProjectMediaReference => ({ id, label: `${id}.mp4`, kind: 'video', path: `C:/media/${id}.mp4` });
const audio = (id: string): ProjectMediaReference => ({ id, label: `${id}.mp3`, kind: 'audio', path: `C:/media/${id}.mp3` });

describe('ManualLiveController', () => {
  it('keeps video loop and switching state inside the video controller', () => {
    const controller = new ManualLiveController();
    controller.import([video('video-01'), video('video-02')]);
    controller.setLoop(true);
    controller.play();

    expect(controller.snapshot().state).toBe('playing');
    expect(controller.onEnded().state).toBe('playing');
    expect(controller.snapshot().currentIndex).toBe(0);
    expect(controller.next().currentIndex).toBe(1);
    expect(controller.snapshot().state).toBe('playing');
  });

  it('stops at the end when loop is disabled', () => {
    const controller = new ManualLiveController();
    controller.import([video('video-01')]);
    controller.play();

    expect(controller.onEnded().state).toBe('stopped');
  });
});

describe('AudioPlaylistController', () => {
  it('auto-advances sequentially without changing video state', () => {
    const videoController = new ManualLiveController();
    const audioController = new AudioPlaylistController();
    videoController.import([video('video-01')]);
    audioController.import([audio('audio-01'), audio('audio-02'), audio('audio-03')]);
    videoController.play();
    audioController.play();

    audioController.onEnded();
    expect(audioController.snapshot().currentIndex).toBe(1);
    expect(audioController.snapshot().state).toBe('playing');
    expect(videoController.snapshot().state).toBe('playing');

    audioController.setVolume(0.35);
    expect(audioController.snapshot().volume).toBe(0.35);
    expect(videoController.snapshot().currentIndex).toBe(0);
  });

  it('stops after the final track when auto-next is enabled', () => {
    const controller = new AudioPlaylistController();
    controller.import([audio('audio-01'), audio('audio-02')]);
    controller.play();
    controller.onEnded();
    expect(controller.onEnded().state).toBe('stopped');
    expect(controller.snapshot().currentIndex).toBe(1);
  });
});
