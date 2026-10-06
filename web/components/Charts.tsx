"use client";
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--text-muted)", fontSize: 11 }, tickLine: false };
const grid = { stroke: "var(--grid)", vertical: false };
const tip = {
  contentStyle: { background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-primary)" },
  labelStyle: { color: "var(--text-secondary)", fontWeight: 600 },
  cursor: { fill: "var(--surface-2)" },
};
const legend = { wrapperStyle: { fontSize: 12, color: "var(--text-secondary)" }, iconSize: 10 };
const short = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-GB", { month: "short", year: "2-digit" });
};

/** Queue sizes over time, stacked (status colours, 2px gaps via stroke). */
export function QueueTrend({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="analysis_month" tickFormatter={short} {...axis} interval={2} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} labelFormatter={short} />
        <Legend {...legend} />
        <Bar isAnimationActive={false} dataKey="action" name="Resource action" stackId="q" fill="var(--st-critical)" stroke="var(--surface-1)" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="verification" name="Data verification" stackId="q" fill="var(--st-warning)" stroke="var(--surface-1)" strokeWidth={1} />
        <Bar isAnimationActive={false} dataKey="monitor" name="Monitor" stackId="q" fill="var(--text-muted)" fillOpacity={0.45} stroke="var(--surface-1)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One indicator: reported value vs seasonal baseline. One axis, two series. */
export function ServiceChart({ rows, indicator, title }: { rows: any[]; indicator: string; title: string }) {
  const data = rows.filter((r) => r.indicator === indicator).map((r) => ({
    m: r.analysis_month, value: r.value, expected: r.expected, z: r.z,
  }));
  if (!data.length) return <div className="empty">No history</div>;
  return (
    <div>
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="m" tickFormatter={short} {...axis} interval={3} />
          <YAxis {...axis} />
          <Tooltip {...tip} labelFormatter={short}
            formatter={(v: any, n: any) => [v == null ? "not reported" : Math.round(v).toLocaleString(), n]} />
          <Legend {...legend} />
          <Line isAnimationActive={false} dataKey="expected" name="Expected (baseline)" stroke="var(--text-muted)" strokeWidth={2} dot={false} connectNulls />
          <Line isAnimationActive={false} dataKey="value" name="Reported" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const PRODUCTS: [string, string, string][] = [
  ["ACT_AL_ADULT", "ACT adult", "var(--series-1)"],
  ["ACT_AL_CHILD", "ACT child", "var(--series-2)"],
  ["RDT_MAL", "Malaria RDT", "var(--series-3)"],
];

/** Months of stock per NHLMIS period, with the policy minimum and emergency order point. */
export function CommodityChart({ rows, minMonths, eopMonths }: { rows: any[]; minMonths: number; eopMonths: number }) {
  const by: Record<string, any> = {};
  for (const r of rows) {
    const k = r.period_start;
    by[k] ??= { period: k };
    by[k][r.commodity_code] = r.amc > 0 ? Math.max(0, +(r.physical_stock / r.amc).toFixed(2)) : null;
  }
  const data = Object.values(by).slice(-9);
  if (!data.length) return <div className="empty">No NHLMIS reports on record</div>;
  const label = (p: string) => {
    const [y, m] = p.split("-").map(Number);
    const a = new Date(y, m - 1, 1), b = new Date(y, m, 1);
    return `${a.toLocaleString("en-GB", { month: "short" })}–${b.toLocaleString("en-GB", { month: "short" })} ${String(y).slice(2)}`;
  };
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid {...grid} />
        <XAxis dataKey="period" tickFormatter={label} {...axis} />
        <YAxis {...axis} label={{ value: "months of stock", angle: -90, position: "insideLeft", offset: 18, fill: "var(--text-muted)", fontSize: 11 }} />
        <Tooltip {...tip} labelFormatter={label} formatter={(v: any, n: any) => [v == null ? "n/a" : `${v} months`, n]} />
        <Legend {...legend} />
        <ReferenceLine y={minMonths} stroke="var(--st-warning)" strokeDasharray="4 3" label={{ value: `${minMonths}-month minimum`, fill: "var(--text-muted)", fontSize: 10, position: "insideTopLeft" }} />
        <ReferenceLine y={eopMonths} stroke="var(--st-critical)" strokeDasharray="4 3" label={{ value: "emergency order point", fill: "var(--text-muted)", fontSize: 10, position: "insideBottomLeft" }} />
        {PRODUCTS.map(([k, n, c]) => (
          <Bar isAnimationActive={false} key={k} dataKey={k} name={n} fill={c} radius={[4, 4, 0, 0]} maxBarSize={18}>
            {/* A zero-height bar is invisible: mark stocked-out periods explicitly. */}
            <LabelList dataKey={k} position="top" fill="var(--st-critical)" fontSize={10} fontWeight={700}
              formatter={(v: any) => (v === 0 ? "0" : "")} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
