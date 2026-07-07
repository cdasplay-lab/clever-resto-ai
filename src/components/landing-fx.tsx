import { useEffect, useRef, useState } from "react";

/* ============================================================
   Landing page effects layer — zero external dependencies.
   - <AuroraCanvas/>: raw-WebGL warm liquid gradient, follows mouse
   - <LandingFX/>: custom cursor, magnetic buttons, scroll reveals
   - <LiveChatDemo/>: self-typing Iraqi-dialect order conversation
   All effects respect prefers-reduced-motion and are desktop-aware.
   ============================================================ */

const isReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

/* ---------------- Aurora shader (hero background) ---------------- */

const FRAG = `
precision highp float;
uniform float u_time;
uniform vec2  u_res;
uniform vec2  u_mouse;
uniform float u_vel;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), u.x),
             mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int k=0;k<4;k++){ v += a*noise(p); p *= 2.05; a *= 0.5; }
  return v;
}
void main(){
  float asp = u_res.x/u_res.y;
  vec2 uv = gl_FragCoord.xy/u_res.xy;
  vec2 p = uv; p.x *= asp;
  vec2 m = u_mouse; m.x *= asp;
  float t = u_time*0.08;

  vec2 q = vec2(fbm(p*1.5 + t), fbm(p*1.5 - t*0.7));
  float d = distance(p, m);
  vec2 warp = q*1.3 + (m - p) * exp(-d*2.8) * (0.5 + u_vel*2.5);
  float f  = fbm(p*2.0 + warp + vec2(0.0, t*1.4));
  float f2 = fbm(p*2.8 - warp*0.7 - vec2(t, 0.0));

  // Neon palette: pink, violet, cyan
  vec3 pink = vec3(1.00, 0.24, 0.51);
  vec3 vio  = vec3(0.545, 0.361, 0.965);
  vec3 cyan = vec3(0.302, 0.882, 1.00);

  vec3 col = vec3(0.0);
  col += pink * smoothstep(0.45, 0.90, f)  * 0.65;
  col += vio  * smoothstep(0.52, 0.95, f2) * 0.60;
  col += cyan * smoothstep(0.65, 1.00, fbm(p*3.5 + q*1.8 + t)) * 0.40;

  // Mouse glow, stronger with velocity
  col += mix(pink, cyan, uv.x) * exp(-d*3.4) * (0.28 + u_vel*1.3);

  // Fade toward bottom so it melts into the page
  float fade = smoothstep(0.0, 0.55, uv.y);
  // Alpha carries the shape; page background shows through
  float alpha = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * fade;
  gl_FragColor = vec4(col, alpha * 0.85);
}`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

export function AuroraCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isReduced()) return;
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uVel = gl.getUniformLocation(prog, "u_vel");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const dpr = Math.min(window.devicePixelRatio || 1, isTouch() ? 1 : 1.5);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    // Smoothed mouse + velocity (normalized to canvas)
    const M = { x: 0.5, y: 0.6, sx: 0.5, sy: 0.6, vel: 0 };
    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      M.x = (e.clientX - r.left) / r.width;
      M.y = 1 - (e.clientY - r.top) / r.height;
    };
    window.addEventListener("mousemove", onMove);

    let raf = 0;
    let running = false;
    let px = M.sx, py = M.sy;
    const loop = (t: number) => {
      M.sx += (M.x - M.sx) * 0.06;
      M.sy += (M.y - M.sy) * 0.06;
      const inst = Math.min(Math.hypot(M.sx - px, M.sy - py) * 22, 1.2);
      M.vel += (inst - M.vel) * 0.08;
      px = M.sx; py = M.sy;

      gl.uniform1f(uTime, t * 0.001);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, M.sx, M.sy);
      gl.uniform1f(uVel, M.vel);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
    const stop = () => { if (running) { running = false; cancelAnimationFrame(raf); } };

    // Only render while the hero canvas is on-screen — no wasted GPU frames after scroll.
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting && !document.hidden ? start() : stop()),
      { threshold: 0 }
    );
    io.observe(canvas);
    // Also pause on background tabs.
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (canvas.getBoundingClientRect().bottom > 0) start();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-70"
    />
  );
}

/* --------------- Cursor + magnetic + scroll reveals --------------- */

