import React, { useEffect, useRef, useState } from 'react';
import type { NetworkEventRecord } from '../types/aegis';
import { SeverityBadge, TriageBadge } from './Badge';

/**
 * 0. Bespoke AegisNet Vector Crest & Wordmark Logo
 * Hexagonal Aegis cyber-shield with internal neural network lattice, orbital electron ring,
 * and pulsing central sentinel core.
 */
export const AegisLogo: React.FC<{
  collapsed?: boolean;
  size?: number;
}> = ({ collapsed = false, size = 36 }) => {
  return (
    <div className="flex items-center gap-3 select-none group">
      <div
        style={{ width: size, height: size }}
        className="relative shrink-0 flex items-center justify-center"
      >
        {/* Subtle ambient core glow */}
        <div className="absolute inset-0 rounded-lg bg-sky-400/15 blur-md group-hover:bg-sky-400/25 transition-all duration-300" />

        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 drop-shadow-[0_0_8px_rgba(56,189,248,0.28)]"
        >
          <defs>
            <linearGradient
              id="aegisOuterGrad"
              x1="6"
              y1="4"
              x2="58"
              y2="60"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <linearGradient
              id="aegisCoreGrad"
              x1="18"
              y1="14"
              x2="46"
              y2="52"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.28)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.85)" />
            </linearGradient>
          </defs>

          {/* Outer Precision Hexagonal Aegis Frame */}
          <polygon
            points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
            fill="rgba(9, 13, 22, 0.9)"
            stroke="url(#aegisOuterGrad)"
            strokeWidth="2"
          />

          {/* Inner Tactical Shield Contour */}
          <path
            d="M32 9L50 19.5V35.5C50 45.2 42.3 52.8 32 56C21.7 52.8 14 45.2 14 35.5V19.5L32 9Z"
            fill="url(#aegisCoreGrad)"
            stroke="rgba(125, 211, 252, 0.45)"
            strokeWidth="1.2"
          />

          {/* Orbital Electron Ring */}
          <ellipse
            cx="32"
            cy="32"
            rx="16"
            ry="7.5"
            transform="rotate(-28 32 32)"
            stroke="rgba(56, 189, 248, 0.55)"
            strokeWidth="1"
            strokeDasharray="3 2"
          />
          <ellipse
            cx="32"
            cy="32"
            rx="16"
            ry="7.5"
            transform="rotate(28 32 32)"
            stroke="rgba(226, 232, 240, 0.35)"
            strokeWidth="1"
          />

          {/* Neural Flow Lattice Lines */}
          <line
            x1="32"
            y1="17"
            x2="21"
            y2="37"
            stroke="#e2e8f0"
            strokeWidth="1.4"
            strokeOpacity="0.8"
          />
          <line
            x1="32"
            y1="17"
            x2="43"
            y2="37"
            stroke="#e2e8f0"
            strokeWidth="1.4"
            strokeOpacity="0.8"
          />
          <line
            x1="21"
            y1="37"
            x2="43"
            y2="37"
            stroke="#38bdf8"
            strokeWidth="1.3"
            strokeOpacity="0.85"
          />
          <line
            x1="32"
            y1="17"
            x2="32"
            y2="46"
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeOpacity="0.65"
          />

          {/* Vertex Electron Nodes */}
          <circle cx="32" cy="17" r="2.6" fill="#ffffff" />
          <circle cx="21" cy="37" r="2.3" fill="#38bdf8" />
          <circle cx="43" cy="37" r="2.3" fill="#38bdf8" />
          <circle cx="32" cy="46" r="2.1" fill="#e2e8f0" />

          {/* Central Sentinel Core */}
          <circle
            cx="32"
            cy="31"
            r="3.4"
            fill="#38bdf8"
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {!collapsed && (
        <div className="leading-none overflow-hidden">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-mono font-bold tracking-[0.16em] text-white">
              AEGIS
            </span>
            <span className="text-[14px] font-mono font-bold tracking-[0.16em] text-sky-400">
              NET
            </span>
          </div>
          <div className="text-[9px] font-mono tracking-[0.14em] text-slate-400 mt-1 truncate">
            OPEN-SET XAI // NIDS
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 1. Perpetual Floating Electron & Electrostatic Lattice Canvas Background
 * Renders continuous floating electrons, orbital nuclei, and dynamic proximity filaments
 * that gently interact with the user's cursor in 60fps HTML5 canvas.
 */
interface ElectronParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
  hue: string;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
}

export const ElectronCanvasBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const pointer = { x: width * 0.5, y: height * 0.35, active: false };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handleMouseLeave = () => {
      pointer.active = false;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);

    // Create perpetual floating electrons
    const particleCount = Math.min(72, Math.max(38, Math.floor((width * height) / 22000)));
    const colors = [
      '56, 189, 248',  // cyan electron
      '226, 232, 240', // silver-white electron
      '125, 211, 252', // ice blue electron
      '52, 211, 153',  // subtle emerald quantum node
    ];

    const particles: ElectronParticle[] = Array.from({ length: particleCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.52,
      vy: (Math.random() - 0.5) * 0.52,
      radius: i % 6 === 0 ? 2.2 : 1.1 + Math.random() * 0.9,
      alpha: 0.35 + Math.random() * 0.45,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.015 + Math.random() * 0.025,
      hue: colors[i % colors.length],
      orbitRadius: 4 + Math.random() * 10,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.012 + Math.random() * 0.02),
    }));

    const linkDistance = 145;
    const cursorDistance = 185;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Update and draw each floating electron
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.pulsePhase += p.pulseSpeed;
        p.orbitAngle += p.orbitSpeed;

        // Perpetual drift + micro orbital harmonic motion
        p.x += p.vx + Math.cos(p.orbitAngle) * 0.14;
        p.y += p.vy + Math.sin(p.orbitAngle) * 0.14;

        // Wrap around screen edges seamlessly
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        // Subtle electromagnetic attraction/orbital tangential force near cursor
        if (pointer.active) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 10 && dist < cursorDistance) {
            const force = (1 - dist / cursorDistance) * 0.018;
            // Tangential orbital swirl + gentle pull
            p.x += dx * force - (dy / dist) * 0.35;
            p.y += dy * force + (dx / dist) * 0.35;

            // Draw electron filament to cursor
            const lineAlpha = (1 - dist / cursorDistance) * 0.24;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${lineAlpha.toFixed(3)})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }

        const currentAlpha =
          p.alpha * (0.7 + 0.3 * Math.sin(p.pulsePhase));

        // Outer electron glow halo
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue}, ${(currentAlpha * 0.15).toFixed(3)})`;
        ctx.fill();

        // Core electron particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.hue}, ${currentAlpha.toFixed(3)})`;
        ctx.fill();

        // For primary nuclei nodes (every 6th particle), draw a miniature orbiting satellite electron
        if (i % 6 === 0) {
          const satX = p.x + Math.cos(p.orbitAngle * 2.2) * p.orbitRadius;
          const satY = p.y + Math.sin(p.orbitAngle * 2.2) * p.orbitRadius;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.orbitRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(56, 189, 248, 0.11)`;
          ctx.lineWidth = 0.6;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(satX, satY, 1.0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(226, 232, 240, 0.75)`;
          ctx.fill();
        }

        // Connect nearby electrons with electrostatic lattice filaments
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < linkDistance * linkDistance) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / linkDistance) * 0.14;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(148, 163, 184, ${alpha.toFixed(3)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.85 }}
    />
  );
};

/**
 * 2. Global Cursor-Tracking Specular Glass Spotlight & Subtle 3D Tilt Engine
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
 * 3. Smooth JavaScript Ease-Out Counter Hook for Live Telemetry Numbers
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
 * 4. Floating Cursor-Following Forensic HUD Card on Flow Row Hover
 */
export const FlowHoverHud: React.FC<{
  event: NetworkEventRecord | null;
  x: number;
  y: number;
}> = ({ event, x, y }) => {
  if (!event) return null;

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

      <div className="px-2 py-1.5 rounded-[2px] bg-black/50 border border-white/10 flex items-center justify-between text-[10px]">
        <span className="text-slate-200">
          {event.src_ip}:{event.src_port}
        </span>
        <span className="text-slate-500">──[{event.protocol}]──►</span>
        <span className="text-slate-100 font-semibold">
          {event.dst_ip}:{event.dst_port}
        </span>
      </div>

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
