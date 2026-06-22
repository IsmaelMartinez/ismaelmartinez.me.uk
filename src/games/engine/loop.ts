/**
 * Fixed-timestep game loop driven by requestAnimationFrame.
 *
 * Updates run at a constant 60Hz simulation rate regardless of display
 * refresh rate; rendering happens once per animation frame.
 */
export interface GameLoop {
  readonly running: boolean;
  start(): void;
  stop(): void;
}

const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;

export function createGameLoop(
  update: (dt: number) => void,
  render: () => void
): GameLoop {
  let rafId: number | null = null;
  let last = 0;
  let accumulator = 0;

  function frame(now: number) {
    rafId = requestAnimationFrame(frame);
    accumulator += Math.min(now - last, MAX_FRAME_MS);
    last = now;
    while (accumulator >= STEP_MS) {
      update(STEP_MS / 1000);
      accumulator -= STEP_MS;
    }
    render();
  }

  return {
    get running() {
      return rafId !== null;
    },
    start() {
      if (rafId !== null) return;
      last = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}
