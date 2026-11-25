import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAdaptiveCameraParams } from './cameraMath';

test('portrait viewport widens vertical FOV, pulls chase cam back, and centers showcase car', () => {
  const portrait = computeAdaptiveCameraParams(390 / 844);
  const desktop = computeAdaptiveCameraParams(1440 / 900);

  assert.ok(portrait.fovDelta >= 12, 'Portrait should widen FOV to preserve horizontal road view');
  assert.ok(portrait.chaseDistBonus > 1.5, 'Portrait chase camera should pull back');
  assert.equal(portrait.showcaseSideOffset, 0, 'Portrait showcase should center car horizontally');
  assert.ok(portrait.showcaseVerticalTargetOffset < 0, 'Portrait showcase should frame car in upper half');

  assert.equal(desktop.fovDelta, 0);
  assert.equal(desktop.chaseDistBonus, 0);
  assert.ok(desktop.showcaseSideOffset > 1.0, 'Desktop showcase should offset car to right third');
});

test('mobile landscape viewport keeps widescreen framing without unnecessary portrait zoom-out', () => {
  const landscape = computeAdaptiveCameraParams(844 / 390);
  assert.equal(landscape.fovDelta, 0);
  assert.equal(landscape.chaseDistBonus, 0);
  assert.equal(landscape.showcaseRadius, 5.8);
});
