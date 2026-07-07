import { useEffect, useRef, useState } from "react";

/**
 * Global landing effects: subtle magnetic attraction for [data-magnetic]
 * elements and a soft pointer glow. Purely presentational, no state.
 */
export function LandingFX() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
    const cleanups: Array<() => void> = [];
    for (const el of els) {
      const onMove = (e: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * 0.15}px, ${y * 0.2}px)`;
      };
      const onLeave = () => {
        el.style.transform = "translate(0,0)";
      };
      el.addEventListener("mousemove", onMove);
      el.addEventListener("mouseleave", onLeave);
      el.style.transition = "transform .25s ease";
      cleanups.push(() => {
        el.removeEventListener("mousemove", onMove);
        el.removeEventListener("mouseleave", onLeave);
      });
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);
  return null;
}

/**
 * Animated aurora canvas — soft moving blobs on a dark background.
 */
export function AuroraCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = [
      { x: 0.25, y: 0.35, r: 320, c: "rgba(255,61,129,.35)", s: 0.0004 },
      { x: 0.75, y: 0.55, r: 380, c: "rgba(139,92,246,.35)", s: 0.0003 },
      { x: 0.5, y: 0.75, r: 300, c: "rgba(77,225,255,.28)", s: 0.0005 },
    ];

    const render = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const b of blobs) {
        const cx = (b.x + Math.sin(t * b.s) * 0.08) * w;
        const cy = (b.y + Math.cos(t * b.s * 0.9) * 0.08) * h;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r);
        g.addColorStop(0, b.c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden
    />
  );
}

/**
 * Reveal words one at a time with a soft rise + fade.
 */
export function RevealWords({ text, delay = 0 }: { text: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className="inline-flex flex-wrap justify-center gap-x-[.35em]">
      {words.map((w, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            animation: `fx-rise .7s cubic-bezier(.2,.8,.2,1) both`,
            animationDelay: `${delay + i * 0.09}s`,
          }}
        >
          {w}
        </span>
      ))}
      <style>{`
        @keyframes fx-rise{
          0%{opacity:0;transform:translateY(24px)}
          100%{opacity:1;transform:translateY(0)}
        }
      `}</style>
    </span>
  );
}

/**
 * Simple looping chat demo — customer/agent bubbles with typing indicator.
 */
type Bubble = { side: "user" | "bot"; text: string };
const SCRIPT: Bubble[] = [
  { side: "user", text: "هلو، اريد اثنين برياني دجاج بلا بصل" },
  { side: "bot", text: "أهلاً بيك 🌷 اثنين برياني دجاج بدون بصل — ٢٠٬٠٠٠ د.ع. تحب تضيف مشروب؟" },
  { side: "user", text: "اي زيدلي بيبسي كبير" },
  { side: "bot", text: "تمام ✅ بيبسي كبير أضيف. المجموع ٢٣٬٠٠٠. للعنوان: الكرادة، نفس محل السابق؟" },
  { side: "user", text: "اي نفسه" },
  { side: "bot", text: "انطلق الطلب 🚀 يوصل خلال ٣٥-٤٥ دقيقة. شكراً لك 🌟" },
];

export function LiveChatDemo() {
  const [visible, setVisible] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = async () => {
      while (!cancelled) {
        setVisible([]);
        for (const b of SCRIPT) {
          if (cancelled) return;
          if (b.side === "bot") {
            setTyping(true);
            await new Promise<void>((r) => timers.push(setTimeout(r, 900)));
            setTyping(false);
          } else {
            await new Promise<void>((r) => timers.push(setTimeout(r, 500)));
          }
          if (cancelled) return;
          setVisible((v) => [...v, b]);
          await new Promise<void>((r) => timers.push(setTimeout(r, 1200)));
        }
        await new Promise<void>((r) => timers.push(setTimeout(r, 2200)));
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      dir="rtl"
      className="rounded-[28px] border p-4 shadow-[0_20px_60px_rgba(0,0,0,.4)]"
      style={{
        borderColor: "rgba(240,235,255,.09)",
        background: "linear-gradient(180deg, #16092A, #0B0614)",
        minHeight: 460,
      }}
    >
      <div className="mb-3 flex items-center justify-between px-1 text-xs" style={{ color: "#9D93B8" }}>
        <span>محادثة مباشرة</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "#4DE1FF", boxShadow: "0 0 8px #4DE1FF" }} />
          متصل
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((b, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              b.side === "user" ? "self-start" : "self-end"
            }`}
            style={
              b.side === "user"
                ? { background: "rgba(240,235,255,.08)", color: "#F2EEFF" }
                : { background: "linear-gradient(135deg,#FF3D81,#8B5CF6)", color: "white" }
            }
          >
            {b.text}
          </div>
        ))}
        {typing && (
          <div
            className="self-end inline-flex items-center gap-1 rounded-2xl px-4 py-3"
            style={{ background: "rgba(139,92,246,.2)" }}
            aria-label="typing"
          >
            <Dot />
            <Dot delay={0.15} />
            <Dot delay={0.3} />
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-white/80"
      style={{
        animation: "fx-blink 1s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    >
      <style>{`
        @keyframes fx-blink{
          0%,100%{opacity:.3;transform:translateY(0)}
          50%{opacity:1;transform:translateY(-2px)}
        }
      `}</style>
    </span>
  );
}
