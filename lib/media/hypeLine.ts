// 16 animated bars centred on the 1280x720 frame, like a live equaliser.
// Bar width 20px, gap 14px → total span 530px → starts at x=375.
// Colors cycle: teal → mint → red → gold (site palette).
//
// FFmpeg's drawbox filter only evaluates its x/y/w/h expressions once at
// filter init, not per output frame — a symbolic `t` in those expressions
// parses fine but never advances past its t=0 value (confirmed empirically:
// identical frames at t=0 and t=20s). So instead of a live symbolic filter,
// the animation is pre-rendered once into a looping alpha-channel video
// (scripts/generate-hype-line-loop.ts) and composited live via `overlay`,
// which only has to decode a small video rather than re-evaluate a 16-bar
// expression per pixel per frame (measured at ~0.2x real-time — too slow to
// stream live).
export const COLORS = ["0x33d6c5", "0x00c08b", "0xff3b30", "0xffe048"];

// [frequency, phase] pairs — prime-ish values so bars never sync up
export const BARS: [number, number][] = [
  [2.0, 0.0],
  [3.1, 0.4],
  [2.5, 0.8],
  [4.0, 1.2],
  [1.7, 1.6],
  [5.0, 0.3],
  [3.5, 0.7],
  [2.2, 1.1],
  [4.3, 1.5],
  [1.9, 0.2],
  [3.8, 0.6],
  [2.7, 1.0],
  [5.2, 1.4],
  [1.5, 0.9],
  [4.6, 0.5],
  [2.9, 1.3]
];

export const HYPE_LINE_FRAME_WIDTH = 1280;
export const HYPE_LINE_FRAME_HEIGHT = 720;
export const HYPE_LINE_BACKGROUND_COLOR = "0x11151f";

// Builds a drawbox filter chain with a literal numeric time baked in, for
// rendering a single animation frame offline (see generate-hype-line-loop.ts).
export function buildHypeLineFrameFilter(t: number): string {
  return BARS.map(([f, p], i) => {
    const x = 375 + i * 34;
    const color = COLORS[i % COLORS.length];
    const expr = Math.abs(Math.sin(f * t + p));
    const y = HYPE_LINE_FRAME_HEIGHT / 2 - 4 - expr * 65;
    const h = 8 + expr * 130;
    return `drawbox=x=${x}:y=${y.toFixed(3)}:w=20:h=${h.toFixed(3)}:color=${color}@1:t=fill`;
  }).join(",");
}

export const HYPE_LINE_LOOP_SECONDS = 20;
export const HYPE_LINE_LOOP_FPS = 30;
export const HYPE_LINE_LOOP_PATH = "public/media/hype-line-bars-loop.mov";
