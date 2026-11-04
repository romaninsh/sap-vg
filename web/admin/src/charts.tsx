/** Small SVG charts. The data arrives shaped by the server's query tables; these only draw it. */

export function LineChart({ series, labels, height = 180, colors, width = 640 }: { series: { name: string; values: number[] }[]; labels: string[]; height?: number; colors: string[]; width?: number }) {
  const w = width, h = height, padL = 46, padB = 22, padT = 10;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => padL + (i * (w - padL - 10)) / Math.max(1, labels.length - 1);
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => max * f);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={series.map((s) => s.name).join(" vs ")}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - 10} y1={y(t)} y2={y(t)} stroke="#e5e8eb" />
          <text x={padL - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#8396a8">{axis(t)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % 2 === 0 || labels.length < 8) && <text key={l} x={x(i)} y={h - 6} fontSize="10" textAnchor="middle" fill="#8396a8">{l}</text>)}
      {series.map((s, si) => (
        <g key={s.name}>
          <polyline fill="none" stroke={colors[si]} strokeWidth="2.5" strokeLinejoin="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={colors[si]}><title>{`${s.name} ${labels[i]}: $${v.toLocaleString()}`}</title></circle>)}
        </g>
      ))}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="row" style={{ gap: 16, fontSize: 12 }}>
      {items.map((i) => <span key={i.name} className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: i.color }} />{i.name}</span>)}
    </div>
  );
}

export function Donut({ parts, size = 150 }: { parts: { label: string; value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = size / 2 - 12, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Share by category">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {parts.map((p) => {
          const len = (p.value / total) * c;
          const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth="20" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off}><title>{p.label}</title></circle>;
          off += len;
          return el;
        })}
      </g>
    </svg>
  );
}

/** pnl_by_month rows (long format, the server sorts them by month) → aligned labels and two series; a missing month is 0. */
export function pnlSeries(rows: readonly { label: string | null; series: string | null; dollars: number | null }[]) {
  const labels: string[] = [];
  const rev = new Map<string, number>(), cost = new Map<string, number>();
  for (const r of rows) {
    if (!r.label) continue;
    if (!labels.includes(r.label)) labels.push(r.label);
    (r.series === "Revenue" ? rev : cost).set(r.label, r.dollars ?? 0);
  }
  return { labels, revenue: labels.map((m) => rev.get(m) ?? 0), costs: labels.map((m) => cost.get(m) ?? 0) };
}
const axis = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);

export const PALETTE =["#0070f2", "#1ab394", "#e76500", "#7858ff", "#d20a0a", "#0090a6"];
