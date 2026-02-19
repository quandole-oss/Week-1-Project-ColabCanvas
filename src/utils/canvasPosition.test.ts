import { describe, it, expect } from 'vitest';
import { snapToGrid, snapToGridStrokeAware, getAbsolutePosition } from './canvasPosition';

describe('snapToGrid (50px visual-grid parity)', () => {
  it('snaps 48 to 50 — rounds up to nearest grid line', () => {
    expect(snapToGrid(48)).toBe(50);
  });

  it('snaps 2 to 0 — rounds down to nearest grid line', () => {
    expect(snapToGrid(2)).toBe(0);
  });

  it('snaps 130 to 150 — nearest 50px increment', () => {
    expect(snapToGrid(130)).toBe(150);
  });

  it('snaps 25 to 50 — midpoint rounds up', () => {
    expect(snapToGrid(25)).toBe(50);
  });

  it('snaps 24 to 0 — just below midpoint rounds down', () => {
    expect(snapToGrid(24)).toBe(0);
  });
});

describe('snapToGridStrokeAware', () => {
  it('with strokeWidth=2, shifts visual edge to grid then back', () => {
    // value=49, strokeWidth=2: visual edge = 49-1 = 48, snaps to 50, result = 50+1 = 51
    expect(snapToGridStrokeAware(49, 2, false)).toBe(51);
  });

  it('with strokeUniform=true, ignores stroke offset', () => {
    expect(snapToGridStrokeAware(48, 2, true)).toBe(50);
  });

  it('with strokeWidth=0, behaves like plain snapToGrid', () => {
    expect(snapToGridStrokeAware(48, 0, false)).toBe(50);
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

  it('accounts for rotation when computing top-left from center (45° rotation)', () => {
    const angle = Math.PI / 4; // 45°
    const cos45 = Math.cos(angle);
    const sin45 = Math.sin(angle);
    const obj = {
      width: 100,
      height: 100,
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      group: {},
      calcTransformMatrix: () => [
        cos45, sin45,
        -sin45, cos45,
        300, 300,
      ],
    };
    const pos = getAbsolutePosition(obj);
    // halfW = 50, halfH = 50
    // left = 300 - 50*cos45 + 50*sin45 = 300 (offsets cancel for square at 45°)
    // top  = 300 - 50*sin45 - 50*cos45 = 300 - 70.71 ≈ 229.29
    expect(pos.left).toBeCloseTo(300, 1);
    expect(pos.top).toBeCloseTo(300 - 50 * sin45 - 50 * cos45, 1);
    expect(pos.angle).toBeCloseTo(45, 5);
  });

  it('returns combined angle from the transform matrix', () => {
    const angle = Math.PI / 6; // 30°
    const cos30 = Math.cos(angle);
    const sin30 = Math.sin(angle);
    const obj = {
      width: 80,
      height: 40,
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1,
      group: {},
      calcTransformMatrix: () => [
        cos30, sin30,
        -sin30, cos30,
        200, 150,
      ],
    };
    const pos = getAbsolutePosition(obj);
    expect(pos.angle).toBeCloseTo(30, 5);
    // Verify the position accounts for rotation
    const halfW = 40, halfH = 20;
    expect(pos.left).toBeCloseTo(200 - halfW * cos30 + halfH * sin30, 1);
    expect(pos.top).toBeCloseTo(150 - halfW * sin30 - halfH * cos30, 1);
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
