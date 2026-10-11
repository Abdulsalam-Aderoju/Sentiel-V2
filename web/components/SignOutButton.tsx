"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/client";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button className="btn sm" onClick={() => { signOut(); router.push("/signin"); router.refresh(); }}
      title="Leave this portal and choose another">Switch portal</button>
  );
}
