"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={pending}
      className={[
        "rounded-lg border border-pine/30 bg-cream/80 px-3 py-1.5 text-sm font-semibold text-pine shadow-sm transition hover:border-terracotta/40 hover:text-terracotta disabled:opacity-60",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
