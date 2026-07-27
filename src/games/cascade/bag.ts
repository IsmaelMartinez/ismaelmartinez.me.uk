/**
 * Seven-bag piece randomiser: each run of seven draws contains every
 * tetromino exactly once (a Fisher–Yates shuffle per bag), so droughts are
 * bounded at 12 pieces. The random source is injected, so tests drive it
 * with a seeded LCG.
 */
import { PIECE_IDS, type PieceId } from './piece';

export function createBag(random: () => number): () => PieceId {
  let queue: PieceId[] = [];
  return () => {
    if (queue.length === 0) {
      queue = PIECE_IDS.slice();
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    return queue.shift()!;
  };
}
