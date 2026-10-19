import { useEffect, useRef, useState } from 'react';

// Animates a number from its previous value to the new one, so a credit is *seen* landing.
// The first real value (e.g. when the page loads) is shown straight away: only changes
// animate. Respects "reduce motion": then it just jumps.
export function useCountUp(target: number | undefined, durationMs = 700) {
  const [value, setValue] = useState(target ?? 0);
  const from = useRef<number | undefined>(target);

  useEffect(() => {
    if (target === undefined) return; // still loading: keep what we show
    const start = from.current;
    if (start === undefined || start === target) {
      setValue(target);
      from.current = target;
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      from.current = target;
      return;
    }
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, durationMs]);

  return value;
}
