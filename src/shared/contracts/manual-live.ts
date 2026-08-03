import type { ProjectMediaReference } from './projects';

export type ManualPlaybackState = 'idle' | 'playing' | 'paused' | 'stopped';

export interface ManualVideoSnapshot {
  playlist: ProjectMediaReference[];
  currentIndex: number | null;
  state: ManualPlaybackState;
  loop: boolean;
  revision: number;
}

export interface ManualAudioSnapshot {
  queue: ProjectMediaReference[];
  currentIndex: number | null;
  state: ManualPlaybackState;
  volume: number;
  autoNext: boolean;
  revision: number;
}

export interface ManualMediaImportInput {
  references: ProjectMediaReference[];
}

export interface ManualVolumeInput {
  volume: number;
}
