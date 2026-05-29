"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 20;
const GAP = 2.5;
const LOGICAL_W = 80;
const LOGICAL_H = 28;

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
    // Re-assign to a const so TypeScript treats it as non-null inside draw()
    const safeCtx = ctx;
    safeCtx.scale(dpr, dpr);

    const barW = (LOGICAL_W - (BAR_COUNT - 1) * GAP) / BAR_COUNT;

    function draw() {
      safeCtx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

      const data = getWaveformData();

      for (let i = 0; i < BAR_COUNT; i++) {
        // Average the frequency bins that map to this bar
        let amplitude = 0.04; // resting floor so bars are always faintly visible
        if (data && data.length > 0) {
          const binsPerBar = Math.max(1, Math.floor(data.length / BAR_COUNT));
          const start = i * binsPerBar;
          let sum = 0;
          for (let b = 0; b < binsPerBar; b++) {
            sum += data[Math.min(start + b, data.length - 1)];
          }
          amplitude = Math.max(0.04, (sum / binsPerBar) / 255);
        }

        const barH = amplitude * LOGICAL_H * 0.9;
        const x = i * (barW + GAP);
        const y = (LOGICAL_H - barH) / 2;

        // Faint at low amplitude → vivid red at peaks
        const alpha = 0.25 + amplitude * 0.75;
        safeCtx.fillStyle = `rgba(239,68,68,${alpha.toFixed(2)})`;

        const radius = Math.min(barW / 2, barH / 2, 2);
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
