import { describe, it, expect } from 'vitest';
import {
  PITCH_W,
  PITCH_L,
  CENTRE_X,
  CENTRE_Y,
  GOAL_HALF,
  GOAL_LEFT,
  GOAL_RIGHT,
  BOX_DEPTH,
  BOX_HALF,
  SIX_DEPTH,
  SIX_HALF,
  TEAM_SIZE,
  VIEW_W,
  VIEW_H,
  CAMERA_MIN_X,
  CAMERA_MAX_X,
  CAMERA_MIN_Y,
  CAMERA_MAX_Y,
  ROLES,
  anchorFor,
  attackDir,
  attackGoalY,
  ownGoalY,
  cameraFor,
  inGoalMouth,
  inPenaltyBox,
  inSixYardBox,
  outOfPlay
} from '../../src/games/football/pitch';

const DT = 1 / 60;

describe('pitch geometry', () => {
  it('puts the goal mouth where the specification says', () => {
    expect(GOAL_LEFT).toBe(128);
    expect(GOAL_RIGHT).toBe(212);
    expect(GOAL_RIGHT - GOAL_LEFT).toBe(GOAL_HALF * 2);
  });

  it('recognises the goal mouth and excludes the posts outward', () => {
    expect(inGoalMouth(CENTRE_X)).toBe(true);
    expect(inGoalMouth(GOAL_LEFT + 1)).toBe(true);
    expect(inGoalMouth(GOAL_RIGHT - 1)).toBe(true);
    expect(inGoalMouth(GOAL_LEFT - 1)).toBe(false);
    expect(inGoalMouth(GOAL_RIGHT + 1)).toBe(false);
  });

  it('nests the six-yard box inside the penalty area', () => {
    for (const goalY of [0, PITCH_L]) {
      const inside = { x: CENTRE_X, y: goalY === 0 ? SIX_DEPTH - 2 : PITCH_L - SIX_DEPTH + 2 };
      expect(inSixYardBox(inside.x, inside.y, goalY)).toBe(true);
      expect(inPenaltyBox(inside.x, inside.y, goalY)).toBe(true);

      const boxOnly = { x: CENTRE_X + SIX_HALF + 10, y: inside.y };
      expect(inSixYardBox(boxOnly.x, boxOnly.y, goalY)).toBe(false);
      expect(inPenaltyBox(boxOnly.x, boxOnly.y, goalY)).toBe(true);

      const outside = { x: CENTRE_X + BOX_HALF + 10, y: inside.y };
      expect(inPenaltyBox(outside.x, outside.y, goalY)).toBe(false);
    }
    expect(inPenaltyBox(CENTRE_X, BOX_DEPTH + 2, 0)).toBe(false);
  });

  it('treats only a ball fully off the field as out of play', () => {
    expect(outOfPlay(CENTRE_X, CENTRE_Y)).toBe(false);
    expect(outOfPlay(-1, CENTRE_Y)).toBe(true);
    expect(outOfPlay(PITCH_W + 1, CENTRE_Y)).toBe(true);
    expect(outOfPlay(CENTRE_X, -1)).toBe(true);
    expect(outOfPlay(CENTRE_X, PITCH_L + 1)).toBe(true);
  });
});

describe('attacking direction', () => {
  it('sends the two sides at opposite goals and swaps them at the interval', () => {
    expect(attackDir(0, false)).toBe(1);
    expect(attackDir(1, false)).toBe(-1);
    expect(attackDir(0, true)).toBe(-1);
    expect(attackDir(1, true)).toBe(1);

    expect(attackGoalY(0, false)).toBe(PITCH_L);
    expect(attackGoalY(1, false)).toBe(0);
    expect(attackGoalY(0, true)).toBe(0);
    expect(ownGoalY(0, false)).toBe(0);
    expect(ownGoalY(0, true)).toBe(PITCH_L);
  });
});

