/** m:ss for countdown readouts; rounds up so it lands on 0:00 exactly at zero. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
