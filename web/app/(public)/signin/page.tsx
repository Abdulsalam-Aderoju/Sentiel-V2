import type { Metadata } from "next";
import SignIn from "@/components/SignIn";
import { api } from "@/lib/api";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ role?: string; state?: string; lga?: string; next?: string }> }) {
  const sp = await searchParams;
  const meta = await api("/meta/states");
  return <SignIn states={meta.states} zones={meta.zones} initial={sp} />;
}
