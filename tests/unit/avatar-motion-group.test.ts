import { describe, expect, it } from 'vitest';
import { createProjectSceneLayer } from '../../src/shared/contracts/projects';
import { synchronizeAvatarMotionTransforms } from '../../src/shared/studio/avatar-motion-group';

describe('avatar motion group', () => {
  it('keeps every assigned motion state in the frame authored for the selected state', () => {
    const idle = createProjectSceneLayer('idle', 'Host idle', 'avatar');
    const talk = createProjectSceneLayer('talk', 'Host talk', 'avatar');
    idle.avatarMotion = 'idle';
    talk.avatarMotion = 'talk';
    talk.transform = { x: 12, y: -8, scaleX: 1.3, scaleY: 1.3, rotation: 4 };

    expect(synchronizeAvatarMotionTransforms([idle, talk], 'talk')).toBe(true);
    expect(idle.transform).toEqual(talk.transform);
  });

  it('does not change regular avatars that are not motion states', () => {
    const regular = createProjectSceneLayer('regular', 'Another host', 'avatar');
    const idle = createProjectSceneLayer('idle', 'Host idle', 'avatar');
    idle.avatarMotion = 'idle';
    idle.transform.x = 14;

    synchronizeAvatarMotionTransforms([regular, idle], 'idle');

    expect(regular.transform.x).toBe(0);
  });
});
