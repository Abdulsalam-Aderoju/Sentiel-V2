// Same-origin proxy so client components can call the API (whose address is internal in Docker).
import { NextRequest } from "next/server";

const API = process.env.API_URL || "http://localhost:8000";

async function forward(req: NextRequest, path: string[]) {
  const url = new URL(path.join("/"), API.endsWith("/") ? API : API + "/");
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  const init: RequestInit = { method: req.method, headers: { "content-type": "application/json" }, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();
  const res = await fetch(url, init);
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      ...(res.headers.get("content-disposition") ? { "content-disposition": res.headers.get("content-disposition")! } : {}),
    },
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(req, (await ctx.params).path);
}
