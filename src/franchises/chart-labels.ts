/** @spec spec://modules/franchises/FEAT-005-franchise-analytics#ui */
type Point = { id: string; name: string; x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

export function chartLabels(points: Point[], bounds: Bounds): Map<string, Box> {
  const placed: Box[] = [];
  const labels = new Map<string, Box>();
  const fits = (box: Box) =>
    box.x >= bounds.left &&
    box.x + box.w <= bounds.right &&
    box.y >= bounds.top &&
    box.y + box.h <= bounds.bottom &&
    !placed.some(
      (a) =>
        a.x < box.x + box.w + 4 &&
        a.x + a.w + 4 > box.x &&
        a.y < box.y + box.h + 4 &&
        a.y + a.h + 4 > box.y,
    ) &&
    !points.some(
      (p) =>
        Math.hypot(
          Math.max(box.x - p.x, 0, p.x - box.x - box.w),
          Math.max(box.y - p.y, 0, p.y - box.y - box.h),
        ) < 9,
    );
  for (const point of points) {
    const w = Math.min(bounds.right - bounds.left, point.name.length * 8 + 12);
    let chosen: Box | undefined;
    for (const gap of [10, 18, 28, 40]) {
      for (const [dx, dy] of [
        [gap, -7],
        [-w - gap, -7],
        [gap, -26],
        [-w - gap, -26],
        [gap, 12],
        [-w - gap, 12],
        [-w / 2, -30],
        [-w / 2, 16],
      ]) {
        const box = { x: point.x + dx, y: point.y + dy, w, h: 18 };
        if (fits(box)) {
          chosen = box;
          break;
        }
      }
      if (chosen) break;
    }
    // Search the whole plot when a dense cluster exhausts nearby positions.
    if (!chosen) {
      let distance = Infinity;
      for (let y = bounds.top; y + 18 <= bounds.bottom; y += 22) {
        for (let x = bounds.left; x + w <= bounds.right; x += 16) {
          const score = Math.hypot(x + w / 2 - point.x, y + 9 - point.y);
          if (score >= distance) continue;
          const box = { x, y, w, h: 18 };
          if (fits(box)) {
            chosen = box;
            distance = score;
          }
        }
      }
    }
    chosen ??= {
      x: Math.max(bounds.left, Math.min(bounds.right - w, point.x + 10)),
      y: Math.max(bounds.top, Math.min(bounds.bottom - 18, point.y - 20)),
      w,
      h: 18,
    };
    placed.push(chosen);
    labels.set(point.id, chosen);
  }
  return labels;
}
