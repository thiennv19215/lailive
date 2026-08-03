import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/contracts/ipc-channels';
import { manualAutoNextSchema, manualLoopSchema, manualMediaImportSchema, manualVolumeSchema } from '../../src/shared/validation/manual-live';

describe('manual live IPC contracts', () => {
  it('exposes separate video and audio channels', () => {
    expect(IPC_CHANNELS.manualVideoPlay).toBe('video:play');
    expect(IPC_CHANNELS.manualAudioPlay).toBe('audio:play');
    expect(IPC_CHANNELS.manualVideoSnapshot).not.toBe(IPC_CHANNELS.manualAudioSnapshot);
  });

  it('validates media import and transport payloads', () => {
    const reference = { id: 'media-1', label: 'clip.mp4', kind: 'video' as const, path: 'C:/media/clip.mp4' };
    expect(manualMediaImportSchema.parse({ references: [reference] }).references).toHaveLength(1);
    expect(manualVolumeSchema.parse({ volume: 0.4 }).volume).toBe(0.4);
    expect(manualLoopSchema.parse({ loop: true }).loop).toBe(true);
    expect(manualAutoNextSchema.parse({ autoNext: false }).autoNext).toBe(false);
    expect(() => manualVolumeSchema.parse({ volume: 2 })).toThrow();
  });
});
