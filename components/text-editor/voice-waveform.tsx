"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Geometry. Fewer, slightly wider bars with full pill caps read as a coherent
// "voice" rather than a noisy fence of hairlines.
const BAR_COUNT = 18;
const GAP = 3;
const LOGICAL_W = 92;
const LOGICAL_H = 26;

// Brand sienna (#965034). Kept as channels so alpha can vary per bar/frame.
const R = 150;
const G = 80;
const B = 52;

// Vertical smoothing: rise quickly toward a new peak (feels responsive to
// speech), fall slowly (no flicker). These are per-frame lerp factors.
const ATTACK = 0.42;
const RELEASE = 0.14;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface VoiceWaveformProps {
  getWaveformData: () => Uint8Array | null;
  className?: string;
}

export function VoiceWaveform({ getWaveformData, className }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = LOGICAL_W * dpr;
    canvas.height = LOGICAL_H * dpr;

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return;
    const safeCtx = ctx;
    safeCtx.scale(dpr, dpr);

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const barW = (LOGICAL_W - (BAR_COUNT - 1) * GAP) / BAR_COUNT;
    const usableH = LOGICAL_H * 0.9;
    const restLevel = 0.05; // thin resting line so it never looks dead

    // Per-bar precomputed shape:
    //  - env: center-weighted bell so the middle carries the energy
    //  - fade: left edge dissolves into the input it grows into
    const env: number[] = [];
    const fade: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const pos = (i / (BAR_COUNT - 1)) * 2 - 1; // -1 (left) .. 1 (right)
      const bell = Math.cos((pos * Math.PI) / 2); // 1 center, 0 edges
      env[i] = 0.42 + 0.58 * Math.pow(bell, 0.65);
      fade[i] = 0.16 + 0.84 * clamp01(i / (BAR_COUNT * 0.62));
    }

    // Persistent per-bar height (0..1), smoothed across frames.
    const levels = new Array<number>(BAR_COUNT).fill(restLevel);
    const start = performance.now();

    function draw(now: number) {
      const t = (now - start) / 1000;
      safeCtx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      const data = getWaveformData();
      const hasData = !!data && data.length > 0;

      for (let i = 0; i < BAR_COUNT; i++) {
        // Raw amplitude for this bar from its slice of frequency bins.
        let amp = 0;
        if (hasData) {
          const binsPerBar = Math.max(1, Math.floor(data!.length / BAR_COUNT));
          const s = i * binsPerBar;
          let sum = 0;
          for (let b = 0; b < binsPerBar; b++) {
            sum += data![Math.min(s + b, data!.length - 1)];
          }
          // Gamma lift so quiet speech still moves the bars.
          amp = Math.pow(sum / binsPerBar / 255, 0.62);
        }

        // Idle breathing: a slow travelling wave when nothing is being said,
        // so the control feels alive. Skipped under reduced-motion.
        const idle = reduceMotion
          ? restLevel
          : restLevel + 0.06 * (0.5 + 0.5 * Math.sin(t * 3.2 - i * 0.55));

        const target = clamp01(Math.max(amp * env[i], idle));
        const cur = levels[i];
        const k = target > cur ? ATTACK : RELEASE;
        levels[i] = cur + (target - cur) * k;

        const level = levels[i];
        const barH = Math.max(barW, level * usableH); // never thinner than a dot
        const x = i * (barW + GAP);
        const y = (LOGICAL_H - barH) / 2;

        const alpha = (0.28 + level * 0.72) * fade[i];
        safeCtx.fillStyle = `rgba(${R},${G},${B},${alpha.toFixed(3)})`;

        const radius = barW / 2; // full pill caps
        safeCtx.beginPath();
        if (safeCtx.roundRect) {
          safeCtx.roundRect(x, y, barW, barH, radius);
        } else {
          safeCtx.rect(x, y, barW, barH);
        }
        safeCtx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [getWaveformData]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: LOGICAL_W, height: LOGICAL_H }}
      className={cn("shrink-0 pointer-events-none", className)}
    />
  );
}
