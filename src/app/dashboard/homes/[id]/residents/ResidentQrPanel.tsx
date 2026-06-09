"use client";

import {
  INVOICE_MODAL_CLOSE_BTN_CLASS,
  INVOICE_MODAL_PORTAL_SHELL_CLASS,
} from "@/app/dashboard/invoices/invoiceModalStyles";
import { QrCode } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  homeId: string;
  residentId: string;
  publicToken: string | null;
};

export function ResidentQrPanel({ homeId, residentId, publicToken }: Props) {
  const [open, setOpen] = useState(false);

  const publicPath = publicToken ? `/r/${publicToken}` : null;
  const publicUrl =
    publicPath && typeof window !== "undefined"
      ? `${window.location.origin}${publicPath}`
      : publicPath;
  const qrSrc = `/api/homes/${homeId}/residents/${residentId}/qr`;

  const handleDismiss = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, handleDismiss]);

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="village-btn-secondary"
      >
        QR code
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss QR code dialog"
                onClick={handleDismiss}
              />

              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="resident-qr-modal-title"
                className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
              >
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <section className="village-card overflow-hidden border-0 p-0 shadow-none">
                    <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex max-w-2xl gap-4">
                          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                            <QrCode size={22} aria-hidden strokeWidth={2.25} />
                          </div>

                          <div className="flex flex-col gap-1">
                            <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                              Public profile
                            </p>

                            <h2
                              id="resident-qr-modal-title"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              QR code
                            </h2>

                            <p className="text-sm leading-6 text-ink/65">
                              Scan to open this resident&apos;s public profile
                              page (name, photo, and placement details only).
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={INVOICE_MODAL_CLOSE_BTN_CLASS}
                          onClick={handleDismiss}
                        >
                          Close
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-5 p-5 sm:p-6">
                      {!publicToken ? (
                        <p className="text-sm text-ink/70">
                          This resident does not have a public profile link yet.
                          Run database migrations to generate one.
                        </p>
                      ) : (
                        <>
                          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                            <img
                              src={qrSrc}
                              alt={`QR code linking to ${publicPath}`}
                              className="h-44 w-44 shrink-0 rounded-2xl bg-white p-3 ring-1 ring-pine/15"
                              width={176}
                              height={176}
                            />

                            <div className="min-w-0 flex-1 space-y-4">
                              <label className="flex flex-col gap-2">
                                <span className="village-label">Public link</span>
                                <p className="break-all rounded-xl border border-pine/10 bg-cream/50 px-3 py-2.5 font-mono text-sm text-ink">
                                  {publicPath}
                                </p>
                              </label>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={copyLink}
                                  className="village-btn-secondary"
                                >
                                  Copy link
                                </button>
                                <a
                                  href={qrSrc}
                                  download={`resident-${residentId}-qr.png`}
                                  className="village-btn-secondary"
                                >
                                  Download QR
                                </a>
                                <a
                                  href={publicPath!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="village-btn-secondary"
                                >
                                  Preview page
                                </a>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
