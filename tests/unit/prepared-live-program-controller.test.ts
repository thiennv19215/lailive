import { describe, expect, it } from 'vitest';
import { PreparedLiveProgramController } from '../../electron/services/prepared-live-program-controller';

const program = {
  enabled: true,
  visualVideoLayerId: 'main-visual',
  baseAudioLayerId: 'main-audio',
  cues: [
    { state: 'WELCOME' as const, visualStartAt: 5, visualEndAt: 12, audioLayerId: 'welcome-audio', behavior: 'interrupt-resume' as const },
    { state: 'DEMO' as const, visualStartAt: 60, visualEndAt: 120, audioLayerId: 'demo-audio', behavior: 'jump' as const },
  ],
};

describe('PreparedLiveProgramController', () => {
  it('interrupts a long visual program for separate welcome audio then resumes its exact visual checkpoint', () => {
    const controller = new PreparedLiveProgramController(program);
    expect(controller.start()).toBe(true);
    const mainRevision = controller.snapshot().revision;
    controller.onVisualProgress(mainRevision, 35.5);

    expect(controller.playCue('WELCOME')).toBe(true);
    const welcome = controller.snapshot();
    expect(welcome).toMatchObject({
      visualCurrentTime: 5,
      visualPlaying: true,
      baseAudioPlaying: false,
      cueAudioLayerId: 'welcome-audio',
      cueAudioCurrentTime: 0,
      cueAudioPlaying: true,
      resumeVisualTime: 35.5,
    });

    // The visual can reach the cue boundary; only cue-audio completion resumes.
    controller.onVisualProgress(welcome.revision, 12);
    expect(controller.snapshot().activeCue?.state).toBe('WELCOME');
    expect(controller.onCueAudioEnded(welcome.revision)).toBe(true);
    expect(controller.snapshot()).toMatchObject({
      visualCurrentTime: 35.5,
      baseAudioCurrentTime: 35.5,
      baseAudioPlaying: true,
      cueAudioLayerId: null,
      cueAudioPlaying: false,
      activeCue: null,
    });
  });

  it('jumps Demo to its visual chapter and starts its matching independent audio', () => {
    const controller = new PreparedLiveProgramController(program);
    controller.start(12);
    expect(controller.playCue('DEMO')).toBe(true);
    const demo = controller.snapshot();
    expect(demo).toMatchObject({
      visualCurrentTime: 60,
      visualPlaying: true,
      cueAudioLayerId: 'demo-audio',
      cueAudioCurrentTime: 0,
      cueAudioPlaying: true,
      baseAudioPlaying: false,
      resumeVisualTime: null,
    });
    controller.onVisualProgress(demo.revision, 65.25);
    controller.onCueAudioEnded(demo.revision);
    expect(controller.snapshot()).toMatchObject({ visualCurrentTime: 65.25, baseAudioCurrentTime: 65.25, baseAudioPlaying: true });
  });

  it('rejects disabled or unmapped programs and stale audio events', () => {
    const controller = new PreparedLiveProgramController({ ...program, enabled: false });
    expect(controller.start()).toBe(false);
    expect(controller.playCue('WELCOME')).toBe(false);

    const active = new PreparedLiveProgramController(program);
    active.start();
    active.playCue('WELCOME');
    expect(active.onCueAudioEnded(active.snapshot().revision - 1)).toBe(false);
    expect(active.snapshot().activeCue?.state).toBe('WELCOME');
  });
});
