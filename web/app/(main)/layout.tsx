import { Suspense } from "react";
import TopBar, { Logo } from "@/components/TopBar";
import { api } from "@/lib/api";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const meta = await api("/meta/states");
  return (
    <>
      <Suspense fallback={<header className="topbar"><Logo /></header>}>
        <TopBar states={meta.states} zones={meta.zones} />
      </Suspense>
      <main>{children}</main>
    </>
  );
}
