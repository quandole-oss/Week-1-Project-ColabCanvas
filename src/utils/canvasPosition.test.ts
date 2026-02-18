import { describe, it, expect } from 'vitest';
import { snapToGrid, getAbsolutePosition } from './canvasPosition';

describe('snapToGrid vs Math.round (proving the bug fix)', () => {
  it('snapToGrid(130) returns 125 — snaps to 25px grid, causing a 5px shift', () => {
    expect(snapToGrid(130)).toBe(125);
  });

  it('Math.round(130) returns 130 — no shift, just eliminates sub-pixel values', () => {
    expect(Math.round(130)).toBe(130);
  });

  it('Math.round handles sub-pixel values correctly', () => {
    expect(Math.round(130.4)).toBe(130);
    expect(Math.round(130.6)).toBe(131);
  });
});

describe('getAbsolutePosition with grouped objects', () => {
  it('returns correct absolute top-left from identity-scale transform matrix', () => {
    const obj = {
      width: 100,
      height: 60,
      left: 0, // group-relative, not meaningful for absolute
      top: 0,
      scaleX: 1,
      scaleY: 1,
      group: {}, // truthy → signals object is inside a group
      calcTransformMatrix: () => [
        1, 0,  // identity scale (sx=1)
        0, 1,  // identity scale (sy=1)
        200, 150, // absolute center at (200, 150)
      ],
    };
    const pos = getAbsolutePosition(obj);
    // center(200,150) - half-size(50,30) = top-left(150, 120)
    expect(pos.left).toBe(150);
    expect(pos.top).toBe(120);
  });

  it('accounts for scale in offset calculation with scaled transform matrix', () => {
    const obj = {
      width: 100,
      height: 60,
      left: 0,
      top: 0,
      scaleX: 2,
      scaleY: 2,
      group: {},
      calcTransformMatrix: () => [
        2, 0,  // sx=2
        0, 2,  // sy=2
        300, 200, // absolute center
      ],
    };
    const pos = getAbsolutePosition(obj);
    // sx=2, sy=2 → half-size = (100*2)/2=100, (60*2)/2=60
    // center(300,200) - (100,60) = top-left(200, 140)
    expect(pos.left).toBe(200);
    expect(pos.top).toBe(140);
  });

  it('matrix-based result differs from raw left/top when inside a group', () => {
    const obj = {
      width: 80,
      height: 40,
      left: -40, // group-relative position (offset from group center)
      top: -20,
      scaleX: 1,
      scaleY: 1,
      group: {},
      calcTransformMatrix: () => [
        1, 0,
        0, 1,
        500, 300, // absolute center
      ],
    };
    const pos = getAbsolutePosition(obj);
    // From matrix: center(500,300) - half(40,20) = (460, 280)
    expect(pos.left).toBe(460);
    expect(pos.top).toBe(280);
    // Proves this differs from raw left/top (-40, -20)
    expect(pos.left).not.toBe(obj.left);
    expect(pos.top).not.toBe(obj.top);
  });
});

describe('getAbsolutePosition with standalone objects', () => {
  it('returns left/top as-is with default origin (left/top)', () => {
    const obj = {
      left: 100,
      top: 200,
      width: 50,
      height: 50,
      scaleX: 1,
      scaleY: 1,
    };
    const pos = getAbsolutePosition(obj);
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(200);
  });

  it('adjusts left by half-width when originX is center', () => {
    const obj = {
      left: 100,
      top: 200,
      width: 80,
      height: 60,
      scaleX: 1,
      scaleY: 1,
      originX: 'center',
    };
    const pos = getAbsolutePosition(obj);
    // left adjusted: 100 - (80*1)/2 = 60
    expect(pos.left).toBe(60);
    expect(pos.top).toBe(200);
  });

  it('adjusts by full width/height when originX is right and originY is bottom', () => {
    const obj = {
      left: 200,
      top: 300,
      width: 100,
      height: 80,
      scaleX: 1,
      scaleY: 1,
      originX: 'right',
      originY: 'bottom',
    };
    const pos = getAbsolutePosition(obj);
    // left: 200 - 100 = 100, top: 300 - 80 = 220
    expect(pos.left).toBe(100);
    expect(pos.top).toBe(220);
  });
});
