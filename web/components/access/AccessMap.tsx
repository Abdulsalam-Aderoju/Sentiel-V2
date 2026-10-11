"use client";
import maplibregl from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Share of ward population beyond the main walking threshold (GeoJSON values are percentages, 0-100).
// Single-hue sequential blue, light -> dark = more people far from care (same reading rule as the national map).
const CLASSES: { min: number; label: string; color: string }[] = [
  { min: 0, label: "< 5%", color: "#dbeafe" },
  { min: 5, label: "5–15%", color: "#93c5fd" },
  { min: 15, label: "15–30%", color: "#3b82f6" },
  { min: 30, label: "30–50%", color: "#1d4ed8" },
  { min: 50, label: "≥ 50%", color: "#1e3a8a" },
];

type Layer = "wards" | "raster";

function bbox(fc: any): [number, number, number, number] {
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  const walk = (c: any) => {
    if (typeof c[0] === "number") { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]); }
    else c.forEach(walk);
  };
  fc.features.forEach((f: any) => walk(f.geometry.coordinates));
  return [x0, y0, x1, y1];
}

export default function AccessMap({ code, threshold, isolated, candidates, raster }: {
  code: string; threshold: number;
  isolated: { facility_id: string; name: string; latitude?: number; longitude?: number; catchment_pop: number; alt_walk_min: number | null }[];
  candidates: { rank: number; longitude: number; latitude: number; cell_population: number; walk_min: number; lga: string; ward: string }[];
  raster: { bounds: [[number, number], [number, number]]; classes: { label: string; color: string }[] } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();
  const [layer, setLayer] = useState<Layer>("wards");
  const [wards, setWards] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/state/${code}/access/wards.geojson`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((g) => live && setWards(g)).catch(() => live && setErr("Ward layer not available"));
    return () => { live = false; };
  }, [code]);

  useEffect(() => {
    if (!ref.current || !wards) return;
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.dataset.theme === "dark";
    const surface = dark ? "#111a2e" : "#ffffff";
    const ink = dark ? "#f1f5f9" : "#0f172a";
    const fill: any = ["step", ["coalesce", ["get", "pct_beyond_main"], 0], CLASSES[0].color,
      ...CLASSES.slice(1).flatMap((c) => [c.min, c.color])];
    const iso = { type: "FeatureCollection", features: isolated.filter((f) => f.longitude != null).map((f) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [f.longitude, f.latitude] }, properties: f })) };
    const cand = { type: "FeatureCollection", features: candidates.map((c) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [c.longitude, c.latitude] }, properties: { ...c, label: String(c.rank) } })) };
    const sources: any = { wards: { type: "geojson", data: wards }, iso: { type: "geojson", data: iso }, cand: { type: "geojson", data: cand } };
    if (raster) {
      const [[s, w], [n, e]] = raster.bounds;
      sources.tt = { type: "image", url: `/api/state/${code}/access/travel-time.png`, coordinates: [[w, n], [e, n], [e, s], [w, s]] };
    }
    const bounds = bbox(wards);
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources,
        layers: [
          { id: "bg", type: "background", paint: { "background-color": surface } },
          ...(raster ? [{ id: "tt", type: "raster", source: "tt", layout: { visibility: "none" }, paint: { "raster-opacity": 0.9, "raster-resampling": "nearest" } } as any] : []),
          { id: "ward-fill", type: "fill", source: "wards", paint: { "fill-color": fill, "fill-opacity": 0.85 } },
          { id: "ward-line", type: "line", source: "wards", paint: { "line-color": surface, "line-width": 0.6 } },
          { id: "iso", type: "circle", source: "iso", paint: { "circle-radius": 5, "circle-color": "#d97706", "circle-stroke-color": surface, "circle-stroke-width": 1.5 } },
          { id: "cand", type: "circle", source: "cand", paint: { "circle-radius": 10, "circle-color": surface, "circle-stroke-color": ink, "circle-stroke-width": 2 } },
        ],
      },
      bounds, fitBoundsOptions: { padding: 24 }, preserveDrawingBuffer: true,
      attributionControl: { customAttribution: "Population: WorldPop 2026 · Friction: MAP 2020 · Facilities & wards: GRID3" },
    });
    mapRef.current = map;
    // Rank numbers as HTML markers (no glyph server needed); pointer events pass through to the circle layer.
    const markers = candidates.map((c) => {
      const el = document.createElement("span");
      el.className = "cand-num";
      el.textContent = String(c.rank);
      el.style.color = ink;
      return new maplibregl.Marker({ element: el }).setLngLat([c.longitude, c.latitude]).addTo(map);
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const fit = () => { map.resize(); map.fitBounds(bounds, { padding: 24, animate: false }); };
    map.once("load", fit);
    const ro = new ResizeObserver(fit);
    ro.observe(ref.current);
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    const hover = (id: string, html: (p: any) => string) => {
      map.on("mousemove", id, (e) => {
        const p: any = e.features?.[0]?.properties;
        if (!p) return;
        if (id === "ward-fill" && map.queryRenderedFeatures(e.point, { layers: ["iso", "cand"] }).length) return;
        map.getCanvas().style.cursor = id === "iso" ? "pointer" : "";
        popup.setLngLat(e.lngLat).setHTML(html(p)).addTo(map);
      });
      map.on("mouseleave", id, () => { popup.remove(); map.getCanvas().style.cursor = ""; });
    };
    const n = (x: any) => Math.round(Number(x)).toLocaleString("en-GB");
    hover("ward-fill", (p) => `<strong>${p.ward}</strong> · ${p.lga}<br/>${n(p.pop_total)} people · ${Number(p.pct_beyond_main).toFixed(1)}% beyond ${threshold} min walk<br/>Mean walk ${Number(p.walk_mean_min).toFixed(0)} min · ${p.n_facilities} PHCs in ward`);
    hover("iso", (p) => `<strong>${p.name}</strong><br/>Isolated PHC · catchment ${n(p.catchment_pop)}<br/>${p.alt_walk_min && p.alt_walk_min !== "null" ? `Next PHC ${Number(p.alt_walk_min).toFixed(0)} min walk` : "No other PHC reachable on foot"}`);
    hover("cand", (p) => `<strong>Candidate area ${p.rank}</strong> · ${p.ward}, ${p.lga}<br/>${n(p.cell_population)} people in this 1 km cell · ${Number(p.walk_min).toFixed(0)} min walk`);
    map.on("click", "iso", (e) => {
      const p: any = e.features?.[0]?.properties;
      if (p) router.push(`/state/${code}/facility/${p.facility_id}`);
    });
    return () => { ro.disconnect(); markers.forEach((m) => m.remove()); map.remove(); mapRef.current = null; };
  }, [wards, code, isolated, candidates, raster, router, threshold]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("tt")) map.setLayoutProperty("tt", "visibility", layer === "raster" ? "visible" : "none");
      map.setLayoutProperty("ward-fill", "visibility", layer === "wards" ? "visible" : "none");
    };
    if (map.isStyleLoaded()) apply(); else map.once("load", apply);
  }, [layer, wards]);

  return (
    <div>
      <div className="seg" role="group" aria-label="Map layer" style={{ marginBottom: 8 }}>
        <button className={layer === "wards" ? "on" : ""} aria-pressed={layer === "wards"} onClick={() => setLayer("wards")}>Wards: share beyond {threshold} min</button>
        {raster && <button className={layer === "raster" ? "on" : ""} aria-pressed={layer === "raster"} onClick={() => setLayer("raster")}>Travel time (1 km)</button>}
      </div>
      {err ? <div className="empty">{err}</div> :
        <div ref={ref} className="map" role="img"
          aria-label={`Map of wards shaded by the share of people more than ${threshold} minutes' walk from a PHC, with isolated PHCs and candidate areas`} />}
      <div className="legend" style={{ marginTop: 8 }}>
        {layer === "wards" ? (
          <span>People beyond {threshold} min walk:
            {CLASSES.map((c) => <span key={c.label} style={{ marginLeft: 6 }}><i style={{ background: c.color }} />{c.label}</span>)}
          </span>
        ) : (
          <span>Walking time to the nearest PHC:
            {raster?.classes.map((c) => <span key={c.label} style={{ marginLeft: 6 }}><i style={{ background: c.color }} />{c.label}</span>)}
          </span>
        )}
        <span><i style={{ background: "#d97706", borderRadius: 99 }} />Isolated PHC (next PHC &gt; {threshold} min)</span>
        <span><i style={{ border: "2px solid currentColor", borderRadius: 99, width: 12, height: 12 }} />Numbered candidate area</span>
      </div>
    </div>
  );
}
