"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

/**
 * GradientField: a live WebGL aurora that sits behind the whole app.
 *
 * A single fullscreen triangle runs a domain-warped fbm-noise fragment shader.
 * The palette is obsidian -> deep blue -> a rationed brand-cyan glow, with a
 * faint amber "threat" bloom that nods at the risk colors without ever getting
 * loud enough to fight foreground text. Darkened toward the top and vignetted at
 * the edges so headlines and glass panels stay legible on top of it.
 *
 * Respects prefers-reduced-motion: renders one static frame and stops, no rAF
 * loop. Pauses when the tab is hidden. Caps the device pixel ratio at 2 so it
 * stays cheap on retina laptops.
 */

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = uv;
    p.x *= uResolution.x / uResolution.y;
    p *= 1.6;

    float t = uTime * 0.045;

    // Two layers of domain warp for the slow liquid flow.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(
      fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.15 * t),
      fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.12 * t)
    );
    float f = fbm(p + 4.0 * r);

    // Cooler, more-cyan palette: obsidian -> deep blue -> teal -> brand cyan,
    // with a cool indigo instead of violet and a barely-there amber threat tint.
    vec3 obsidian = vec3(0.020, 0.027, 0.039);
    vec3 deep     = vec3(0.024, 0.110, 0.220);
    vec3 teal     = vec3(0.024, 0.388, 0.482);
    vec3 cyan     = vec3(0.000, 0.823, 1.000);
    vec3 indigo   = vec3(0.071, 0.165, 0.376);
    vec3 ember    = vec3(0.451, 0.137, 0.196);

    vec3 col = obsidian;
    col = mix(col, deep, smoothstep(-0.25, 0.70, f));
    col = mix(col, indigo, smoothstep(0.25, 0.95, length(r)) * 0.30);
    col = mix(col, teal, smoothstep(0.30, 0.82, f) * 0.58);
    col = mix(col, cyan, smoothstep(0.48, 1.00, f) * 0.52);   // brand glow, pushed
    col = mix(col, ember, smoothstep(0.64, 1.08, q.x) * 0.08); // faint threat hint

    // Soft cyan bloom pooling low-center, the aurora's bright heart.
    float bloom = smoothstep(0.85, 0.0, distance(uv, vec2(0.5, 0.30)));
    col += cyan * bloom * bloom * 0.20;

    // Gentle darken toward the very top so the nav reads cleanly.
    col *= mix(0.80, 1.08, uv.y);

    // Soft vignette at the edges.
    float d = distance(uv, vec2(0.5, 0.45));
    col *= smoothstep(1.35, 0.32, d);

    // Fine grain to kill banding and add texture.
    float g = hash2(uv * uResolution + t).x * 0.022;
    col += g;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function GradientField() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new Renderer({
      canvas,
      alpha: false,
      antialias: false,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    const gl = renderer.gl;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [gl.canvas.width, gl.canvas.height] },
      },
    });
    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      // Size against the viewport, not canvas.clientWidth: OGL's constructor
      // writes a 300x150 inline style, which would otherwise feed back in.
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h);
      // OGL pins inline px width/height; force the element to fill the viewport.
      canvas!.style.width = "100%";
      canvas!.style.height = "100%";
      program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height];
    }
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;

    function frame(time: number) {
      if (!running) return;
      program.uniforms.uTime.value = time * 0.001;
      renderer.render({ scene: mesh });
      raf = requestAnimationFrame(frame);
    }

    if (reduced) {
      // One static frame, no animation loop.
      program.uniforms.uTime.value = 12.0;
      renderer.render({ scene: mesh });
    } else {
      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (reduced) return;
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.remove();
      program.remove();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
