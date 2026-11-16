import { useEffect, useRef } from 'react';

type SmokeParticle = {
  stream: number;
  lane: number;
  progress: number;
  riseSpeed: number;
  phase: number;
  size: number;
  opacity: number;
  color: readonly [number, number, number];
};

const PARTICLE_COUNT = 70;
const FRAME_INTERVAL = 1000 / 24;
const PALETTE: readonly (readonly [number, number, number])[] = [
  [17, 120, 191],
  [14, 141, 194],
  [34, 92, 182],
  [88, 72, 166],
];

function seededValue(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createParticles(): SmokeParticle[] {
  const sourceLanes = [0.015, 0.17, 0.34, 0.52, 0.7, 0.87, 0.99];

  return Array.from({ length: PARTICLE_COUNT }, (_, index) => {
    const stream = index % sourceLanes.length;
    const lane = sourceLanes[stream] ?? 0.5;
    return {
      stream,
      lane: lane + (seededValue(index, 1) - 0.5) * 0.15,
      // Start with smoke at different heights, then keep replenishing from below.
      progress: seededValue(index, 2) * 1.32 - 0.16,
      riseSpeed: 0.007 + seededValue(index, 3) * 0.006,
      phase: seededValue(index, 4) * Math.PI * 2,
      size: 0.82 + seededValue(index, 5) * 0.72,
      opacity: 0.13 + seededValue(index, 6) * 0.09,
      color: PALETTE[Math.floor(seededValue(index, 7) * PALETTE.length)] ?? PALETTE[0]!,
    };
  });
}

function paintCloud(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  opacity: number,
  color: SmokeParticle['color'],
  angle: number,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.scale(radiusX, radiusY);

  const gradient = context.createRadialGradient(0, 0, 0.02, 0, 0, 1);
  const [red, green, blue] = color;
  gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${opacity})`);
  gradient.addColorStop(0.32, `rgba(${red}, ${green}, ${blue}, ${opacity * 0.76})`);
  gradient.addColorStop(0.7, `rgba(${red}, ${green}, ${blue}, ${opacity * 0.25})`);
  gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);

  context.fillStyle = gradient;
  context.fillRect(-1, -1, 2, 2);
  context.restore();
}

/** A low-resolution, code-rendered smoke field that slowly rises behind the shell. */
export function AtmosphericParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true });
    if (!canvas || !host || !context) return;

    const particles = createParticles();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrameAt = 0;
    let elapsed = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';

      for (const particle of particles) {
        const progress = particle.progress;
        const verticalPosition = 1.1 - progress;
        const phase = elapsed * 0.00028 + particle.phase;
        const streamPhase = particle.stream * 0.83;
        // Shared currents keep particles gathered into continuous, bending plumes.
        const broadWave = Math.sin(elapsed * 0.00017 + streamPhase + progress * 4.6) * 0.063;
        const returningCurl = Math.sin(elapsed * 0.00023 - streamPhase * 1.6 - progress * 7.2) * 0.031;
        const smallTurbulence = Math.sin(phase * 0.8 + progress * 10.4) * 0.014;
        const x = (particle.lane + broadWave + returningCurl + smallTurbulence) * width;
        const y = (verticalPosition + Math.sin(phase + progress * 5) * 0.012) * height;
        const fadeIn = Math.max(0, Math.min(1, progress / 0.16));
        const fadeOut = Math.max(0, Math.min(1, (1.28 - progress) / 0.24));
        const lifeOpacity = fadeIn * fadeOut;
        const billow = 1 + Math.sin(phase + progress * 5.2) * 0.18;
        const radiusX = width * 0.083 * particle.size * billow;
        const radiusY = height * 0.092 * particle.size * (1.12 - billow * 0.12);
        const angle = Math.sin(phase * 0.82 + progress * 3) * 0.35;

        paintCloud(context, x, y, radiusX, radiusY, particle.opacity * lifeOpacity, particle.color, angle);
        // A smaller offset lobe breaks up the soft ovals into fluid, changing wisps.
        paintCloud(
          context,
          x + Math.sin(phase * 0.7) * radiusX * 0.43,
          y - radiusY * 0.34,
          radiusX * 0.64,
          radiusY * 0.72,
          particle.opacity * lifeOpacity * 0.46,
          particle.color,
          angle - 0.28,
        );
      }

      context.globalCompositeOperation = 'source-over';
    };

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1, 1400 / width, 900 / height);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    };

    const stop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrameAt = 0;
    };

    const animate = (time: number) => {
      if (document.visibilityState !== 'visible' || reducedMotion.matches) {
        frameId = 0;
        return;
      }

      if (!lastFrameAt || time - lastFrameAt >= FRAME_INTERVAL) {
        const delta = lastFrameAt ? Math.min(time - lastFrameAt, 120) : 0;
        const seconds = delta / 1000;
        elapsed += delta;
        for (const particle of particles) {
          particle.progress += particle.riseSpeed * seconds;
          if (particle.progress > 1.3) {
            particle.progress = -0.12;
            particle.phase += 2.37;
          }
        }
        lastFrameAt = time;
        draw();
      }

      frameId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (document.visibilityState !== 'visible' || reducedMotion.matches || frameId) return;
      lastFrameAt = 0;
      frameId = requestAnimationFrame(animate);
    };

    const syncMotion = () => {
      stop();
      draw();
      start();
    };
    const syncVisibility = () => {
      if (document.visibilityState === 'visible') start();
      else stop();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    document.addEventListener('visibilitychange', syncVisibility);
    reducedMotion.addEventListener('change', syncMotion);
    start();

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
      reducedMotion.removeEventListener('change', syncMotion);
    };
  }, []);

  return <canvas ref={canvasRef} className="arcane-atmosphere-canvas" aria-hidden="true" />;
}