export function LandingFX() {
  useEffect(() => {
    if (isReduced()) return;

    const cleanups: Array<() => void> = [];

    /* Scroll reveals — auto-target section headers and cards */
    const targets = document.querySelectorAll(
      "section .rounded-2xl, section h2, section > div > div > p"
    );
    targets.forEach((el) => el.classList.add("fx-rv"));
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e, i) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.transitionDelay = `${(i % 4) * 70}ms`;
            e.target.classList.add("fx-in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 }
    );
    targets.forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    /* Kinetic strip reacts to scroll velocity — skews like a motion-graphics pass */
    const strip = document.querySelector<HTMLElement>(".fx-strip");
    if (strip) {
      let lastY = window.scrollY;
      let reset: ReturnType<typeof setTimeout> | undefined;
      const onSkew = () => {
        const dy = window.scrollY - lastY;
        lastY = window.scrollY;
        const sk = Math.max(-9, Math.min(9, dy * 0.3));
        strip.style.transition = "transform .12s ease-out";
        strip.style.transform = `skewX(${sk}deg)`;
        clearTimeout(reset);
        reset = setTimeout(() => {
          strip.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)";
          strip.style.transform = "skewX(0deg)";
        }, 100);
      };
      window.addEventListener("scroll", onSkew, { passive: true });
      cleanups.push(() => {
        clearTimeout(reset);
        window.removeEventListener("scroll", onSkew);
        strip.style.transform = "";
      });
    }

    if (!isTouch()) {
      /* Custom cursor */
      const dot = document.createElement("div");
      const ring = document.createElement("div");
      dot.className = "fx-dot";
      ring.className = "fx-ring";
      document.body.append(dot, ring);
      document.body.classList.add("fx-nocursor");

      let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
      const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
      window.addEventListener("mousemove", onMove);
      let raf = 0;
      const loop = () => {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        dot.style.transform = `translate(${mx}px,${my}px) translate(-50%,-50%)`;
        ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const hoverables = document.querySelectorAll("a, button, .rounded-2xl");
      const grow = () => ring.classList.add("fx-hover");
      const shrink = () => ring.classList.remove("fx-hover");
      hoverables.forEach((el) => {
        el.addEventListener("mouseenter", grow);
        el.addEventListener("mouseleave", shrink);
      });

      cleanups.push(() => {
        cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        hoverables.forEach((el) => {
          el.removeEventListener("mouseenter", grow);
          el.removeEventListener("mouseleave", shrink);
        });
        dot.remove();
        ring.remove();
        document.body.classList.remove("fx-nocursor");
      });

      /* Magnetic buttons (opt-in via [data-magnetic]) */
      document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((btn) => {
        const onBtnMove = (e: MouseEvent) => {
          const r = btn.getBoundingClientRect();
          const x = (e.clientX - r.left - r.width / 2) * 0.28;
          const y = (e.clientY - r.top - r.height / 2) * 0.38;
          btn.style.transform = `translate(${x}px,${y}px)`;
        };
        const onLeave = () => {
          btn.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)";
          btn.style.transform = "";
          setTimeout(() => (btn.style.transition = ""), 550);
        };
        btn.addEventListener("mousemove", onBtnMove);
        btn.addEventListener("mouseleave", onLeave);
        cleanups.push(() => {
          btn.removeEventListener("mousemove", onBtnMove);
          btn.removeEventListener("mouseleave", onLeave);
        });
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* Effect styles — scoped, tiny, no stylesheet changes needed */
  return (
    <style>{`
      .fx-rv{opacity:0;transform:translateY(28px);transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1)}
      .fx-in{opacity:1;transform:none}
      .fx-nocursor, .fx-nocursor a, .fx-nocursor button{cursor:none}
      .fx-dot,.fx-ring{position:fixed;top:0;left:0;z-index:100;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%)}
      .fx-dot{width:7px;height:7px;background:#F2A0FF;background:#4DE1FF}
      .fx-ring{width:36px;height:36px;border:1.5px solid rgba(255,61,129,.6);transition:width .25s,height .25s,background .25s}
      .fx-ring.fx-hover{width:60px;height:60px;background:rgba(255,61,129,.1)}
      @keyframes fx-rise{to{transform:translateY(0)}}
      .fx-w{display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 .06em}
      .fx-w>span{display:inline-block;transform:translateY(112%);animation:fx-rise .95s cubic-bezier(.2,.8,.2,1) forwards}
      @media (prefers-reduced-motion:reduce){
        .fx-rv{opacity:1;transform:none}
        .fx-w>span{transform:none;animation:none}
      }
    `}</style>
  );
}

/* ---------- Scroll-cinema: hero recedes like a camera pull-back ---------- */

export function HeroExit({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isReduced()) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = Math.min(window.scrollY / (window.innerHeight * 0.85), 1);
        el.style.transform = `translateY(${p * -46}px) scale(${1 - p * 0.1})`;
        el.style.opacity = `${1 - p * 0.85}`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={ref} style={{ willChange: "transform, opacity" }}>
      {children}
    </div>
  );
}

/* ---------- Scroll-cinema: pinned step-by-step scene ----------
   The section pins to the viewport and the four steps play like
   video frames as the user scrolls — scroll position is the timeline. */

type CinStep = { n: string; title: string; text: string; icon: React.ReactNode };

const STEP_HUES = ["#FF3D81", "#8B5CF6", "#4DE1FF", "#34D399"];

export function CinematicSteps({ steps }: { steps: CinStep[] }) {
  const [cinema, setCinema] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [local, setLocal] = useState(0); // progress inside the current step, 0..1

  // SSR, no-JS and reduced-motion all get the plain grid; the pinned scene
  // only activates client-side when motion is allowed.
  useEffect(() => {
    if (!isReduced()) setCinema(true);
  }, []);

  useEffect(() => {
    if (!cinema) return;
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        if (total <= 0) return;
        const p = Math.min(Math.max(-r.top / total, 0), 0.9999);
        const f = p * steps.length;
        setIdx(Math.floor(f));
        setLocal(f - Math.floor(f));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [cinema, steps.length]);

  if (!cinema) {
    return (
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className="relative rounded-2xl border p-6 pt-8"
            style={{ borderColor: "rgba(240,235,255,.09)", background: "#1A0F2E" }}
          >
            <div
              className="pointer-events-none absolute -top-5 left-4 text-5xl font-black"
              style={{ WebkitTextStroke: "1.5px rgba(255,61,129,.5)", color: "transparent" }}
            >
              {s.n}
            </div>
            <div
              className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "rgba(139,92,246,.14)", color: "#8B5CF6" }}
            >
              {s.icon}
            </div>
            <h3 className="text-base font-bold">{s.title}</h3>
            <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: "#9D93B8" }}>{s.text}</p>
          </div>
        ))}
      </div>
    );
  }

  const s = steps[idx];
  const hue = STEP_HUES[idx % STEP_HUES.length];

  return (
    <div ref={wrapRef} className="relative mt-4" style={{ height: `${steps.length * 85 + 100}vh` }}>
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-4">
        {/* per-step tinted backdrop */}
        <div
          className="pointer-events-none absolute inset-0 transition-all duration-700"
          style={{ background: `radial-gradient(720px 420px at 50% 42%, ${hue}26, transparent 70%)` }}
        />
        {/* ghost step number drifts with scroll like a parallax layer */}
        <div
          key={`n-${idx}`}
          className="cin-ghost pointer-events-none absolute select-none font-black"
          style={{
            fontSize: "clamp(180px, 42vmin, 420px)",
            WebkitTextStroke: `2px ${hue}59`,
            color: "transparent",
            transform: `translateY(${(local - 0.5) * -46}px)`,
          }}
          aria-hidden
        >
          {s.n.replace(/^٠/, "")}
        </div>
        {/* the current frame */}
        <div key={`c-${idx}`} className="cin-card relative z-[1] mx-auto max-w-xl text-center">
          <div
            className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border"
            style={{ background: `${hue}1f`, color: hue, borderColor: `${hue}40`, boxShadow: `0 0 44px ${hue}33` }}
          >
            {s.icon}
          </div>
          <h3 className="text-3xl font-black md:text-5xl">{s.title}</h3>
          <p className="mx-auto mt-4 max-w-md text-base font-light leading-loose md:text-lg" style={{ color: "#9D93B8" }}>
            {s.text}
          </p>
        </div>
        {/* timeline progress */}
        <div className="absolute bottom-10 z-[1] flex w-full max-w-xs items-center gap-2 px-6" dir="rtl">
          {steps.map((st, i) => (
            <div key={st.n} className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "rgba(240,235,255,.12)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: i < idx ? "100%" : i === idx ? `${Math.round(local * 100)}%` : "0%",
                  background: `linear-gradient(90deg, ${STEP_HUES[i % STEP_HUES.length]}, ${STEP_HUES[(i + 1) % STEP_HUES.length]})`,
                }}
              />
            </div>
          ))}
        </div>
        <style>{`
          @keyframes cin-up{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:none}}
          .cin-card{animation:cin-up .6s cubic-bezier(.2,.8,.2,1) both}
          @keyframes cin-fade{from{opacity:0}to{opacity:1}}
          .cin-ghost{animation:cin-fade .8s ease both}
        `}</style>
      </div>
    </div>
  );
}

