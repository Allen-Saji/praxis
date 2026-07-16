import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const canvas = {
    width: 300,
    height: 150,
    style: { width: "", height: "" },
  };

  return {
    canvas,
    cleanup: null as null | (() => void),
    geometryRemove: vi.fn(),
    programRemove: vi.fn(),
    loseContext: vi.fn(),
  };
});

vi.mock("react", () => ({
  useRef: () => ({ current: mocks.canvas }),
  useEffect: (effect: () => void | (() => void)) => {
    mocks.cleanup = effect() ?? null;
  },
}));

vi.mock("ogl", () => ({
  Renderer: class {
    gl = {
      canvas: mocks.canvas,
      getExtension: vi.fn(() => ({ loseContext: mocks.loseContext })),
    };

    setSize = vi.fn();
    render = vi.fn();
  },
  Program: class {
    uniforms = {
      uTime: { value: 0 },
      uResolution: { value: [300, 150] },
    };

    remove = mocks.programRemove;
  },
  Triangle: class {
    remove = mocks.geometryRemove;
  },
  Mesh: class {},
}));

import { GradientField } from "./GradientField";

describe("GradientField cleanup", () => {
  beforeEach(() => {
    mocks.cleanup = null;
    mocks.geometryRemove.mockClear();
    mocks.programRemove.mockClear();
    mocks.loseContext.mockClear();

    vi.stubGlobal("window", {
      devicePixelRatio: 1,
      innerWidth: 1280,
      innerHeight: 720,
      matchMedia: vi.fn(() => ({ matches: false })),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("document", {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("releases GPU resources without losing the reusable canvas context", () => {
    GradientField();

    expect(mocks.cleanup).toBeTypeOf("function");
    mocks.cleanup?.();

    expect(mocks.geometryRemove).toHaveBeenCalledOnce();
    expect(mocks.programRemove).toHaveBeenCalledOnce();
    expect(mocks.loseContext).not.toHaveBeenCalled();
  });
});
