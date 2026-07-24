import { useEffect, useRef } from "react";

import {
  BRIDGE_HEIGHT,
  BRIDGE_WIDTH,
  createBridgePixels,
  type BridgePixel,
} from "./bridgeGeometry";

type Particle = BridgePixel & {
  delay: number;
  drift: number;
  seed: number;
  startX: number;
  startY: number;
};

const CYCLE_SECONDS = 13;
const BRIDGE_PIXELS = createBridgePixels();
const COLORS = {
  dark: "#a93424",
  lit: "#ff7653",
  mid: "#dc4f35",
} as const;

function random(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function easeInCubic(value: number) {
  return value ** 3;
}

function createParticles(): Particle[] {
  return BRIDGE_PIXELS.map((pixel, index) => {
    const seed = index + 11;

    return {
      ...pixel,
      delay: random(seed * 2.31) * 0.18,
      drift: (random(seed * 7.73) - 0.5) * 16,
      seed,
      startX: random(seed * 4.17) * BRIDGE_WIDTH,
      startY: -12 - random(seed * 5.91) * 72,
    };
  });
}

function drawScene(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  particles: Particle[],
  elapsedSeconds: number,
  reducedMotion: boolean,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = Math.min(width / (BRIDGE_WIDTH + 18), height / 118);
  const originX = (width - BRIDGE_WIDTH * scale) / 2;
  const originY = Math.max(20, height * 0.1);
  const pixelSize = Math.max(1.35, scale * 0.76);
  const cycle = reducedMotion ? 0.62 : (elapsedSeconds % CYCLE_SECONDS) / CYCLE_SECONDS;

  context.clearRect(0, 0, width, height);

  const waterY = originY + (BRIDGE_HEIGHT - 4) * scale;
  const waterGradient = context.createLinearGradient(0, waterY, 0, height);
  waterGradient.addColorStop(0, "rgba(122, 178, 183, 0.08)");
  waterGradient.addColorStop(1, "rgba(122, 178, 183, 0)");
  context.fillStyle = waterGradient;
  context.fillRect(0, waterY, width, height - waterY);

  context.fillStyle = "rgba(183, 214, 212, 0.12)";
  context.fillRect(0, waterY, width, Math.max(1, scale * 0.22));

  for (const particle of particles) {
    const arrival = clamp((cycle - particle.delay) / 0.16);
    const settle = easeOutCubic(arrival);
    const scatter = easeInCubic(clamp((cycle - 0.76) / 0.18));
    const flutter =
      Math.sin(elapsedSeconds * 2.2 + particle.seed) * particle.drift * (1 - settle);

    let x = particle.startX + (particle.x - particle.startX) * settle + flutter;
    let y = particle.startY + (particle.y - particle.startY) * settle;
    let alpha = clamp(arrival * 1.4);

    if (!reducedMotion && scatter > 0) {
      x += (18 + random(particle.seed * 1.7) * 68) * scatter;
      y +=
        (random(particle.seed * 3.1) - 0.52) *
        (28 + random(particle.seed) * 42) *
        scatter;
      alpha *= 1 - scatter;
    }

    if (alpha <= 0.01) {
      continue;
    }

    context.globalAlpha = alpha;
    context.fillStyle = COLORS[particle.tone];
    context.fillRect(
      Math.round(originX + x * scale),
      Math.round(originY + y * scale),
      pixelSize,
      pixelSize,
    );
  }

  context.globalAlpha = 1;
}

export function GoldenGateScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const particles = createParticles();
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let animationFrame = 0;
    let startTime = performance.now() - 1800;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = canvas.getBoundingClientRect();
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const render = (now: number) => {
      drawScene(
        context,
        canvas,
        particles,
        (now - startTime) / 1000,
        reducedMotion,
      );

      if (!reducedMotion) {
        animationFrame = requestAnimationFrame(render);
      }
    };

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      cancelAnimationFrame(animationFrame);
      startTime = performance.now() - 1800;
      animationFrame = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
        return;
      }

      startTime = performance.now() - 1800;
      animationFrame = requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reducedMotion) {
        render(performance.now());
      }
    });

    resize();
    observer.observe(canvas);
    mediaQuery.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <div className="bridge-scene" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="fog fog-one" />
      <div className="fog fog-two" />
    </div>
  );
}