describe('formation anchors', () => {
  it('fields a keeper and a 2-3-1', () => {
    expect(ROLES).toHaveLength(TEAM_SIZE);
    expect(ROLES[0]).toBe('keeper');
    expect(ROLES.filter(r => r === 'defender')).toHaveLength(2);
    expect(ROLES.filter(r => r === 'midfielder')).toHaveLength(3);
    expect(ROLES.filter(r => r === 'forward')).toHaveLength(1);
  });

  it('mirrors one side onto the other through the halfway line', () => {
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      const a = anchorFor(0, idx, CENTRE_X, CENTRE_Y, false);
      const b = anchorFor(1, idx, CENTRE_X, CENTRE_Y, false);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(PITCH_L - a.y, 6);
    }
  });

  it('mirrors again when the ends are swapped', () => {
    for (let idx = 1; idx < TEAM_SIZE; idx++) {
      const first = anchorFor(0, idx, CENTRE_X, CENTRE_Y, false);
      const second = anchorFor(0, idx, CENTRE_X, CENTRE_Y, true);
      expect(second.y).toBeCloseTo(PITCH_L - first.y, 6);
    }
  });

  it('drifts the whole block with the ball and never off the pitch', () => {
    const back = anchorFor(0, 6, CENTRE_X, 40, false);
    const forward = anchorFor(0, 6, CENTRE_X, PITCH_L - 40, false);
    expect(forward.y).toBeGreaterThan(back.y);
    for (const bx of [0, CENTRE_X, PITCH_W]) {
      for (const by of [0, CENTRE_Y, PITCH_L]) {
        for (let idx = 0; idx < TEAM_SIZE; idx++) {
          for (const side of [0, 1] as const) {
            const a = anchorFor(side, idx, bx, by, false);
            expect(a.x).toBeGreaterThanOrEqual(0);
            expect(a.x).toBeLessThanOrEqual(PITCH_W);
            expect(a.y).toBeGreaterThanOrEqual(0);
            expect(a.y).toBeLessThanOrEqual(PITCH_L);
          }
        }
      }
    }
  });

  it('keeps the keeper on his own goal line', () => {
    expect(anchorFor(0, 0, CENTRE_X, CENTRE_Y, false).y).toBeLessThan(PITCH_L / 4);
    expect(anchorFor(0, 0, CENTRE_X, CENTRE_Y, true).y).toBeGreaterThan((PITCH_L * 3) / 4);
  });
});

describe('cameraFor', () => {
  const start = { x: 0, y: 0 };

  it('returns whole framebuffer pixels', () => {
    let cam = start;
    for (let i = 0; i < 200; i++) {
      cam = cameraFor(cam, { x: 137.4, y: 291.7, vx: 63.1, vy: -117.9 }, DT);
      expect(Number.isInteger(cam.x)).toBe(true);
      expect(Number.isInteger(cam.y)).toBe(true);
    }
  });

  it('clamps to the pitch plus its terrace margin at every corner', () => {
    const corners = [
      { x: 0, y: 0 },
      { x: PITCH_W, y: 0 },
      { x: 0, y: PITCH_L },
      { x: PITCH_W, y: PITCH_L }
    ];
    for (const corner of corners) {
      let cam = { x: 40, y: 140 };
      for (let i = 0; i < 400; i++) {
        cam = cameraFor(cam, { x: corner.x, y: corner.y, vx: 0, vy: 0 }, DT);
      }
      expect(cam.x).toBeGreaterThanOrEqual(CAMERA_MIN_X);
      expect(cam.x).toBeLessThanOrEqual(CAMERA_MAX_X);
      expect(cam.y).toBeGreaterThanOrEqual(CAMERA_MIN_Y);
      expect(cam.y).toBeLessThanOrEqual(CAMERA_MAX_Y);
    }
  });

  it('never lets the view leave the world, whatever the ball does', () => {
    let cam = start;
    let rnd = 12345;
    const next = () => {
      rnd = (rnd * 1664525 + 1013904223) >>> 0;
      return rnd / 4294967296;
    };
    for (let i = 0; i < 3000; i++) {
      cam = cameraFor(
        cam,
        {
          x: next() * PITCH_W,
          y: next() * PITCH_L,
          vx: (next() - 0.5) * 900,
          vy: (next() - 0.5) * 900
        },
        DT
      );
      expect(cam.x).toBeGreaterThanOrEqual(CAMERA_MIN_X);
      expect(cam.x + VIEW_W).toBeLessThanOrEqual(PITCH_W + 16);
      expect(cam.y).toBeGreaterThanOrEqual(CAMERA_MIN_Y);
      expect(cam.y + VIEW_H).toBeLessThanOrEqual(PITCH_L + 16);
    }
  });

  it('holds still inside the deadzone and follows once the ball leaves it', () => {
    const cam = { x: 46, y: 148 };
    const centre = { x: cam.x + VIEW_W / 2, y: cam.y + VIEW_H / 2 };
    const still = cameraFor(cam, { x: centre.x + 6, y: centre.y + 4, vx: 0, vy: 0 }, DT);
    expect(still).toEqual(cam);

    let moved = cam;
    for (let i = 0; i < 60; i++) {
      moved = cameraFor(moved, { x: centre.x + 80, y: centre.y, vx: 0, vy: 0 }, DT);
    }
    expect(moved.x).toBeGreaterThan(cam.x);
  });
});
