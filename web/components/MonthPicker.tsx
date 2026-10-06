"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { monthLabel } from "@/lib/api";

export default function MonthPicker({ months, value }: { months: string[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label className="secondary" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      Analysis month
      <select
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          p.set("month", e.target.value);
          router.push(`${path}?${p.toString()}`);
        }}
      >
        {[...months].reverse().map((m) => (
          <option key={m} value={m}>{monthLabel(m)}</option>
        ))}
      </select>
    </label>
  );
}
