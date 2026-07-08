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

  // An Astro ClientRouter navigation swaps the page DOM without unloading
  // this module, so a loop left running would keep rendering to a detached
  // canvas forever; every loop retires with the DOM it draws on.
  const onSwap = () => loop.stop();

  const loop: GameLoop = {
    get running() {
      return rafId !== null;
    },
    start() {
      if (rafId !== null) return;
      last = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
      document.addEventListener('astro:before-swap', onSwap);
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.removeEventListener('astro:before-swap', onSwap);
    }
  };
  return loop;
}
