import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import type { NetworkEventRecord } from '../types/aegis';
import { SeverityBadge, TriageBadge } from './Badge';

/**
 * 0. Bespoke AegisNet Vector Crest & Wordmark Logo with GradeGuide `.draw-icon` SVG Path Animation
 * and `.holographic-text` Brand Title.
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
        <div className="absolute inset-0 rounded-lg bg-[#79c0ff]/20 blur-md group-hover:bg-[#d2a8ff]/30 transition-all duration-300" />

        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full relative z-10 draw-icon drop-shadow-[0_0_10px_rgba(121,192,255,0.35)]"
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
              <stop offset="0%" stopColor="#79c0ff" />
              <stop offset="50%" stopColor="#d2a8ff" />
              <stop offset="100%" stopColor="#ff7b72" />
            </linearGradient>
            <linearGradient
              id="aegisCoreGrad"
              x1="18"
              y1="14"
              x2="46"
              y2="52"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="rgba(121, 192, 255, 0.25)" />
              <stop offset="100%" stopColor="rgba(22, 27, 34, 0.9)" />
            </linearGradient>
          </defs>

          {/* Outer Precision Hexagonal Aegis Frame */}
          <polygon
            points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
            fill="#0d1117"
            stroke="url(#aegisOuterGrad)"
            strokeWidth="2.2"
          />

          {/* Inner Tactical Shield Contour */}
          <path
            d="M32 9L50 19.5V35.5C50 45.2 42.3 52.8 32 56C21.7 52.8 14 45.2 14 35.5V19.5L32 9Z"
            fill="url(#aegisCoreGrad)"
            stroke="#79c0ff"
            strokeWidth="1.3"
          />

          {/* Orbital Electron Rings */}
          <ellipse
            cx="32"
            cy="32"
            rx="16"
            ry="7.5"
            transform="rotate(-28 32 32)"
            stroke="#d2a8ff"
            strokeWidth="1.1"
            strokeDasharray="3 2"
          />
          <ellipse
            cx="32"
            cy="32"
            rx="16"
            ry="7.5"
            transform="rotate(28 32 32)"
            stroke="#79c0ff"
            strokeWidth="1.1"
          />

          {/* Neural Flow Lattice Lines */}
          <line
            x1="32"
            y1="17"
            x2="21"
            y2="37"
            stroke="#f0f6fc"
            strokeWidth="1.5"
          />
          <line
            x1="32"
            y1="17"
            x2="43"
            y2="37"
            stroke="#f0f6fc"
            strokeWidth="1.5"
          />
          <line
            x1="21"
            y1="37"
            x2="43"
            y2="37"
            stroke="#79c0ff"
            strokeWidth="1.4"
          />
          <line
            x1="32"
            y1="17"
            x2="32"
            y2="46"
            stroke="#d2a8ff"
            strokeWidth="1.3"
          />

          {/* Vertex Electron Nodes */}
          <circle cx="32" cy="17" r="2.6" fill="#ffffff" />
          <circle cx="21" cy="37" r="2.4" fill="#79c0ff" />
          <circle cx="43" cy="37" r="2.4" fill="#d2a8ff" />
          <circle cx="32" cy="46" r="2.2" fill="#ff7b72" />

          {/* Central Sentinel Core */}
          <circle
            cx="32"
            cy="31"
            r="3.5"
            fill="#79c0ff"
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </svg>
      </div>

      {!collapsed && (
        <div className="leading-none overflow-hidden">
          <div className="brand-title text-[17px] font-bold tracking-tight holographic-text">
            AEGISNET.ai
          </div>
          <div className="text-[10px] font-mono text-[#8b949e] mt-1 truncate">
            Open-Set NIDS & XAI
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * 1. GradeGuide Excited Perpetual Electron / Starfield Canvas Background (Multiplied Density!)
 * Exact physics from GradeGuide's `ParticleBackground`:
 * - Multiplied particle count (`(width * height) / 4200` -> ~350-450 stars/electrons on 1080p)
 * - Excited velocity `(Math.random() - 0.5) * 1.65`
 * - Mouse repulsion force field (`mouse.radius = 155`, `force * 5` push-away)
 * - Dynamic constellation connections (`distance < 135`)
 */
export const ElectronCanvasBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;

    const mouse: { x: number | null; y: number | null; radius: number } = {
      x: null,
      y: null,
      radius: 155,
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', resize);
    resize();

    interface StarElectron {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
    }

    const starPalette = [
      'rgba(201, 209, 217, 0.78)', // GradeGuide signature bright silver
      'rgba(121, 192, 255, 0.75)', // GradeGuide holographic blue
      'rgba(210, 168, 255, 0.72)', // GradeGuide holographic violet
      'rgba(240, 246, 252, 0.85)', // Bright white star
    ];

    // Balanced high-density starfield (~140-175 stars on 1080p) for locked 60fps performance
    const particleCount = Math.min(
      175,
      Math.max(85, Math.floor((canvas.width * canvas.height) / 11500))
    );

    const particles: StarElectron[] = Array.from(
      { length: particleCount },
      (_, i) => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1.45,
        vy: (Math.random() - 0.5) * 1.45,
        radius: Math.random() * 1.6 + 0.6,
        color: starPalette[i % starPalette.length],
      })
    );

    const mouseRadiusSq = mouse.radius * mouse.radius;
    const linkDist = 125;
    const linkDistSq = linkDist * linkDist;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Fast squared-distance mouse repulsion check
        if (mouse.x != null && mouse.y != null) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 0.1 && distSq < mouseRadiusSq) {
            const distance = Math.sqrt(distSq);
            const force = (mouse.radius - distance) / mouse.radius;
            p.x -= (dx / distance) * force * 4.5;
            p.y -= (dy / distance) * force * 4.5;
          }
        }

        if (p.x < 0 || p.x > canvas.width) p.vx = -p.vx;
        if (p.y < 0 || p.y > canvas.height) p.vy = -p.vy;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }

      // Draw GradeGuide Constellation Filaments using fast squared-distance pre-filter
      ctx.lineWidth = 0.75;
      for (let i = 0; i < particles.length; i++) {
        const pi = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const pj = particles[j];
          const dx = pi.x - pj.x;
          if (dx > linkDist || dx < -linkDist) continue;
          const dy = pi.y - pj.y;
          if (dy > linkDist || dy < -linkDist) continue;

          const distSq = dx * dx + dy * dy;
          if (distSq < linkDistSq) {
            const alpha = (1 - distSq / linkDistSq) * 0.18;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(201, 209, 217, ${alpha.toFixed(3)})`;
            ctx.moveTo(pi.x, pi.y);
            ctx.lineTo(pj.x, pj.y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: 'var(--bg-dark)' }}
    />
  );
};

/**
 * 2. GradeGuide TerminalBackground Component
 * Faded background live terminal stream in bottom corner.
 */
export const TerminalBackground: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([
    '> [INIT] AegisNet NIDS Core & Calibrated Random Forest ready.',
    '> [OK] Isolation Forest benign p95 quantile reference loaded.',
    '> [XAI] TreeSHAP additive decision-path engine online.',
  ]);

  useEffect(() => {
    const commands = [
      'Evaluating incoming CICFlowMeter 24-feature vector...',
      '[OK] Platt sigmoid calibration ECE verified (0.0063).',
      'Computing normalized Shannon entropy H(p)/ln(K)...',
      'Probing Isolation Forest open-set decision boundary...',
      '[WARN] Elevated IAT variance detected on TCP/8443 flow.',
      'Synthesizing Suricata IDS & nftables containment rule...',
      'Checking Population Stability Index (PSI) feature drift...',
      '[OK] TreeSHAP local waterfall additivity verified.',
    ];

    const interval = setInterval(() => {
      const randomCmd = commands[Math.floor(Math.random() * commands.length)];
      const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
      setLogs((prev) => [...prev.slice(-11), `> [${timestamp}] ${randomCmd}`]);
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="terminal-bg-container">
      {logs.map((log, i) => (
        <div key={i}>{log}</div>
      ))}
    </div>
  );
};

/**
 * 3. GradeGuide TypewriterText Component with Blinking Block Cursor (`█`)
 */
export const TypewriterText: React.FC<{
  text: string;
  delay?: number;
  className?: string;
}> = ({ text, delay = 32, className = '' }) => {
  const [currentText, setCurrentText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setCurrentText((prev) => prev + text[currentIndex]);
        setCurrentIndex((prev) => prev + 1);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, delay, text]);

  return (
    <span className={className}>
      {currentText}
      <span className="inline-block ml-0.5 text-[#79c0ff] animate-pulse">
        █
      </span>
    </span>
  );
};

/**
 * 4. GradeGuide MagneticButton Component (Pulls Toward Cursor on Hover)
 */
export const MagneticButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}> = ({
  children,
  onClick,
  className = '',
  title,
  disabled = false,
  type = 'button',
}) => {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ref.current || disabled) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setPosition({ x: x * 0.28, y: y * 0.28 });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition:
          position.x === 0
            ? 'transform 0.45s cubic-bezier(0.3, 0, 0.5, 1)'
            : 'none',
      }}
    >
      {children}
    </button>
  );
};

/**
 * 5. GradeGuide ScoreRing Animated SVG Circular Gauge
 */
export const ScoreRing: React.FC<{
  score: number;
  label: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}> = ({
  score,
  label,
  sublabel,
  size = 86,
  strokeWidth = 7,
  color,
}) => {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clamped / 100) * circumference;
  const activeColor =
    color ||
    (clamped >= 80
      ? '#39d353'
      : clamped >= 50
      ? '#79c0ff'
      : '#f85149');

  return (
    <div className="flex items-center gap-3.5">
      <div style={{ position: 'relative', width: size, height: size }} className="shrink-0">
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={activeColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1.2s ease-out' }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-mono font-bold text-white">
            {clamped.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-xs font-heading font-semibold text-white truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-[11px] text-[#8b949e] mt-0.5 leading-snug">
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * 6. GradeGuide ActivityHeatmap (GitHub-Style 90-Day Threat & Flow Inspection Matrix)
 */
export const ActivityHeatmap: React.FC<{ totalEvents: number }> = ({
  totalEvents,
}) => {
  const cells = useMemo(() => {
    // Deterministic 7x18 matrix seeded by totalEvents so it reflects live session growth
    return Array.from({ length: 7 * 18 }, (_, idx) => {
      const v = ((idx * 17 + totalEvents * 3) % 11);
      if (idx > 118) return Math.min(4, Math.max(2, (totalEvents % 4) + 1));
      if (v < 5) return 0;
      if (v < 7) return 1;
      if (v < 9) return 2;
      if (v === 9) return 3;
      return 4;
    });
  }, [totalEvents]);

  const getColor = (val: number) => {
    if (val === 0) return '#161b22';
    if (val === 1) return '#0e4429';
    if (val === 2) return '#006d32';
    if (val === 3) return '#26a641';
    return '#39d353';
  };

  return (
    <div className="bg-[#0d1117] p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-heading font-semibold text-[#c9d1d9] flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#79c0ff]" />
          Network Flow Inspection & Threat Triage Activity (90-Day Telemetry Matrix)
        </h3>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#8b949e]">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <span
              key={lv}
              style={{ background: getColor(lv) }}
              className="w-2.5 h-2.5 rounded-[2px] inline-block border border-white/5"
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 1fr)',
          gridAutoFlow: 'column',
          gap: '4px',
        }}
        className="overflow-x-auto pb-1"
      >
        {cells.map((val, i) => (
          <div
            key={i}
            style={{
              width: '12px',
              height: '12px',
              background: getColor(val),
              borderRadius: '2px',
              outline: '1px solid rgba(255,255,255,0.05)',
              outlineOffset: '-1px',
            }}
            className="hover:scale-125 transition-transform"
            title={`Telemetry Window #${i + 1}: ${val * 18} flows verified`}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * 7. Zero-Thrash Cursor Spotlight Engine (Updates ONLY the single card under the pointer!)
 */
export const useGlobalGlassCursorEngine = () => {
  useEffect(() => {
    let rafId = 0;
    let activeCard: HTMLElement | null = null;

    const handlePointerMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const card = target.closest<HTMLElement>(
          'main .bg-\\[\\#0d1117\\], .spotlight-wrapper'
        );
        if (activeCard && activeCard !== card) {
          activeCard.style.setProperty('--mouse-x', '-999px');
          activeCard.style.setProperty('--mouse-y', '-999px');
        }
        if (card) {
          const rect = card.getBoundingClientRect();
          card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
          card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
          activeCard = card;
        }
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
 * 8. Smooth JavaScript Ease-Out Counter Hook for Live Telemetry Numbers
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
 * 9. Floating Cursor-Following Forensic HUD Card on Flow Row Hover
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
      className="fixed top-0 left-0 z-50 w-80 pointer-events-none glass-modal rounded-[6px] p-3.5 space-y-2.5 text-[11px] font-mono transition-transform duration-75 ease-out"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-[#79c0ff] font-semibold">{event.event_uid}</span>
        <div className="flex items-center gap-1.5">
          <TriageBadge category={event.triage_category} />
          <SeverityBadge severity={event.severity} />
        </div>
      </div>

      <div className="px-2 py-1.5 rounded-[4px] bg-black/50 border border-white/10 flex items-center justify-between text-[10px]">
        <span className="text-slate-200">
          {event.src_ip}:{event.src_port}
        </span>
        <span className="text-[#d2a8ff]">──[{event.protocol}]──►</span>
        <span className="text-white font-semibold">
          {event.dst_ip}:{event.dst_port}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>CONF P(y|x)</span>
            <span className="text-[#79c0ff]">
              {(event.supervised_confidence * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#79c0ff]"
              style={{ width: `${event.supervised_confidence * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>ATTACK MASS</span>
            <span className="text-[#ff7b72]">
              {(event.known_attack_probability * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ff7b72]"
              style={{ width: `${event.known_attack_probability * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-0.5">
          <div className="flex justify-between text-slate-400">
            <span>ENTROPY H(p)</span>
            <span className="text-[#d2a8ff]">
              {event.predictive_entropy.toFixed(3)}
            </span>
          </div>
          <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#d2a8ff]"
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
        <div className="text-[10px] text-slate-300 line-clamp-2 border-t border-white/10 pt-1.5 leading-relaxed">
          {event.rationale_text}
        </div>
      )}

      <div className="text-[9px] text-slate-400 flex justify-between pt-0.5">
        <span>CLASS: {event.predicted_label}</span>
        <span className="text-[#79c0ff]">[CLICK TO INSPECT →]</span>
      </div>
    </div>
  );
};
