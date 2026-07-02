// 16 animated bars centred on the 1280x720 frame.
// Each bar has a distinct oscillation frequency and phase so they move
// independently — like a live equaliser/waveform visualiser.
// Bar width 20px, gap 14px → total span 530px → starts at x=375.
// Colors cycle: teal → mint → red → gold (site palette).
const COLORS = ["0x33d6c5", "0x00c08b", "0xff3b30", "0xffe048"];

// [frequency, phase] pairs — prime-ish values so bars never sync up
const BARS: [number, number][] = [
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

export const HYPE_LINE_VIDEO_FILTER = BARS.map(([f, p], i) => {
  const x = 375 + i * 34;
  const color = COLORS[i % COLORS.length];
  const expr = `abs(sin(${f}*t+${p}))`;
  return `drawbox=x=${x}:y='ih/2-4-${expr}*65':w=20:h='8+${expr}*130':color=${color}@1:t=fill`;
}).join(",");

export const HYPE_LINE_VIDEO_INPUT = "color=c=0x11151f:s=1280x720:r=30";