/* Word-by-word headline reveal */
export function RevealWords({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} className="fx-w">
          <span style={{ animationDelay: `${delay + i * 0.1}s` }}>{w}</span>{" "}
        </span>
      ))}
    </>
  );
}

/* ------------------- Live self-typing chat demo ------------------- */

const CHAT_SCRIPT = [
  { who: "user" as const, t: "هلو، عندكم برياني؟", d: 1100 },
  { who: "bot" as const, t: "هلا بيك نورتنا 🌟 إي عدنا برياني دجاج بـ 7,000 وبرياني لحم بـ 9,000 دينار. شتحب أجهز لك؟", d: 1900 },
  { who: "user" as const, t: "اثنين برياني لحم ويه بيبسي بارد", d: 1600 },
  { who: "bot" as const, t: "تمام ✅ 2 برياني لحم + 2 بيبسي = 20,000 دينار. التوصيل لنفس عنوانك السابق؟", d: 2100 },
  { who: "user" as const, t: "إي عاشت ايدك", d: 1300 },
  { who: "bot" as const, t: "طلبك انطلق للمطبخ 👨‍🍳 يوصلك خلال 35 دقيقة 🛵 صحتين وعافية!", d: 2600 },
];

export function LiveChatDemo() {
  const [visible, setVisible] = useState(0); // messages currently shown
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((res) => timers.push(setTimeout(res, ms)));

    (async () => {
      await wait(1200);
      while (alive) {
        for (let i = 0; i < CHAT_SCRIPT.length && alive; i++) {
          const m = CHAT_SCRIPT[i];
          if (m.who === "bot") {
            setTyping(true);
            await wait(950);
            setTyping(false);
          } else {
            await wait(350);
          }
          if (!alive) break;
          setVisible(i + 1);
          await wait(m.d);
        }
        if (!alive) break;
        await wait(2400);
        setVisible(0);
      }
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0E0818] shadow-[0_30px_80px_rgba(0,0,0,.6),0_0_100px_rgba(139,92,246,.15)]"
      style={{ aspectRatio: "3 / 4" }}
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#FF3D81] to-[#8B5CF6] text-base">
          🍽️
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-[#F2EEFF]">مطعم بيت بغداد</div>
          <div className="text-[11px] text-emerald-500">● متصل — يرد خلال ثوانٍ</div>
        </div>
        <span className="mr-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-[#9D93B8]">
          ديمو حي
        </span>
      </div>
      {/* messages */}
      <div ref={bodyRef} className="flex h-[calc(100%-57px)] flex-col justify-end gap-2 overflow-hidden p-3">
        {CHAT_SCRIPT.slice(0, visible).map((m, i) => (
          <div
            key={`${i}-${m.t.slice(0, 8)}`}
            className={
              "max-w-[85%] animate-in fade-in slide-in-from-bottom-2 rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed duration-300 " +
              (m.who === "bot"
                ? "self-end rounded-bl-md bg-gradient-to-br from-[#FF3D81] to-[#8B5CF6] text-white"
                : "self-start rounded-br-md bg-[#251A3D] text-[#F2EEFF]")
            }
          >
            {m.t}
          </div>
        ))}
        {typing && (
          <div className="flex gap-1 self-end rounded-2xl rounded-bl-md bg-[#FF3D81]/15 px-4 py-3">
            <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF3D81] [animation-delay:0ms]" />
            <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF3D81] [animation-delay:150ms]" />
            <i className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#FF3D81] [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
