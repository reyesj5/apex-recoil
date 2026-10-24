import { useEffect, useRef, useState } from 'react';
import type { Weapon } from '@/engine/weapons';

/**
 * Play spray in a pattern view: the rounds appear when they fire, then the whole pattern stays.
 * `shown` is how many rounds to draw (undefined: all of them). A spray belongs to the weapon and
 * magazine it started with, so picking another one shows that one whole. With reduced motion, Play
 * shows the whole pattern at once.
 */
export function usePlaySpray(weapon: Weapon, capacity: number) {
  const key = `${weapon.name}:${capacity}`;
  const [spray, setSpray] = useState<{ key: string; shown: number } | undefined>(undefined);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const stop = () => {
    cancelAnimationFrame(frame.current);
    setSpray(undefined);
  };

  const play = () => {
    cancelAnimationFrame(frame.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSpray(undefined);
      return;
    }
    const times = weapon.time_points.slice(0, capacity);
    const start = performance.now();
    const step = () => {
      const count = times.filter((at) => at <= performance.now() - start).length;
      if (count < capacity) {
        setSpray({ key, shown: count });
        frame.current = requestAnimationFrame(step);
      } else {
        setSpray(undefined);
      }
    };
    setSpray({ key, shown: 0 });
    frame.current = requestAnimationFrame(step);
  };

  return { shown: spray?.key === key ? spray.shown : undefined, play, stop };
}
