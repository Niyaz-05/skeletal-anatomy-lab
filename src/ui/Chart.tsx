export interface Series { label: string; colour: string; values: readonly number[]; /** Its own y axis (right side) when the units differ. */ right?: boolean; dashed?: boolean }

/**
 * A small line chart (SVG): one or two y axes, an optional reference band, a cursor at the current
 * time and event marks. Accessible: the figure is described by `label`.
 */
export function LineChart({ series, xMax, xTicks, yLeft, yRight, band, cursor, marks, label, height = 120 }: {
  series: Series[];
  /** The x value of the last sample (the first is 0). */
  xMax: number;
  xTicks: { at: number; text: string }[];
  yLeft: { min: number; max: number; ticks: number[]; unit: string; log?: boolean };
  yRight?: { min: number; max: number; ticks: number[]; unit: string; log?: boolean };
  band?: { from: number; to: number; text?: string; right?: boolean };
  cursor?: number;
  marks?: { at: number; text: string }[];
  label: string;
  height?: number;
}) {
  const W = 280, H = height, x0 = 30, x1 = yRight ? W - 30 : W - 8, y0 = 10, y1 = H - 18;
  const sx = (x: number) => x0 + (x / xMax) * (x1 - x0);
  const scale = (ax: NonNullable<typeof yRight>) => (v: number) => {
    const f = ax.log ? (Math.log10(Math.max(v, ax.min)) - Math.log10(ax.min)) / (Math.log10(ax.max) - Math.log10(ax.min)) : (v - ax.min) / (ax.max - ax.min);
    return y1 - Math.max(0, Math.min(1, f)) * (y1 - y0);
  };
  const sl = scale(yLeft), sr = yRight ? scale(yRight) : sl;
  const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v >= 1 ? String(Math.round(v * 10) / 10) : String(v));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {band && <rect x={x0} x2={x1} width={x1 - x0} y={(band.right ? sr : sl)(band.to)} height={Math.max(1, (band.right ? sr : sl)(band.from) - (band.right ? sr : sl)(band.to))} fill="currentColor" opacity={0.08} />}
      {band?.text && <text x={x1 - 2} y={(band.right ? sr : sl)(band.to) + 8} fontSize="7" textAnchor="end" fill="currentColor" opacity={0.6}>{band.text}</text>}
      {yLeft.ticks.map((v) => <g key={`l${v}`}><line x1={x0} x2={x1} y1={sl(v)} y2={sl(v)} stroke="currentColor" strokeOpacity={0.1} /><text x={x0 - 3} y={sl(v) + 3} fontSize="7" textAnchor="end" fill="currentColor">{fmt(v)}</text></g>)}
      {yRight?.ticks.map((v) => <text key={`r${v}`} x={x1 + 3} y={sr(v) + 3} fontSize="7" fill="currentColor" opacity={0.8}>{fmt(v)}</text>)}
      <text x={x0} y={7} fontSize="7" fill="currentColor" opacity={0.7}>{yLeft.unit}</text>
      {yRight && <text x={x1} y={7} fontSize="7" textAnchor="end" fill="currentColor" opacity={0.7}>{yRight.unit}</text>}
      {xTicks.map((t) => <text key={t.at} x={sx(t.at)} y={H - 5} fontSize="7" textAnchor="middle" fill="currentColor">{t.text}</text>)}
      {marks?.map((m) => <g key={`${m.at}-${m.text}`}><line x1={sx(m.at)} x2={sx(m.at)} y1={y0} y2={y1} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 2" /><text x={sx(m.at) + 2} y={y0 + 7} fontSize="6.5" fill="currentColor" opacity={0.75}>{m.text}</text></g>)}
      {series.map((s) => {
        const sy = s.right ? sr : sl;
        const n = s.values.length;
        const d = s.values.map((v, i) => `${i ? 'L' : 'M'} ${sx((i / Math.max(1, n - 1)) * xMax).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
        return <path key={s.label} d={d} fill="none" stroke={s.colour} strokeWidth={1.6} strokeDasharray={s.dashed ? '3 2' : undefined} />;
      })}
      {cursor !== undefined && <line className="chart-cursor" x1={sx(cursor)} x2={sx(cursor)} y1={y0} y2={y1} stroke="currentColor" strokeWidth={1} />}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <p className="legend-row small">
      {items.map((i) => <span key={i.label}><span className="dot" aria-hidden="true" style={{ background: i.colour }} /> {i.label}</span>)}
    </p>
  );
}
