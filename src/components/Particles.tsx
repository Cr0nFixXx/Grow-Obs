import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";

interface Spore {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  glow: boolean;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Canvas-based floating "pollen/spore" field. GPU-light (transform-free draw),
 * pauses on hidden tabs, reduces density on small screens, and disables entirely
 * when the user prefers reduced motion. Re-reads the accent color on theme change.
 */
export function Particles({ className }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let parts: Spore[] = [];
    let color = "69,189,92";
    let raf = 0;
    let t = 0;

    const readColor = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
      const rgb = c ? hexToRgb(c) : null;
      if (rgb) color = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    };

    const spawn = (): Spore => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.7 + 0.5,
      vx: (Math.random() - 0.5) * 0.1,
      vy: -(Math.random() * 0.2 + 0.04),
      a: Math.random() * 0.4 + 0.08,
      glow: Math.random() < 0.14,
    });

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = Math.min(52, Math.max(14, Math.floor((w * h) / 28000)));
      parts = Array.from({ length: target }, spawn);
    };

    const tick = () => {
      t += 0.008;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx + Math.sin(t + p.y * 0.01) * 0.1;
        p.y += p.vy;
        if (p.y < -12) {
          p.y = h + 12;
          p.x = Math.random() * w;
        }
        if (p.x < -12) p.x = w + 12;
        else if (p.x > w + 12) p.x = -12;

        if (p.glow) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
          g.addColorStop(0, `rgba(${color},${p.a})`);
          g.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${color},${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };

    readColor();
    resize();
    tick();

    const mo = new MutationObserver(readColor);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [reduce]);

  return <canvas ref={ref} aria-hidden className={className} />;
}

/** Ambient backdrop: aurora gradients + grain overlay + spore field. */
export function Background() {
  const { particles } = useTheme();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ backgroundImage: "var(--aurora-1), var(--aurora-2)", backgroundRepeat: "no-repeat" }}
      />
      <div className="absolute inset-0 grain opacity-[0.05] mix-blend-soft-light" />
      {particles && <Particles className="absolute inset-0 h-full w-full" />}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-bg to-transparent" />
    </div>
  );
}
