import { getDb } from "@/db/client";
import { listPublicInterestHomes } from "@/lib/homeInterestLeads/service";
import type { Metadata } from "next";
import { InterestEnquiryForm } from "./InterestEnquiryForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register your interest",
  description: "Enquire about our retirement homes.",
};

export default function InterestPage() {
  const homes = listPublicInterestHomes(getDb());

  return (
    <main className="village-app-bg relative isolate min-h-screen overflow-hidden text-[var(--text-primary)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_-10%_-10%,color-mix(in_srgb,var(--accent)_20%,transparent),transparent_58%),radial-gradient(860px_420px_at_110%_0%,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_60%),radial-gradient(700px_400px_at_50%_115%,color-mix(in_srgb,var(--partner-green)_15%,transparent),transparent_52%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[68rem] flex-col justify-center px-5 py-10 sm:px-8 lg:px-11">
        <InterestEnquiryForm homes={homes} />
      </div>
    </main>
  );
}
