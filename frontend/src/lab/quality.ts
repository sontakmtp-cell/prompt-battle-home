import { useEffect, useRef, useState } from 'react';

/**
 * Automatic quality tiers and speed-based level of detail.
 *
 * ky_thuat_my_thuat.md 5.3 and 5.4. The rules exist because the arena has to stay
 * playable on a weak machine, and because effects that are expensive at x4 are
 * also *meaningless* at x4 - the eye cannot resolve a 0.3 s spark when the replay
 * is running four times too fast. Dropping them is correct for performance and
 * for looks at the same time.
 *
 * The one rule the doc states in bold is that the lowest tier must still be
 * playable: no effect is load-bearing for understanding the match.
 */

export type QualityTier = 'high' | 'medium' | 'low' | 'minimal';

export interface QualitySettings {
  tier: QualityTier;
  /** hard cap on simultaneous sparks (section 5.2 rule 5) */
  maxParticles: number;
  trail: boolean;
  wobble: boolean;
  squash: boolean;
  breath: boolean;
  /** how many trail ghosts to keep; 0 when the trail is off */
  trailGhosts: number;
}

/** Section 5.3 table. */
export function tierForFps(fps: number): QualityTier {
  if (fps >= 55) return 'high';
  if (fps >= 40) return 'medium';
  if (fps >= 25) return 'low';
  return 'minimal';
}

/** Section 5.3 table, then section 5.4 applied on top. */
export function settingsFor(tier: QualityTier, speed: number): QualitySettings {
  let s: QualitySettings;
  switch (tier) {
    case 'high':
      s = { tier, maxParticles: 300, trail: true, wobble: true, squash: true, breath: true, trailGhosts: 3 };
      break;
    case 'medium':
      s = { tier, maxParticles: 150, trail: true, wobble: true, squash: true, breath: true, trailGhosts: 2 };
      break;
    case 'low':
      // Section 5.3: no trail, no apex wobble; squash and breathing stay.
      s = { tier, maxParticles: 60, trail: false, wobble: false, squash: true, breath: true, trailGhosts: 0 };
      break;
    case 'minimal':
      // Section 5.3: body, Core and bars only.
      s = { tier, maxParticles: 0, trail: false, wobble: false, squash: false, breath: false, trailGhosts: 0 };
      break;
  }

  // Section 5.4 - level of detail by playback speed.
  if (speed >= 4) {
    s = { ...s, maxParticles: 0, trail: false, trailGhosts: 0 };
  } else if (speed >= 2) {
    s = { ...s, maxParticles: Math.trunc(s.maxParticles / 2), squash: false };
  }
  return s;
}

/**
 * Measure the frame rate over a rolling 2-second window (section 5.3) and report
 * the tier. Deliberately slow-moving: a tier that flips on a single bad frame
 * would flicker, which is worse than running one tier too high.
 */
export function useQualityTier(enabled: boolean): QualityTier {
  const [tier, setTier] = useState<QualityTier>('high');
  const frames = useRef(0);
  const lastSample = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTier('high');
      return;
    }
    lastSample.current = performance.now();
    frames.current = 0;
    const loop = (now: number) => {
      frames.current++;
      const elapsed = now - lastSample.current;
      if (elapsed >= 2000) {
        const fps = (frames.current * 1000) / elapsed;
        frames.current = 0;
        lastSample.current = now;
        const next = tierForFps(fps);
        setTier((prev) => (prev === next ? prev : next));
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [enabled]);

  return tier;
}
