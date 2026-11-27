import React, { useEffect, useRef, useState } from 'react';
import type { NetworkEventRecord } from '../types/aegis';
import { SeverityBadge, TriageBadge } from './Badge';

/**
 * 1. Global Cursor-Tracking Specular Glass Spotlight & Subtle 3D Tilt Engine
 * Attaches a single lightweight requestAnimationFrame pointer listener that updates
 * `--mouse-x`, `--mouse-y`, `--tilt-x`, and `--tilt-y` on `.bg-[#0d1117]` and `.interactive-tilt` panels.
 */
export const useGlobalGlassCursorEngine = () => {
  useEffect(() => {
    let rafId = 0;

    const handlePointerMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        document.documentElement.style.setProperty(
          '--cursor-x',
          `${e.clientX}px`
        );
        document.documentElement.style.setProperty(
          '--cursor-y',
          `${e.clientY}px`
        );

        const cards = document.querySelectorAll<HTMLElement>(
          '.bg-\\[\\#0d1117\\], .interactive-card'
        );
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          card.style.setProperty('--mouse-x', `${x}px`);
          card.style.setProperty('--mouse-y', `${y}px`);

          if (card.classList.contains('interactive-tilt')) {
            if (
              x >= 0 &&
              x <= rect.width &&
              y >= 0 &&
              y <= rect.height
            ) {
              const normX = (x / rect.width - 0.5) * 2;
              const normY = (y / rect.height - 0.5) * 2;
              card.style.transform = `perspective(900px) rotateX(${(-normY * 1.6).toFixed(2)}deg) rotateY(${(normX * 1.6).toFixed(2)}deg) translateY(-1px)`;
            } else {
              card.style.transform =
                'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0px)';
            }
          }
        });
      });
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handlePointerMove);
    };
  }, []);
};

/**
 * 2. Smooth JavaScript Ease-Out Counter Hook for Live Telemetry Numbers
 */
export const AnimatedMetric: React.FC<{
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
}> = ({
  value,
  decimals = 0,
  suffix = '',
  prefix = '',
  durationMs = 520,
}) => {
  const [display, setDisplay] = useState<number>(value);
  const prevRef = useRef<number>(value);

  useEffect(() => {
    const startVal = prevRef.current;
    const delta = value - startVal;
    if (Math.abs(delta) < 1e-6) {
      setDisplay(value);
      return;
    }
    const t0 = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - t0) / durationMs);
      // Cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startVal + delta * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        prevRef.current = value;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

/**
 * 3. Floating Cursor-Following Forensic HUD Card on Flow Row Hover
 */
export const FlowHoverHud: React.FC<{
  event: NetworkEventRecord | null;
  x: number;
  y: number;
}> = ({ event, x, y }) => {
  if (!event) return null;

  // Keep popover inside viewport bounds
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(winW - 350, Math.max(16, x + 20));
  const top = Math.min(winH - 230, Math.max(16, y - 30));

  return (
    <div
      style={{
        transform: `translate3d(${left}px, ${top}px, 0)`,
      }}
      className="fixed top-0 left-0 z-50 w-80 pointer-events-none glass-modal rounded-[4px] p-3.5 space-y-2.5 text-[11px] font-mono transition-transform duration-75 ease-out"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-white font-semibold">{event.event_uid}</span>
        <div className="flex items-center gap-1.5">
          <TriageBadge category={event.triage_category} />
          <SeverityBadge severity={event.severity} />
        </div>
      </div>

      {/* Topology Strip */}
      <div className="px-2 py-1.5 rounded-[2px] bg-black/50 border border-white/10 flex items-center justify-between text-[10px]">
        <span className="text-slate-200">
          {event.src_ip}:{event.src_port}
        </span>
        <span className="text-slate-500">──[{event.protocol}]──►</span>
        <span className="text-slate-100 font-semibold">
          {event.dst_ip}:{event.dst_port}
        </span>
      </div>

      {/* 4-Metric Mini Bars */}
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>CONF P(y|x)</span>
            <span className="text-slate-100">
              {(event.supervised_confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-slate-200"
              style={{ width: `${event.supervised_confidence * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>ATTACK MASS</span>
            <span className="text-red-300">
              {(event.known_attack_probability * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-400"
              style={{ width: `${event.known_attack_probability * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>ENTROPY H(p)</span>
            <span className="text-sky-300">
              {event.predictive_entropy.toFixed(3)}
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${event.predictive_entropy * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>IF ANOMALY</span>
            <span className="text-amber-300">
              p{event.anomaly_percentile.toFixed(1)}
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400"
              style={{ width: `${event.anomaly_percentile}%` }}
            />
          </div>
        </div>
      </div>

      {event.rationale_text && (
        <div className="text-[10px] text-slate-400 line-clamp-2 border-t border-white/10 pt-1.5 leading-relaxed">
          {event.rationale_text}
        </div>
      )}

      <div className="text-[9px] text-slate-500 flex justify-between pt-0.5">
        <span>CLASS: {event.predicted_label}</span>
        <span className="text-slate-300">[CLICK TO OPEN INSPECTOR →]</span>
      </div>
    </div>
  );
};
