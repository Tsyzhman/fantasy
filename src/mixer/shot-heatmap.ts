export type ShotHeatPoint = {
  x: number;
  y: number;
  weight: number;
};

export type ShotHeatField = {
  cellSize: number;
  cellRadius: number;
  cells: Array<{ cx: number; cy: number; intensity: number }>;
};

export type ShotHeatFieldOptions = {
  /** Left edge of the pitch area inside the SVG viewport. */
  left: number;
  /** Top edge of the pitch area inside the SVG viewport. */
  top: number;
  width: number;
  height: number;
  cellSize?: number;
};

/**
 * Builds an xG-weighted kernel-density grid over the pitch for the heat-map
 * overlay. Points are splatted onto a coarse lattice with a soft circular
 * kernel; intensities are normalized against the loudest cell so a single
 * distant shot cannot wash out hot zones.
 */
export function buildShotHeatField(points: readonly ShotHeatPoint[], options: ShotHeatFieldOptions): ShotHeatField {
  const cellSize = options.cellSize ?? 12;
  const cols = Math.max(1, Math.ceil(options.width / cellSize));
  const rows = Math.max(1, Math.ceil(options.height / cellSize));
  const grid = new Float64Array(cols * rows);

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const col = Math.floor((point.x - options.left) / cellSize);
    const row = Math.floor((point.y - options.top) / cellSize);
    if (col < -2 || row < -2 || col > cols + 1 || row > rows + 1) continue;
    // Splat a small cross-shaped neighborhood so the blur pass produces a
    // smooth hill instead of a single-pixel spike.
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const targetCol = col + dc;
        const targetRow = row + dr;
        if (targetCol < 0 || targetRow < 0 || targetCol >= cols || targetRow >= rows) continue;
        const falloff = Math.exp(-(dc * dc + dr * dr) / 3);
        grid[targetRow * cols + targetCol] += point.weight * falloff;
      }
    }
  }

  let max = 0;
  for (let index = 0; index < grid.length; index += 1) max = Math.max(max, grid[index]);

  const cells: ShotHeatField["cells"] = [];
  if (max > 0) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const value = grid[row * cols + col];
        if (value <= 0) continue;
        const intensity = value / max;
        if (intensity < 0.04) continue;
        cells.push({
          cx: options.left + (col + 0.5) * cellSize,
          cy: options.top + (row + 0.5) * cellSize,
          intensity
        });
      }
    }
  }

  return { cellSize, cellRadius: cellSize * 1.35, cells };
}

/** Warm yellow -> orange -> red ramp tuned to stay readable on the green pitch. */
export function heatColor(intensity: number) {
  const clamped = Math.min(1, Math.max(0, intensity));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [253, 230, 138]],
    [0.55, [249, 115, 22]],
    [1, [220, 38, 38]]
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let index = 0; index < stops.length - 1; index += 1) {
    if (clamped >= stops[index][0] && clamped <= stops[index + 1][0]) {
      lower = stops[index];
      upper = stops[index + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const t = (clamped - lower[0]) / span;
  const rgb = lower[1].map((channel, index) => Math.round(channel + (upper[1][index] - channel) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
