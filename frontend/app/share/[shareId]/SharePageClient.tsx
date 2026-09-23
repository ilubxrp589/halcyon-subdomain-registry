"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Copy,
  Check,
  Twitter,
  ExternalLink,
  Eye,
  Calendar,
  Sparkles,
  ArrowRight,
  Zap,
  Pickaxe,
} from "lucide-react";
import { toast } from "sonner";

interface SharePageClientProps {
  share: {
    imageUrl: string;
    domain: string;
    model: string;
    themes: string[];
    createdAt: string;
    views: number;
  };
  shareId: string;
}

// Glitch text component with anime-style effects
function GlitchText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`glitch-wrapper ${className}`}>
      <div className="glitch" data-text={text}>
        {text}
      </div>
    </div>
  );
}

// Animated letter-by-letter reveal
function AnimatedTitle({ text }: { text: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <h1 className="text-xl md:text-2xl font-bold tracking-tight">
      {text.split("").map((char, i) => (
        <span
          key={i}
          className={`inline-block neon-text ${mounted ? "animate-letter-pop" : "opacity-0"}`}
          style={{
            animationDelay: `${i * 50}ms`,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </h1>
  );
}

// ABSURD gravity particle canvas background
function GravityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const stateRef = useRef<{
    particles: Array<{
      x: number; y: number; vx: number; vy: number;
      radius: number; baseRadius: number; hue: number; alpha: number;
      pulseOffset: number; sparkle: boolean;
    }>;
    comets: Array<{
      x: number; y: number; vx: number; vy: number;
      hue: number; life: number; maxLife: number;
      trail: Array<{ x: number; y: number }>;
    }>;
    shockwaves: Array<{
      x: number; y: number; radius: number; maxRadius: number;
      hue: number; alpha: number;
    }>;
    explosions: Array<{
      x: number; y: number; particles: Array<{
        x: number; y: number; vx: number; vy: number;
        hue: number; life: number; radius: number;
      }>;
    }>;
    lightning: Array<{
      points: Array<{ x: number; y: number }>;
      hue: number; life: number;
    }>;
    nebulae: Array<{
      x: number; y: number; radius: number; hue: number;
      vx: number; vy: number; pulseOffset: number;
    }>;
    geometries: Array<{
      x: number; y: number; radius: number; sides: number;
      rotation: number; rotSpeed: number; hue: number; alpha: number;
    }>;
    wormholes: Array<{
      x: number; y: number; partnerIdx: number;
      hue: number; rotation: number; radius: number;
    }>;
    glitches: Array<{
      y: number; height: number; offset: number; life: number; hue: number;
    }>;
    tendrils: Array<{
      points: Array<{ x: number; y: number }>; hue: number;
      speed: number; phase: number; amplitude: number;
    }>;
    stars: Array<{
      x: number; y: number; brightness: number; size: number; twinkleSpeed: number; twinkleOffset: number;
    }>;
    scanY: number;
    subliminalPos: Array<{ x: number; y: number; wordIdx: number }>;
    mouseTrail: Array<{ x: number; y: number }>;
    matrixBack: Array<{
      x: number; y: number; speed: number; chars: string[];
      hue: number; length: number; ripple: number;
    }>;
    matrixMid: Array<{
      x: number; y: number; speed: number; chars: string[];
      hue: number; length: number; ripple: number;
    }>;
    matrixFront: Array<{
      x: number; y: number; speed: number; chars: string[];
      hue: number; length: number; ripple: number;
    }>;
    chainBolts: Array<{
      points: Array<{ x: number; y: number }>;
      branches: Array<Array<{ x: number; y: number }>>;
      life: number;
      maxLife: number;
      hue: number;
      alpha: number;
      fromMouse: boolean;
    }>;
  }>({ particles: [], comets: [], shockwaves: [], explosions: [], lightning: [], nebulae: [], geometries: [], wormholes: [], glitches: [], tendrils: [], stars: [], scanY: -50, subliminalPos: [], mouseTrail: [], matrixBack: [], matrixMid: [], matrixFront: [], chainBolts: [] });

  // Halcyon palette: cyan, purple, amber — with some spread
  const halcyonHue = () => {
    const palette = [180, 270, 35]; // cyan, purple, amber
    const base = palette[Math.floor(Math.random() * palette.length)];
    return (base + (Math.random() - 0.5) * 40 + 360) % 360; // ±20° spread
  };

  const init = useCallback((canvas: HTMLCanvasElement) => {
    const particles = [];
    const count = 300;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        baseRadius: Math.random() * 3 + 0.5,
        radius: 0,
        hue: halcyonHue(),
        alpha: Math.random() * 0.6 + 0.2,
        pulseOffset: Math.random() * Math.PI * 2,
        sparkle: Math.random() < 0.1,
      });
    }
    // Init nebula clouds
    const nebulae = [];
    for (let i = 0; i < 6; i++) {
      nebulae.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 80 + Math.random() * 150,
        hue: halcyonHue(),
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        pulseOffset: Math.random() * Math.PI * 2,
      });
    }
    // Init spinning sacred geometries
    const geometries = [];
    for (let i = 0; i < 4; i++) {
      geometries.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 40 + Math.random() * 80,
        sides: [3, 5, 6, 8][Math.floor(Math.random() * 4)],
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        hue: Math.random() * 360,
        alpha: 0.08 + Math.random() * 0.07,
      });
    }
    // Init wormhole portal pair
    const wormholes = [
      { x: canvas.width * 0.15, y: canvas.height * 0.3, partnerIdx: 1, hue: 270, rotation: 0, radius: 35 },
      { x: canvas.width * 0.85, y: canvas.height * 0.7, partnerIdx: 0, hue: 180, rotation: 0, radius: 35 },
    ];
    // Init plasma tendrils
    const tendrils = [];
    for (let i = 0; i < 5; i++) {
      const pts = [];
      const startX = Math.random() * canvas.width;
      const startY = Math.random() * canvas.height;
      for (let p = 0; p < 40; p++) {
        pts.push({ x: startX + p * 8, y: startY });
      }
      tendrils.push({
        points: pts, hue: Math.random() * 360,
        speed: 0.02 + Math.random() * 0.03,
        phase: Math.random() * Math.PI * 2,
        amplitude: 30 + Math.random() * 50,
      });
    }
    // Init star field
    const stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        brightness: 0.2 + Math.random() * 0.8,
        size: 0.3 + Math.random() * 1.5,
        twinkleSpeed: 0.01 + Math.random() * 0.04,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }
    // Init matrix crypto rain — 3 depth layers
    const cryptoSymbols = ['₿', 'Ξ', '◊', '₣', '⟠', 'Ⓗ', '⛓', '◈', '⬡', '△', '∞', '⊛', '☰', '♦', 'Ω', '0', '1', 'X', 'F', 'H', '#', '%', '&', '+', '=', '>', '<', '/', '|', '~'];
    const makeDrops = (count: number, speedMin: number, speedMax: number) => {
      const drops = [];
      for (let i = 0; i < count; i++) {
        const len = 5 + Math.floor(Math.random() * 12);
        const chars = [];
        for (let c = 0; c < len; c++) {
          chars.push(cryptoSymbols[Math.floor(Math.random() * cryptoSymbols.length)]);
        }
        drops.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height - canvas.height,
          speed: speedMin + Math.random() * (speedMax - speedMin),
          chars,
          hue: Math.random() * 360,
          length: len,
          ripple: 0,
        });
      }
      return drops;
    };
    const matrixBack = makeDrops(120, 0.4, 1.2);   // far back — slow, small
    const matrixMid = makeDrops(80, 1, 2.5);        // middle — medium
    const matrixFront = makeDrops(60, 2, 4);         // foreground — fast, large
    stateRef.current = { particles, comets: [], shockwaves: [], explosions: [], lightning: [], nebulae, geometries, wormholes, glitches: [], tendrils, stars, scanY: -50, subliminalPos: [], mouseTrail: [], matrixBack, matrixMid, matrixFront, chainBolts: [] };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent ? parent.clientWidth : window.innerWidth;
      canvas.height = parent ? parent.clientHeight : window.innerHeight;
      if (stateRef.current.particles.length === 0) init(canvas);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => { mouseRef.current = { x: -1, y: -1 }; };
    window.addEventListener('mousemove', onMouse);
    window.addEventListener('mouseleave', onLeave);

    // Gravity wells — more of them, moving faster
    const wells = [
      { angle: 0, dist: 0.25, mass: 200, speed: 0.005 },
      { angle: Math.PI, dist: 0.3, mass: 150, speed: -0.004 },
      { angle: Math.PI / 2, dist: 0.2, mass: 180, speed: 0.006 },
      { angle: Math.PI * 1.5, dist: 0.35, mass: 250, speed: -0.003 },
      { angle: Math.PI * 0.7, dist: 0.15, mass: 120, speed: 0.008 },
    ];

    let frame: number;
    let time = 0;
    let nextComet = 60;
    let nextShockwave = 200;
    let nextLightning = 40;

    const animate = () => {
      time += 1;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const state = stateRef.current;

      // Draw gradient background on canvas
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#030712');    // gray-950
      bgGrad.addColorStop(0.5, '#111827');  // gray-900
      bgGrad.addColorStop(1, '#000000');    // black
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      const mouse = mouseRef.current;

      // === STAR FIELD (deepest layer) ===
      for (const star of state.stars) {
        const twinkle = 0.5 + Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5;
        const alpha = star.brightness * twinkle;
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      }

      // === SUBLIMINAL FLOATING TEXT (invisible until scan line reveals them) ===
      {
        const words = [
          'HALCYON', 'FLARE', 'HANDSHAKE', 'FLR',
          'WEB3', 'NFT', 'DECENTRALIZED', 'BLOCKCHAIN', 'HNS',
        ];
        //                HALCYON  FLARE  HANDSHAKE  FLR   WEB3  NFT   DECENTR  BLOCKCHAIN  HNS
        const wordHues = [180,     25,    280,      20,   170,  310,  150,     210,        280];
        const wordSizes = [82, 72, 66, 68, 62, 76, 54, 58, 64];

        // Center exclusion zone (NFT card area)
        const cardW = Math.min(512, W * 0.9);
        const cardH = H * 0.75;
        const cardL = (W - cardW) / 2;
        const cardR = cardL + cardW;
        const cardT = (H - cardH) / 2;
        const cardB = cardT + cardH;
        const hitsCard = (x: number, y: number) =>
          x > cardL - 30 && x < cardR + 30 && y > cardT - 30 && y < cardB + 30;

        // Init positions on first frame (with overlap + card avoidance)
        if (state.subliminalPos.length === 0) {
          const pickCount = 4 + Math.floor(Math.random() * 4);
          const indices = Array.from({ length: words.length }, (_, i) => i);
          for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
          }
          for (let k = 0; k < pickCount; k++) {
            const wi = indices[k];
            const charW = wordSizes[wi] * 0.6;
            const ww = words[wi].length * charW;
            const wh = wordSizes[wi];
            let placed = false;
            for (let attempt = 0; attempt < 50; attempt++) {
              const nx = W * 0.05 + Math.random() * W * 0.9;
              const ny = H * 0.05 + Math.random() * H * 0.9;
              if (hitsCard(nx, ny)) continue;
              let overlaps = false;
              for (const existing of state.subliminalPos) {
                const ew = words[existing.wordIdx].length * (wordSizes[existing.wordIdx] * 0.6);
                const eh = wordSizes[existing.wordIdx];
                if (Math.abs(nx - existing.x) < (ww + ew) / 2 + 20 &&
                    Math.abs(ny - existing.y) < (wh + eh) / 2 + 10) {
                  overlaps = true;
                  break;
                }
              }
              if (!overlaps) {
                state.subliminalPos.push({ x: nx, y: ny, wordIdx: wi });
                placed = true;
                break;
              }
            }
            if (!placed) {
              state.subliminalPos.push({ x: W * 0.05 + Math.random() * W * 0.9, y: H * 0.05 + Math.random() * H * 0.9, wordIdx: wi });
            }
          }
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const revealRadius = 90;
        for (const wp of state.subliminalPos) {
          const scanDist = Math.abs(wp.y - state.scanY);
          if (scanDist > revealRadius) continue;

          const proximity = 1 - scanDist / revealRadius;
          const intensity = proximity * proximity * proximity;

          const wi = wp.wordIdx;
          const hue = wordHues[wi];
          const sz = wordSizes[wi];
          const isBrand = wi === 0 || wi === 1 || wi === 2 || wi === 3 || wi === 8; // HALCYON, FLARE, HANDSHAKE, FLR, HNS
          const boost = isBrand ? 2.2 : 1;
          ctx.font = `bold ${sz}px monospace`;

          if (isBrand) {
            const charW = sz * 0.6;
            const halfW = (words[wi].length * charW) / 2;

            // Horizontal scan streak extending from word
            const streakLen = 60 + intensity * 120;
            const streakAlpha = intensity * 0.12;
            const streakGrad = ctx.createLinearGradient(wp.x - halfW - streakLen, wp.y, wp.x - halfW, wp.y);
            streakGrad.addColorStop(0, 'transparent');
            streakGrad.addColorStop(1, `hsla(${hue}, 90%, 70%, ${streakAlpha})`);
            ctx.fillStyle = streakGrad;
            ctx.fillRect(wp.x - halfW - streakLen, wp.y - 1, streakLen, 2);
            const streakGradR = ctx.createLinearGradient(wp.x + halfW, wp.y, wp.x + halfW + streakLen, wp.y);
            streakGradR.addColorStop(0, `hsla(${hue}, 90%, 70%, ${streakAlpha})`);
            streakGradR.addColorStop(1, 'transparent');
            ctx.fillStyle = streakGradR;
            ctx.fillRect(wp.x + halfW, wp.y - 1, streakLen, 2);

            // Corner brackets framing the word
            const bPad = 8;
            const bLen = 14;
            const bAlpha = intensity * 0.35;
            ctx.strokeStyle = `hsla(${hue}, 80%, 75%, ${bAlpha})`;
            ctx.lineWidth = 1.5;
            // top-left
            ctx.beginPath();
            ctx.moveTo(wp.x - halfW - bPad, wp.y - sz * 0.4 - bPad + bLen);
            ctx.lineTo(wp.x - halfW - bPad, wp.y - sz * 0.4 - bPad);
            ctx.lineTo(wp.x - halfW - bPad + bLen, wp.y - sz * 0.4 - bPad);
            ctx.stroke();
            // top-right
            ctx.beginPath();
            ctx.moveTo(wp.x + halfW + bPad - bLen, wp.y - sz * 0.4 - bPad);
            ctx.lineTo(wp.x + halfW + bPad, wp.y - sz * 0.4 - bPad);
            ctx.lineTo(wp.x + halfW + bPad, wp.y - sz * 0.4 - bPad + bLen);
            ctx.stroke();
            // bottom-left
            ctx.beginPath();
            ctx.moveTo(wp.x - halfW - bPad, wp.y + sz * 0.4 + bPad - bLen);
            ctx.lineTo(wp.x - halfW - bPad, wp.y + sz * 0.4 + bPad);
            ctx.lineTo(wp.x - halfW - bPad + bLen, wp.y + sz * 0.4 + bPad);
            ctx.stroke();
            // bottom-right
            ctx.beginPath();
            ctx.moveTo(wp.x + halfW + bPad - bLen, wp.y + sz * 0.4 + bPad);
            ctx.lineTo(wp.x + halfW + bPad, wp.y + sz * 0.4 + bPad);
            ctx.lineTo(wp.x + halfW + bPad, wp.y + sz * 0.4 + bPad - bLen);
            ctx.stroke();
          }

          // Main fill (boosted for brand words)
          ctx.fillStyle = `hsla(${hue}, 60%, 55%, ${intensity * 0.22 * boost})`;
          ctx.fillText(words[wi], wp.x, wp.y);

          // Bright core
          ctx.fillStyle = `hsla(${hue}, 20%, 90%, ${intensity * 0.1 * boost})`;
          ctx.fillText(words[wi], wp.x, wp.y);
        }
        ctx.restore();
      }

      // Collect rain head positions for mouse chain lightning (layer: 0=back, 1=mid, 2=front)
      const rainHeads: Array<{ x: number; y: number; hue: number; layer: number }> = [];

      // === CRYPTO MATRIX RAIN (Back layer — far away, faded, behind everything) ===
      {
        const cryptoSymbolsBack = ['₿', 'Ξ', '◊', '₣', '⟠', 'Ⓗ', '⛓', '◈', '⬡', '△', '∞', '⊛', '☰', '♦', 'Ω', '0', '1', 'X', 'F', 'H', '#', '%', '&', '+', '=', '>', '<', '/', '|', '~'];
        ctx.save();
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        for (const drop of state.matrixBack) {
          drop.y += drop.speed;
          drop.hue = (drop.hue + 0.2) % 360;
          // Random ripple trigger
          if (drop.ripple <= 0 && Math.random() < 0.0002) drop.ripple = 1;
          if (drop.ripple > 0) drop.ripple -= 0.02;
          if (Math.random() < 0.06) {
            const idx = Math.floor(Math.random() * drop.chars.length);
            drop.chars[idx] = cryptoSymbolsBack[Math.floor(Math.random() * cryptoSymbolsBack.length)];
          }
          for (let c = 0; c < drop.chars.length; c++) {
            const cy2 = drop.y + c * 14;
            if (cy2 < 0 || cy2 > H) continue;
            const isHead = c === drop.chars.length - 1;
            const fade = 1 - (c / drop.chars.length);
            ctx.shadowBlur = 0;
            let sway = Math.sin(time * 0.025 + drop.x * 0.05 + c * 0.3) * 18;
            if (drop.ripple > 0) {
              const rippleWave = Math.sin(c * 0.8 - time * 0.15) * 25 * drop.ripple;
              sway += rippleWave;
            }
            ctx.fillStyle = isHead
              ? `hsla(${drop.hue}, 30%, 60%, 0.2)`
              : `hsla(${drop.hue}, 40%, 45%, ${fade * 0.12})`;
            ctx.fillText(drop.chars[c], drop.x + sway, cy2);
            if (isHead) rainHeads.push({ x: drop.x + sway, y: cy2, hue: drop.hue, layer: 0 });
          }
          if (drop.y - drop.chars.length * 14 > H) {
            drop.y = -drop.chars.length * 14;
            drop.x = Math.random() * W;
            drop.speed = 0.4 + Math.random() * 0.8;
            drop.hue = Math.random() * 360;
            drop.ripple = 0;
          }
        }
        ctx.restore();
      }

      // Spawn comets periodically
      nextComet--;
      if (nextComet <= 0) {
        const side = Math.floor(Math.random() * 4);
        let x = 0, y = 0, vx = 0, vy = 0;
        if (side === 0) { x = -10; y = Math.random() * H; vx = 6 + Math.random() * 4; vy = (Math.random() - 0.5) * 3; }
        else if (side === 1) { x = W + 10; y = Math.random() * H; vx = -(6 + Math.random() * 4); vy = (Math.random() - 0.5) * 3; }
        else if (side === 2) { x = Math.random() * W; y = -10; vy = 6 + Math.random() * 4; vx = (Math.random() - 0.5) * 3; }
        else { x = Math.random() * W; y = H + 10; vy = -(6 + Math.random() * 4); vx = (Math.random() - 0.5) * 3; }
        state.comets.push({ x, y, vx, vy, hue: [180, 270, 35][Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 30, life: 1, maxLife: 120 + Math.random() * 60, trail: [] });
        nextComet = 30 + Math.random() * 60;
      }


      // Spawn TONS of lightning bolts between random particles
      nextLightning--;
      if (nextLightning <= 0 && state.particles.length > 10) {
        // Spawn 1-2 bolts — less frequent, more dramatic
        const numBolts = 1 + Math.floor(Math.random() * 2);
        for (let b = 0; b < numBolts; b++) {
          const a = state.particles[Math.floor(Math.random() * state.particles.length)];
          const bp = state.particles[Math.floor(Math.random() * state.particles.length)];
          const dx = bp.x - a.x;
          const dy = bp.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 400 && dist > 20) {
            const points: Array<{ x: number; y: number }> = [{ x: a.x, y: a.y }];
            const segments = 8 + Math.floor(Math.random() * 8);
            for (let s = 1; s < segments; s++) {
              const frac = s / segments;
              points.push({
                x: a.x + dx * frac + (Math.random() - 0.5) * 60,
                y: a.y + dy * frac + (Math.random() - 0.5) * 60,
              });
            }
            points.push({ x: bp.x, y: bp.y });
            state.lightning.push({ points, hue: [180, 270, 35][Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 30, life: 1 });
          }
        }
        nextLightning = 15 + Math.random() * 30;
      }

      // Well positions
      const wellPositions = wells.map(w => ({
        x: cx + Math.cos(w.angle + time * w.speed) * w.dist * W,
        y: cy + Math.sin(w.angle + time * w.speed) * w.dist * H,
        mass: w.mass,
      }));

      // Slowly decay excess particles back toward 500
      if (state.particles.length > 300 && time % 10 === 0) {
        state.particles.splice(300, 1);
      }

      // (no mouse effect)

      // === UPDATE & DRAW PARTICLES ===
      for (const p of state.particles) {
        // Gentle hue drift (stays near its palette color)
        p.hue = (p.hue + 0.1) % 360;

        // Pulsing size
        p.radius = p.baseRadius + Math.sin(time * 0.05 + p.pulseOffset) * p.baseRadius * 0.5;

        // Firefly blink — random particles flare bright then dim
        let fireflyAlpha = p.alpha;
        if (p.sparkle && Math.sin(time * 0.08 + p.pulseOffset * 10) > 0.85) {
          fireflyAlpha = Math.min(1, p.alpha + 0.6);
          p.radius *= 2;
        }

        // Gentle repulsion from wells
        for (const well of wellPositions) {
          const dx = p.x - well.x;
          const dy = p.y - well.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          if (dist > 5 && dist < 200) {
            const force = (well.mass * 0.15) / (distSq + 2000);
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Gentle mouse repulsion on particles
        if (mouse.x >= 0) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          const dist = Math.sqrt(distSq);
          if (dist > 5 && dist < 120) {
            const force = 40 / (distSq + 800);
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        // Comet wake — comets push nearby particles
        for (const c of state.comets) {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 3600 && distSq > 100) { // ~60px range
            const dist = Math.sqrt(distSq);
            const force = 1.5 / (dist + 10);
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        p.vx *= 0.98;
        p.vy *= 0.98;
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 8) { p.vx = (p.vx / speed) * 8; p.vy = (p.vy / speed) * 8; }

        p.x += p.vx;
        p.y += p.vy;
        // Soft boundary — push particles back toward center near edges
        const margin = 50;
        const pull = 0.05;
        if (p.x < margin) p.vx += (margin - p.x) * pull;
        if (p.x > W - margin) p.vx -= (p.x - (W - margin)) * pull;
        if (p.y < margin) p.vy += (margin - p.y) * pull;
        if (p.y > H - margin) p.vy -= (p.y - (H - margin)) * pull;
        // Hard clamp — never leave the canvas
        p.x = Math.max(0, Math.min(W, p.x));
        p.y = Math.max(0, Math.min(H, p.y));

        // Scan line illumination — boost particles near the sweep
        const scanDist = Math.abs(p.y - state.scanY);
        const scanBoost = scanDist < 40 ? (1 - scanDist / 40) * 0.5 : 0;

        // Draw particle (with firefly flare) — no shadowBlur for perf
        const isFlaring = fireflyAlpha > p.alpha;
        const drawAlpha = Math.min(1, fireflyAlpha + scanBoost);
        const lightness = isFlaring ? 85 : (scanBoost > 0 ? 75 : 60);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * (1 + scanBoost * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${lightness}%, ${drawAlpha})`;
        ctx.fill();

        // Extra glow ring on flaring fireflies or scan-lit particles
        if (isFlaring || scanBoost > 0.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${isFlaring ? 0.15 : scanBoost * 0.2})`;
          ctx.fill();
        }
      }

      // === DRAW COMETS ===
      for (let i = state.comets.length - 1; i >= 0; i--) {
        const c = state.comets[i];
        c.trail.push({ x: c.x, y: c.y });
        if (c.trail.length > 30) c.trail.shift();
        c.x += c.vx;
        c.y += c.vy;
        c.life -= 1 / c.maxLife;

        if (c.life <= 0 || c.x < -50 || c.x > W + 50 || c.y < -50 || c.y > H + 50) {
          state.comets.splice(i, 1);
          continue;
        }

        // Draw comet trail
        for (let t = 0; t < c.trail.length; t++) {
          const frac = t / c.trail.length;
          ctx.beginPath();
          ctx.arc(c.trail[t].x, c.trail[t].y, 3 * frac, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${c.hue}, 100%, 70%, ${frac * c.life * 0.6})`;
          ctx.fill();
        }
        // Comet head
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${c.hue}, 100%, 90%, ${c.life})`;
        ctx.fill();
      }

      // === GRAVITY WELL GLOWS (rainbow pulsing) ===
      for (let wi = 0; wi < wellPositions.length; wi++) {
        const well = wellPositions[wi];
        const wellHue = (time * 2 + wi * 72) % 360;
        const pulseR = 60 + Math.sin(time * 0.03 + wi) * 20;
        const gradient = ctx.createRadialGradient(well.x, well.y, 0, well.x, well.y, pulseR);
        gradient.addColorStop(0, `hsla(${wellHue}, 100%, 60%, 0.15)`);
        gradient.addColorStop(1, `hsla(${wellHue}, 100%, 60%, 0)`);
        ctx.beginPath();
        ctx.arc(well.x, well.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // === CONNECTION LINES (check every 6th particle, skip sqrt with distSq) ===
      ctx.lineWidth = 0.5;
      for (let i = 0; i < state.particles.length; i += 6) {
        for (let j = i + 6; j < state.particles.length; j += 6) {
          const dx = state.particles[i].x - state.particles[j].x;
          const dy = state.particles[i].y - state.particles[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 4900) { // 70^2
            const avgHue = (state.particles[i].hue + state.particles[j].hue) / 2;
            ctx.globalAlpha = (1 - distSq / 4900) * 0.2;
            ctx.strokeStyle = `hsl(${avgHue}, 100%, 60%)`;
            ctx.beginPath();
            ctx.moveTo(state.particles[i].x, state.particles[i].y);
            ctx.lineTo(state.particles[j].x, state.particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;



      // === LIGHTNING BOLTS ===
      for (let i = state.lightning.length - 1; i >= 0; i--) {
        const bolt = state.lightning[i];
        bolt.life -= 0.08;
        if (bolt.life <= 0) { state.lightning.splice(i, 1); continue; }

        ctx.save();
        // Outer glow (no shadowBlur — just wide translucent line)
        ctx.strokeStyle = `hsla(${bolt.hue}, 100%, 70%, ${bolt.life * 0.3})`;
        ctx.lineWidth = 6 * bolt.life;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let p = 1; p < bolt.points.length; p++) {
          ctx.lineTo(bolt.points[p].x, bolt.points[p].y);
        }
        ctx.stroke();
        // Main bolt
        ctx.strokeStyle = `hsla(${bolt.hue}, 100%, 85%, ${bolt.life})`;
        ctx.lineWidth = 2.5 * bolt.life;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let p = 1; p < bolt.points.length; p++) {
          ctx.lineTo(bolt.points[p].x, bolt.points[p].y);
        }
        ctx.stroke();
        // White hot core
        ctx.strokeStyle = `hsla(${bolt.hue}, 20%, 97%, ${bolt.life * 0.9})`;
        ctx.lineWidth = 1 * bolt.life;
        ctx.beginPath();
        ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
        for (let p = 1; p < bolt.points.length; p++) {
          ctx.lineTo(bolt.points[p].x, bolt.points[p].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // === AURORA BOREALIS (wavy bands across the top) ===
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let band = 0; band < 3; band++) {
        const bandHue = (time * 0.5 + band * 120) % 360;
        const bandY = H * 0.1 + band * 40;
        ctx.beginPath();
        ctx.moveTo(0, bandY);
        for (let x = 0; x <= W; x += 10) {
          const y = bandY + Math.sin(x * 0.008 + time * 0.02 + band) * 30
                          + Math.sin(x * 0.015 + time * 0.01) * 15
                          + Math.cos(x * 0.005 - time * 0.015 + band * 2) * 20;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, bandY + 80);
        ctx.lineTo(0, bandY + 80);
        ctx.closePath();
        const auroraGrad = ctx.createLinearGradient(0, bandY - 30, 0, bandY + 80);
        auroraGrad.addColorStop(0, 'transparent');
        auroraGrad.addColorStop(0.3, `hsla(${bandHue}, 80%, 50%, 0.04)`);
        auroraGrad.addColorStop(0.6, `hsla(${(bandHue + 30) % 360}, 90%, 60%, 0.06)`);
        auroraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auroraGrad;
        ctx.fill();
      }
      ctx.restore();




      // === CRYPTO MATRIX RAIN (Mid layer — slight blur, medium size) ===
      const cryptoSymbols = ['₿', 'Ξ', '◊', '₣', '⟠', 'Ⓗ', '⛓', '◈', '⬡', '△', '∞', '⊛', '☰', '♦', 'Ω', '0', '1', 'X', 'F', 'H', '#', '%', '&', '+', '=', '>', '<', '/', '|', '~'];
      const drawMatrixLayer = (drops: typeof state.matrixMid, fontSize: number, maxAlpha: number, glowSize: number, spacing: number, speedMin: number, speedMax: number, bold: boolean, layerIdx: number) => {
        ctx.save();
        ctx.font = `${bold ? 'bold ' : ''}${fontSize}px monospace`;
        ctx.textAlign = 'center';
        if (layerIdx === 2) {
          ctx.shadowColor = 'hsla(200, 80%, 70%, 0.4)';
          ctx.shadowBlur = 3;
        }
        for (const drop of drops) {
          drop.y += drop.speed;
          drop.hue = (drop.hue + 0.3) % 360;
          // Random ripple trigger
          if (drop.ripple <= 0 && Math.random() < 0.0003) drop.ripple = 1;
          if (drop.ripple > 0) drop.ripple -= 0.018;
          if (Math.random() < 0.08) {
            const idx = Math.floor(Math.random() * drop.chars.length);
            drop.chars[idx] = cryptoSymbols[Math.floor(Math.random() * cryptoSymbols.length)];
          }
          for (let c = 0; c < drop.chars.length; c++) {
            const cy2 = drop.y + c * spacing;
            if (cy2 < 0 || cy2 > H) continue;
            const isHead = c === drop.chars.length - 1;
            const fade = 1 - (c / drop.chars.length);
            let sway = Math.sin(time * 0.025 + drop.x * 0.04 + c * 0.3) * (fontSize * 1.0);
            if (drop.ripple > 0) {
              const rippleWave = Math.sin(c * 0.7 - time * 0.18) * (fontSize * 2) * drop.ripple;
              sway += rippleWave;
            }
            ctx.fillStyle = isHead
              ? `hsla(${drop.hue}, 50%, 95%, ${maxAlpha})`
              : `hsla(${drop.hue}, 100%, 60%, ${fade * maxAlpha * 0.55})`;
            ctx.fillText(drop.chars[c], drop.x + sway, cy2);
            if (isHead) rainHeads.push({ x: drop.x + sway, y: cy2, hue: drop.hue, layer: layerIdx });
          }
          if (drop.y - drop.chars.length * spacing > H) {
            drop.y = -drop.chars.length * spacing;
            drop.x = Math.random() * W;
            drop.speed = speedMin + Math.random() * (speedMax - speedMin);
            drop.hue = Math.random() * 360;
            drop.ripple = 0;
          }
        }
        ctx.restore();
      };

      // Mid layer — medium size, muted colors (depth via lower saturation/alpha)
      drawMatrixLayer(state.matrixMid, 15, 0.4, 6, 18, 1, 2.5, false, 1);

      // Front layer — large, crisp, on top
      drawMatrixLayer(state.matrixFront, 22, 0.95, 20, 26, 2, 4, true, 2);

      // === MOUSE CHAIN LIGHTNING between rain columns (physics-based) ===
      if (mouse.x >= 0 && rainHeads.length > 0) {
        const chainRange = 900;
        const nearby: Array<{ x: number; y: number; hue: number; dist: number; layer: number }> = [];
        for (const h of rainHeads) {
          const dx = h.x - mouse.x;
          const dy = h.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < chainRange) {
            nearby.push({ ...h, dist });
          }
        }
        if (nearby.length >= 2) {
          nearby.sort((a, b) => a.dist - b.dist);
          const chain = nearby.slice(0, 10);

          // Layer brightness: back=0.3, mid=0.6, front=1.0
          const layerBright = [0.3, 0.6, 1.0];

          // --- Generate new bolts stochastically ---
          // Sparse connections — just a handful of ghostly threads
          const pairs: Array<[number, number]> = [];
          for (let i = 0; i < chain.length - 3; i += 3) pairs.push([i, i + 3]);
          for (let i = 0; i < chain.length; i += 5) {
            const j = Math.floor(Math.random() * chain.length);
            if (j !== i) pairs.push([i, j]);
          }
          if (chain.length > 0) pairs.push([-1, 0]);

          // Only spawn new bolts occasionally for temporal coherence
          const spawnChance = 0.35;
          for (const [ai, bi] of pairs) {
            if (Math.random() > spawnChance && state.chainBolts.length > 2) continue;
            const a = ai === -1 ? { x: mouse.x, y: mouse.y, hue: 180, dist: 0, layer: 2 } : chain[ai];
            const b = chain[bi];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const segDist = Math.sqrt(dx * dx + dy * dy);
            if (segDist < 3 || segDist > 800) continue;

            // Physics-based bolt path generation:
            // Use perpendicular displacement (like real electrical discharge)
            const segments = 6 + Math.floor(Math.random() * 5); // more segments = smoother
            const angle = Math.atan2(dy, dx);
            const perpX = -Math.sin(angle); // perpendicular direction
            const perpY = Math.cos(angle);
            const pts: Array<{ x: number; y: number }> = [{ x: a.x, y: a.y }];

            // Midpoint displacement method (diamond-square inspired)
            // Displacement magnitude decreases toward endpoints (natural taper)
            for (let s = 1; s < segments; s++) {
              const frac = s / segments;
              // Taper: max displacement at center, zero at endpoints
              const taper = Math.sin(frac * Math.PI);
              // Scale displacement by distance — longer bolts arc more
              const maxDisp = segDist * 0.15 * taper;
              // Biased random: slight preference for one side per bolt (coherent curve)
              const bias = (Math.random() - 0.5) * 0.3;
              const disp = (Math.random() - 0.5 + bias) * maxDisp;
              pts.push({
                x: a.x + dx * frac + perpX * disp,
                y: a.y + dy * frac + perpY * disp,
              });
            }
            pts.push({ x: b.x, y: b.y });

            // Generate fractal branches (sub-bolts fork off main path)
            const branches: Array<Array<{ x: number; y: number }>> = [];
            for (let p = 1; p < pts.length - 1; p++) {
              if (Math.random() < 0.3) { // 30% chance per midpoint
                const branchLen = segDist * (0.1 + Math.random() * 0.2);
                const branchAngle = angle + (Math.random() - 0.5) * Math.PI * 0.7;
                const branchSegs = 2 + Math.floor(Math.random() * 2);
                const bPts: Array<{ x: number; y: number }> = [{ x: pts[p].x, y: pts[p].y }];
                for (let bs = 1; bs <= branchSegs; bs++) {
                  const bf = bs / branchSegs;
                  const bTaper = 1 - bf; // taper to nothing at tip
                  bPts.push({
                    x: pts[p].x + Math.cos(branchAngle) * branchLen * bf + (Math.random() - 0.5) * branchLen * 0.15 * bTaper,
                    y: pts[p].y + Math.sin(branchAngle) * branchLen * bf + (Math.random() - 0.5) * branchLen * 0.15 * bTaper,
                  });
                }
                branches.push(bPts);
              }
            }

            const fadeFromMouse = 1 - (Math.min(a.dist, b.dist) / chainRange);
            const depthMul = Math.max(layerBright[a.layer] ?? 1, layerBright[b.layer] ?? 1);

            state.chainBolts.push({
              points: pts,
              branches,
              life: 1.0,
              maxLife: 8 + Math.floor(Math.random() * 12), // persist 8-20 frames
              hue: 200 + (Math.random() - 0.5) * 20,
              alpha: (0.3 + fadeFromMouse * 0.7) * depthMul,
              fromMouse: ai === -1,
            });
          }

          // --- Update and render persistent bolts ---
          ctx.save();
          ctx.globalCompositeOperation = 'screen';

          // Helper: draw a smooth path using quadratic bezier curves
          const drawSmoothPath = (pts: Array<{ x: number; y: number }>) => {
            if (pts.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 2) {
              ctx.lineTo(pts[1].x, pts[1].y);
            } else {
              // Quadratic bezier through midpoints for smooth curves
              for (let i = 0; i < pts.length - 1; i++) {
                const curr = pts[i];
                const next = pts[i + 1];
                if (i < pts.length - 2) {
                  const midX = (curr.x + next.x) / 2;
                  const midY = (curr.y + next.y) / 2;
                  ctx.quadraticCurveTo(curr.x, curr.y, midX, midY);
                } else {
                  ctx.quadraticCurveTo(curr.x, curr.y, next.x, next.y);
                }
              }
            }
            ctx.stroke();
          };

          for (let bi = state.chainBolts.length - 1; bi >= 0; bi--) {
            const bolt = state.chainBolts[bi];
            // Decay life
            bolt.life -= 1 / bolt.maxLife;
            if (bolt.life <= 0) {
              state.chainBolts.splice(bi, 1);
              continue;
            }

            // Fade alpha based on remaining life (ease-out curve)
            const lifeFade = bolt.life * bolt.life; // quadratic ease-out
            const ghostAlpha = bolt.alpha * lifeFade;

            // Slight jitter on interior points each frame (electrical flicker)
            for (let p = 1; p < bolt.points.length - 1; p++) {
              bolt.points[p].x += (Math.random() - 0.5) * 1.5;
              bolt.points[p].y += (Math.random() - 0.5) * 1.5;
            }

            // Top layer — thick, slightly hazy diffused glow
            ctx.shadowColor = `hsla(${bolt.hue}, 40%, 70%, ${ghostAlpha * 0.15})`;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = `hsla(${bolt.hue}, 20%, 75%, ${ghostAlpha * 0.09})`;
            ctx.lineWidth = 6;
            drawSmoothPath(bolt.points);
            ctx.shadowBlur = 0;

            // Middle layer — noticeably skinnier, clearer
            ctx.strokeStyle = `hsla(${bolt.hue}, 25%, 85%, ${ghostAlpha * 0.18})`;
            ctx.lineWidth = 1.8;
            drawSmoothPath(bolt.points);

            // Bottom layer — super skinny, ghostly bright filament
            ctx.strokeStyle = `hsla(${bolt.hue}, 10%, 97%, ${ghostAlpha * 0.35})`;
            ctx.lineWidth = 0.4;
            drawSmoothPath(bolt.points);

            // Draw branches with same 3-layer treatment but thinner
            for (const branch of bolt.branches) {
              const bAlpha = ghostAlpha * 0.5; // branches are dimmer

              ctx.shadowColor = `hsla(${bolt.hue}, 40%, 70%, ${bAlpha * 0.1})`;
              ctx.shadowBlur = 4;
              ctx.strokeStyle = `hsla(${bolt.hue}, 20%, 75%, ${bAlpha * 0.07})`;
              ctx.lineWidth = 3;
              drawSmoothPath(branch);
              ctx.shadowBlur = 0;

              ctx.strokeStyle = `hsla(${bolt.hue}, 25%, 85%, ${bAlpha * 0.14})`;
              ctx.lineWidth = 1;
              drawSmoothPath(branch);

              ctx.strokeStyle = `hsla(${bolt.hue}, 10%, 97%, ${bAlpha * 0.25})`;
              ctx.lineWidth = 0.3;
              drawSmoothPath(branch);
            }
          }

          // Cap bolt count to prevent unbounded growth
          if (state.chainBolts.length > 20) {
            state.chainBolts.splice(0, state.chainBolts.length - 20);
          }

          // Ghostly aura at mouse — soft ethereal fog
          const auraSize = 80 + Math.sin(time * 0.12) * 25;
          const auraGrad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, auraSize);
          auraGrad.addColorStop(0, `hsla(200, 5%, 90%, 0.035)`);
          auraGrad.addColorStop(0.4, `hsla(210, 5%, 85%, 0.02)`);
          auraGrad.addColorStop(0.7, `hsla(200, 3%, 80%, 0.008)`);
          auraGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, auraSize, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      // === HOLOGRAPHIC SCAN LINE ===
      state.scanY += 0.8;
      if (state.scanY > H + 50) {
        state.scanY = -50;
        // Pick random subset of words and scatter to random positions
        const allWordCount = 9;
        const pickCount = 4 + Math.floor(Math.random() * 4); // 4-7 words per sweep
        const indices = Array.from({ length: allWordCount }, (_, i) => i);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const picked = indices.slice(0, pickCount);
        const wordSizesRef = [82, 72, 66, 68, 62, 76, 54, 58, 64];
        const wordNamesRef = ['HALCYON','FLARE','HANDSHAKE','FLR','WEB3','NFT','DECENTRALIZED','BLOCKCHAIN','HNS'];
        // Center exclusion zone (NFT card area)
        const cW = Math.min(512, W * 0.9);
        const cH = H * 0.75;
        const cL = (W - cW) / 2;
        const cR = cL + cW;
        const cT = (H - cH) / 2;
        const cB = cT + cH;
        const hitsCardSweep = (x: number, y: number) =>
          x > cL - 30 && x < cR + 30 && y > cT - 30 && y < cB + 30;
        const pos: Array<{ x: number; y: number; wordIdx: number }> = [];
        for (const wi of picked) {
          const charW = wordSizesRef[wi] * 0.6;
          const wordW = wordNamesRef[wi].length * charW;
          const wordH = wordSizesRef[wi];
          let placed = false;
          for (let attempt = 0; attempt < 50; attempt++) {
            const nx = W * 0.05 + Math.random() * W * 0.9;
            const ny = H * 0.05 + Math.random() * H * 0.9;
            if (hitsCardSweep(nx, ny)) continue;
            let overlaps = false;
            for (const existing of pos) {
              const ew = wordNamesRef[existing.wordIdx].length * (wordSizesRef[existing.wordIdx] * 0.6);
              const eh = wordSizesRef[existing.wordIdx];
              if (Math.abs(nx - existing.x) < (wordW + ew) / 2 + 20 &&
                  Math.abs(ny - existing.y) < (wordH + eh) / 2 + 10) {
                overlaps = true;
                break;
              }
            }
            if (!overlaps) {
              pos.push({ x: nx, y: ny, wordIdx: wi });
              placed = true;
              break;
            }
          }
          if (!placed) {
            pos.push({ x: W * 0.05 + Math.random() * W * 0.9, y: H * 0.05 + Math.random() * H * 0.9, wordIdx: wi });
          }
        }
        state.subliminalPos = pos;
      }
      const scanHue = (time * 2) % 360;
      const scanGrad = ctx.createLinearGradient(0, state.scanY - 30, 0, state.scanY + 30);
      scanGrad.addColorStop(0, 'transparent');
      scanGrad.addColorStop(0.3, `hsla(${scanHue}, 100%, 70%, 0.03)`);
      scanGrad.addColorStop(0.5, `hsla(${scanHue}, 100%, 85%, 0.12)`);
      scanGrad.addColorStop(0.7, `hsla(${scanHue}, 100%, 70%, 0.03)`);
      scanGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, state.scanY - 30, W, 60);
      // Bright center line
      ctx.fillStyle = `hsla(${scanHue}, 50%, 95%, 0.15)`;
      ctx.fillRect(0, state.scanY - 0.5, W, 1);

      // === EDGE VIGNETTE (frames the center content) ===
      const vigRadius = Math.max(W, H) * 0.7;
      const vig = ctx.createRadialGradient(cx, cy, vigRadius * 0.4, cx, cy, vigRadius);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 w-full h-full"
    />
  );
}

export function SharePageClient({ share, shareId }: SharePageClientProps) {
  const [copying, setCopying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopying(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopying(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
      toast.error("Failed to copy link");
    }
  };

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`Check out this ${share.domain} NFT on Halcyon!`);
    const url = encodeURIComponent(shareUrl);
    const hashtags = encodeURIComponent("Halcyon,NFT,FlareNetwork,HNS");
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
      "_blank"
    );
  };

  const formattedDate = new Date(share.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      {/* Anime-style CSS */}
      <style jsx global>{`
        @keyframes letter-pop {
          0% {
            opacity: 0;
            transform: translateY(40px) scale(0.3) rotateX(90deg);
            filter: blur(10px);
          }
          50% {
            transform: translateY(-10px) scale(1.1);
            filter: blur(0);
          }
          70% {
            transform: translateY(5px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotateX(0deg);
            filter: blur(0);
          }
        }

        .animate-letter-pop {
          animation: letter-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .neon-text {
          color: #fff;
          text-shadow:
            0 0 5px #fff,
            0 0 10px #fff,
            0 0 20px #0ff,
            0 0 40px #0ff,
            0 0 60px #0ff,
            0 0 80px #0ff;
        }

        @keyframes neon-pulse {
          0%, 100% {
            text-shadow:
              0 0 5px #fff,
              0 0 10px #fff,
              0 0 20px #0ff,
              0 0 40px #0ff,
              0 0 60px #0ff,
              0 0 80px #0ff;
          }
          50% {
            text-shadow:
              0 0 2px #fff,
              0 0 5px #fff,
              0 0 10px #0ff,
              0 0 20px #0ff,
              0 0 30px #0ff,
              0 0 40px #0ff;
          }
        }

        .neon-pulse {
          animation: neon-pulse 2s ease-in-out infinite;
        }

        /* Glitch effect */
        .glitch-wrapper {
          position: relative;
        }

        .glitch {
          position: relative;
          color: #fff;
          font-weight: bold;
          text-shadow: 0 0 10px #0ff;
        }

        .glitch::before,
        .glitch::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .glitch::before {
          color: #ff00ff;
          animation: glitch-1 2s infinite linear alternate-reverse;
          clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
        }

        .glitch::after {
          color: #00ffff;
          animation: glitch-2 3s infinite linear alternate-reverse;
          clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
        }

        @keyframes glitch-1 {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-1px); }
          80% { transform: translateX(2px); }
        }

        @keyframes glitch-2 {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(3px); }
          40% { transform: translateX(-3px); }
          60% { transform: translateX(2px); }
          80% { transform: translateX(-1px); }
        }

        /* Floating animation */
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        /* Scan line effect */
        .scanlines {
          position: relative;
          overflow: hidden;
        }

        .scanlines::before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 255, 255, 0.03) 2px,
            rgba(0, 255, 255, 0.03) 4px
          );
          pointer-events: none;
          z-index: 10;
        }

        /* Card glow */
        .card-glow {
          box-shadow:
            0 0 20px rgba(0, 255, 255, 0.3),
            0 0 40px rgba(0, 255, 255, 0.1),
            inset 0 0 60px rgba(0, 255, 255, 0.05);
        }

        /* Cyber border animation */
        @keyframes border-flow {
          0%, 100% {
            border-color: #0ff;
            box-shadow: 0 0 10px #0ff, inset 0 0 10px rgba(0, 255, 255, 0.1);
          }
          33% {
            border-color: #f0f;
            box-shadow: 0 0 10px #f0f, inset 0 0 10px rgba(255, 0, 255, 0.1);
          }
          66% {
            border-color: #ff0;
            box-shadow: 0 0 10px #ff0, inset 0 0 10px rgba(255, 255, 0, 0.1);
          }
        }

        .cyber-border {
          animation: border-flow 4s linear infinite;
        }

        /* Button hover effects */
        .cyber-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .cyber-btn::before {
          content: "";
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.5s ease;
        }

        .cyber-btn:hover::before {
          left: 100%;
        }

        .cyber-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(0, 255, 255, 0.4);
        }

        /* Image container glow */
        .image-container {
          position: relative;
        }

        .image-container::after {
          content: "";
          position: absolute;
          inset: -2px;
          background: linear-gradient(45deg, #0ff, #f0f, #ff0, #0ff);
          background-size: 400% 400%;
          animation: gradient-border 3s ease infinite;
          z-index: -1;
          border-radius: inherit;
          filter: blur(10px);
          opacity: 0.7;
        }

        @keyframes gradient-border {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        /* Gravity canvas handles particles now */
      `}</style>

      <div className="h-screen bg-black relative overflow-hidden">
        {/* Gravity particle background */}
        {mounted && <GravityCanvas />}
        <div className="h-full flex flex-col items-center justify-center px-4 py-4 relative z-10 max-w-lg mx-auto">
          {/* Header */}
          <div className="text-center mb-3 shrink-0">
            <AnimatedTitle text={share.domain} />
            <p className={`text-cyan-400 text-sm mt-1 flex items-center justify-center gap-1.5 ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{ animationDelay: '0.5s' }}>
              <Zap className="h-4 w-4 animate-pulse" />
              <span className="neon-pulse">NFT Preview on Halcyon</span>
              <Zap className="h-4 w-4 animate-pulse" />
            </p>
          </div>

          {/* Main Card */}
          <div className={`scanlines rounded-xl overflow-hidden card-glow border-2 cyber-border bg-gray-900/80 backdrop-blur-xl w-full shrink min-h-0 flex flex-col ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{ animationDelay: '0.3s' }}>
            {/* Image Container */}
            <div className="image-container relative bg-black flex items-center justify-center overflow-hidden shrink min-h-0 aspect-square">
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                </div>
              )}
              <Image
                src={share.imageUrl}
                alt={`${share.domain} NFT`}
                fill
                className={`object-contain transition-all duration-500 ${
                  imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
                }`}
                onLoad={() => setImageLoaded(true)}
                priority
                unoptimized
              />

              {/* Corner decorations */}
              <div className="absolute top-2 left-2 w-5 h-5 border-l-2 border-t-2 border-cyan-400 opacity-60" />
              <div className="absolute top-2 right-2 w-5 h-5 border-r-2 border-t-2 border-cyan-400 opacity-60" />
              <div className="absolute bottom-2 left-2 w-5 h-5 border-l-2 border-b-2 border-cyan-400 opacity-60" />
              <div className="absolute bottom-2 right-2 w-5 h-5 border-r-2 border-b-2 border-cyan-400 opacity-60" />
            </div>

            {/* Info Section */}
            <div className="p-3 space-y-2 bg-gradient-to-b from-gray-900/50 to-gray-950 shrink-0">
              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                  <Eye className="h-3 w-3 text-cyan-400" />
                  <span className="text-cyan-300">{share.views.toLocaleString()}</span> views
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-gray-500" />
                  {formattedDate}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={copyToClipboard}
                  className="cyber-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/20 text-sm font-medium"
                >
                  {copying ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copying ? "Copied!" : "Copy"}
                </button>

                <button
                  onClick={shareOnTwitter}
                  className="cyber-btn flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/50 text-blue-300 hover:bg-blue-500/20 text-sm font-medium"
                >
                  <Twitter className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
          </div>

          {/* CTA + Footer */}
          <div className={`mt-3 text-center shrink-0 ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{ animationDelay: '0.6s' }}>
            <div className="flex items-center justify-center gap-2">
              <Link
                href="/register-v2"
                className="cyber-btn inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-yellow-500 text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-fuchsia-500/25"
              >
                Register Your Domain
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/stake"
                className="cyber-btn inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 text-white font-bold text-sm hover:opacity-90 transition-opacity shadow-lg shadow-orange-500/25"
              >
                <Pickaxe className="h-4 w-4" />
                Stake Handshake TLD
              </Link>
            </div>
            <div className="mt-2">
              <Link href="/" className="inline-flex items-center gap-1 text-gray-500 hover:text-cyan-400 transition-colors text-xs">
                <ExternalLink className="h-3 w-3" />
                Powered by Halcyon
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
