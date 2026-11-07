import type { ChartData, ChartPoint } from "./chart-data";

export type AllocationTile = { point: ChartPoint; index: number; x: number; y: number; width: number; height: number };
// Balanced partitioning uses approximate screen geometry; raw values remain exact.
export function allocationTiles(points: ChartPoint[], width = 900, height = 330): AllocationTile[] {
  const items = points.map((point, index) => ({ point, index })).filter(item => item.point.raw[0] > 0n).sort((a, b) => a.point.raw[0] === b.point.raw[0] ? a.point.fullLabel.localeCompare(b.point.fullLabel) : a.point.raw[0] > b.point.raw[0] ? -1 : 1);
  const result: AllocationTile[] = [];
  function split(group: typeof items, x: number, y: number, w: number, h: number) {
    if (!group.length) return;
    if (group.length === 1) { result.push({ ...group[0], x, y, width: w, height: h }); return; }
    const sum = group.reduce((sum, item) => sum + item.point.raw[0], 0n);
    let cut = 1, left = group[0].point.raw[0];
    while (cut < group.length - 1 && left + group[cut].point.raw[0] / 2n < sum / 2n) { left += group[cut].point.raw[0]; cut++; }
    const ratio = Number(left) / Number(sum);
    if (w >= h) { split(group.slice(0, cut), x, y, w * ratio, h); split(group.slice(cut), x + w * ratio, y, w * (1 - ratio), h); }
    else { split(group.slice(0, cut), x, y, w, h * ratio); split(group.slice(cut), x, y + h * ratio, w, h * (1 - ratio)); }
  }
  split(items, 0, 0, width, height);
  return result;
}

export function concentrationPoints(points: ChartPoint[]) {
  const ordered = points.map((point, index) => ({ point, index })).sort((a, b) => a.point.raw[0] === b.point.raw[0] ? a.point.fullLabel.localeCompare(b.point.fullLabel) : a.point.raw[0] > b.point.raw[0] ? -1 : 1);
  const sum = ordered.reduce((sum, item) => sum + item.point.raw[0], 0n);
  let cumulative = 0n;
  return ordered.map(item => { cumulative += item.point.raw[0]; return { ...item, cumulative, total: sum }; });
}

// Both sides use the same scale, so each ribbon conserves its exact record count.
export function relationshipFlow(data: ChartData, visible: number[], height = 370) {
  const sources = data.points.map((point, index) => ({ index, label: point.name, raw: visible.reduce((value, column) => value + (point.raw[column] ?? 0n), 0n) })).filter(node => node.raw > 0n);
  const targets = visible.map(index => ({ index, label: data.series[index].label, raw: data.points.reduce((value, point) => value + (point.raw[index] ?? 0n), 0n) })).filter(node => node.raw > 0n);
  const total = sources.reduce((value, node) => value + node.raw, 0n), gap = Math.max(sources.length, targets.length) >= 5 ? 34 : 18;
  const available = Math.max(1, height - 70 - Math.max(0, Math.max(sources.length, targets.length) - 1) * gap);
  const size = (raw: bigint) => total ? Number(raw * 1000000000n / total) / 1000000000 * available : 0;
  const position = (nodes: typeof sources) => {
    let y = 48 + (Math.max(sources.length, targets.length) - nodes.length) * gap / 2;
    return nodes.map(node => { const item = { ...node, y, height: size(node.raw) }; y += item.height + gap; return item; });
  };
  const left = position(sources), right = position(targets), sourceOffsets = new Map<number, number>(), targetOffsets = new Map<number, number>();
  const links = left.flatMap(source => right.flatMap(target => {
    const raw = data.points[source.index].raw[target.index] ?? 0n;
    if (raw <= 0n) return [];
    const y1 = source.y + (sourceOffsets.get(source.index) ?? 0), y2 = target.y + (targetOffsets.get(target.index) ?? 0), thickness = size(raw);
    sourceOffsets.set(source.index, (sourceOffsets.get(source.index) ?? 0) + thickness);
    targetOffsets.set(target.index, (targetOffsets.get(target.index) ?? 0) + thickness);
    return [{ source, target, raw, path: `M190,${y1} C390,${y1} 510,${y2} 710,${y2} L710,${y2 + thickness} C510,${y2 + thickness} 390,${y1 + thickness} 190,${y1 + thickness} Z` }];
  }));
  return { sources: left, targets: right, links, total };
}
