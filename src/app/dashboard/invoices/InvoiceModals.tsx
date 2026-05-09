"use client";

import { ResidentCombobox } from "@/components/ResidentCombobox";
import { VillageSelect } from "@/components/VillageSelect";
import type { ResidentBillingAccountSummary } from "@/lib/billing/paymentsLifecycle";
import {
  DEFAULT_INVOICE_CATEGORY_OPTIONS,
  isMonthlyFeeCategory,
  type InvoiceCategoryOption,
} from "@/lib/billing/invoiceCategories";
import { PencilLine, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  INVOICE_MODAL_CLOSE_BTN_CLASS,
  INVOICE_MODAL_PORTAL_SHELL_CLASS,
  INVOICE_MODAL_PRIMARY_BTN_CLASS,
} from "./invoiceModalStyles";

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (typeof data === "object" && data && "error" in data) {
      const err = (data as { error?: unknown }).error;
      if (typeof err === "string") return err;
    }
  } catch {
    // ignore
  }
  return "Request failed.";
}

function buildCategoryOptions(
  customCategoryOptions: string[],
  selectedCategory: string,
): InvoiceCategoryOption[] {
  const byValue = new Map<string, InvoiceCategoryOption>();
  for (const option of DEFAULT_INVOICE_CATEGORY_OPTIONS) {
    byValue.set(option.value, option);
  }
  for (const value of customCategoryOptions) {
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (!byValue.has(trimmed)) {
      byValue.set(trimmed, { value: trimmed, label: trimmed });
    }
  }
  const selected = selectedCategory.trim();
  if (selected !== "" && !byValue.has(selected)) {
    byValue.set(selected, { value: selected, label: selected });
  }
  return Array.from(byValue.values());
}

function useBodyScrollLock(open: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onEscape]);
}

type HomePickerOption = { homeId: string; homeName: string };

type CreateDraftInvoiceModalProps = {
  open: boolean;
  homeId: string;
  homes: HomePickerOption[];
  accountTypeFilter: "resident" | "home";
  accounts: ResidentBillingAccountSummary[];
  disabled?: boolean;
  onClose: () => void;
  onCreated: (invoiceId: string, invoiceHomeId: string) => void;
};

export function CreateDraftInvoiceModal({
  open,
  homeId,
  homes,
  accountTypeFilter,
  accounts,
  disabled,
  onClose,
  onCreated,
}: CreateDraftInvoiceModalProps) {
  const [accountKind, setAccountKind] = useState<"resident" | "home">("resident");
  const [residentId, setResidentId] = useState<string | null>(null);
  const [targetHomeId, setTargetHomeId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountTypeSelectOptions = useMemo(
    () => [
      { value: "resident" as const, label: "Resident" },
      { value: "home" as const, label: "Home" },
    ],
    [],
  );

  const residentComboboxOptions = accounts.map((a) => ({
    value: a.residentId,
    label: a.fullName,
    hint: a.status === "departed" ? "Departed" : undefined,
  }));

  const homeComboboxOptions = homes.map((h) => ({
    value: h.homeId,
    label: h.homeName,
  }));

  const residentAccountId =
    residentId != null ? accounts.find((a) => a.residentId === residentId)?.accountId : null;

  const canSubmitResident = accountKind === "resident" && residentAccountId != null;
  const canSubmitHome =
    accountKind === "home" && targetHomeId != null && homes.some((h) => h.homeId === targetHomeId);

  const closeModal = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  useBodyScrollLock(open, closeModal);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      return;
    }
    setAccountKind(accountTypeFilter);
    setResidentId(null);
    setTargetHomeId(homeId);
  }, [open, accountTypeFilter, homeId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || disabled) return;
    if (accountKind === "resident") {
      if (!canSubmitResident || !residentAccountId) return;
    } else if (!canSubmitHome || !targetHomeId) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const postHomeId = accountKind === "home" ? targetHomeId! : homeId;
      const body =
        accountKind === "home"
          ? { billingAccountType: "home" as const, lineItems: [] as [] }
          : { accountId: residentAccountId!, lineItems: [] as [] };
      const res = await fetch(`/api/homes/${postHomeId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const data = (await res.json()) as { invoiceId: string };
      setResidentId(null);
      onCreated(data.invoiceId, postHomeId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
        aria-label="Dismiss new invoice dialog"
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-draft-create-heading"
        className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex max-w-2xl gap-4">
                  <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-lg font-display text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                    <Plus size={22} aria-hidden strokeWidth={2.25} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                      Billing
                    </p>
                    <h2 id="invoice-draft-create-heading" className="text-xl font-semibold tracking-tight text-pine-2">
                      New invoice
                    </h2>
                    <p className="text-sm leading-6 text-ink/65">
                      Start an empty draft. The invoice date is set automatically; add lines after you open
                      the invoice.
                    </p>
                  </div>
                </div>
                <button type="button" className={INVOICE_MODAL_CLOSE_BTN_CLASS} onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>
            <form id="invoice-draft-create-form" className="grid gap-5 p-5 sm:p-6" onSubmit={onSubmit}>
              <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-draft-account-type">
                <span className="village-label">Account type</span>
                <VillageSelect
                  id="invoice-draft-account-type"
                  value={accountKind}
                  onChange={(v) => {
                    const next = v === "home" ? "home" : "resident";
                    setAccountKind(next);
                    if (next === "home") {
                      setResidentId(null);
                      setTargetHomeId(homeId);
                    } else {
                      setTargetHomeId(null);
                    }
                  }}
                  options={accountTypeSelectOptions.map((o) => ({ value: o.value, label: o.label }))}
                />
              </label>
              {accountKind === "resident" ? (
                <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-draft-create-resident">
                  <span className="village-label">Resident</span>
                  <ResidentCombobox
                    id="invoice-draft-create-resident"
                    value={residentId}
                    onChange={setResidentId}
                    options={residentComboboxOptions}
                    placeholder="Search residents…"
                    ariaLabel="Resident for new invoice"
                  />
                </label>
              ) : (
                <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-draft-create-home">
                  <span className="village-label">Home</span>
                  <ResidentCombobox
                    id="invoice-draft-create-home"
                    value={targetHomeId}
                    onChange={setTargetHomeId}
                    options={homeComboboxOptions}
                    placeholder="Search homes…"
                    ariaLabel="Home for new invoice"
                  />
                </label>
              )}
              {error ? <p className="text-sm font-medium text-terracotta">{error}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  form="invoice-draft-create-form"
                  type="submit"
                  className={INVOICE_MODAL_PRIMARY_BTN_CLASS}
                  disabled={
                    submitting ||
                    disabled ||
                    (accountKind === "resident" ? !canSubmitResident : !canSubmitHome)
                  }
                >
                  {submitting ? "Creating…" : "Create draft"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type LineDraftSubmit = {
  category: string;
  description: string;
  amountMinor: number;
  serviceMonth: string | null;
};

type CreateInvoiceLineModalProps = {
  open: boolean;
  homeId: string;
  invoiceId: string;
  currencyCode: string;
  invoiceStatus: string;
  monthlyFeeAmountMinor: number | null;
  disabled?: boolean;
  onClose: () => void;
  onAdded: () => void;
};

export function CreateInvoiceLineModal({
  open,
  homeId,
  invoiceId,
  currencyCode,
  invoiceStatus,
  monthlyFeeAmountMinor,
  disabled,
  onClose,
  onAdded,
}: CreateInvoiceLineModalProps) {
  const [category, setCategory] = useState("monthly_fee");
  const [description, setDescription] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [serviceMonth, setServiceMonth] = useState("");
  const [customCategoryOptions, setCustomCategoryOptions] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const categoryOptions = useMemo(
    () => buildCategoryOptions(customCategoryOptions, category),
    [customCategoryOptions, category],
  );
  const monthlyFeeSelected = isMonthlyFeeCategory(category);

  const closeModal = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  useBodyScrollLock(open, closeModal);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setCategory("monthly_fee");
      setDescription("");
      setAmountDollars("");
      setServiceMonth("");
      setCustomCategoryOptions([]);
      setNewCategoryInput("");
      setShowAddCategory(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!monthlyFeeSelected) return;
    if (monthlyFeeAmountMinor == null) {
      setAmountDollars("");
      return;
    }
    setAmountDollars((monthlyFeeAmountMinor / 100).toFixed(2));
  }, [monthlyFeeAmountMinor, monthlyFeeSelected, open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invoiceStatus !== "draft" || submitting || disabled) return;
    const trimmedDesc = description.trim();
    const normalizedAmount = amountDollars.trim().replace(/,/g, "");
    const parsed = Number.parseFloat(normalizedAmount);
    const cents = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
    if (!trimmedDesc) {
      setError("Description is required.");
      return;
    }
    if (!monthlyFeeSelected && cents === null) {
      setError(`Enter a valid amount (${currencyCode}).`);
      return;
    }
    if (monthlyFeeSelected && monthlyFeeAmountMinor == null) {
      setError("Monthly fee is not configured for this resident ward.");
      return;
    }
    const month = monthlyFeeSelected
      ? serviceMonth.trim() || null
      : serviceMonth.trim() === ""
        ? null
        : serviceMonth.trim();

    if (monthlyFeeSelected) {
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        setError("monthly_fee lines need a service month (YYYY-MM).");
        return;
      }
    }

    const newLine: LineDraftSubmit = {
      category: category.trim(),
      description: trimmedDesc,
      amountMinor: monthlyFeeSelected ? (monthlyFeeAmountMinor ?? 0) : (cents ?? 0),
      serviceMonth: month,
    };

    setSubmitting(true);
    setError(null);
    try {
      const detailRes = await fetch(`/api/homes/${homeId}/invoices/${invoiceId}`);
      if (!detailRes.ok) {
        setError(await parseError(detailRes));
        return;
      }
      const detailJson = (await detailRes.json()) as {
        invoice?: {
          issuedOn?: string | null;
          lineItems?: {
            id: string;
            category: string;
            description: string;
            amountMinor: number;
            serviceMonth: string | null;
          }[];
        };
      };
      const inv = detailJson.invoice;
      if (!inv) {
        setError("Could not load invoice.");
        return;
      }
      const existing = Array.isArray(inv.lineItems) ? inv.lineItems : [];
      const lineItems = [
        ...existing.map((line) => ({
          id: line.id,
          category: line.category,
          description: line.description,
          amountMinor: line.amountMinor,
          serviceMonth: line.serviceMonth,
        })),
        {
          category: newLine.category,
          description: newLine.description,
          amountMinor: newLine.amountMinor,
          serviceMonth: newLine.serviceMonth,
        },
      ];

      const patchRes = await fetch(`/api/homes/${homeId}/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuedOn: inv.issuedOn ?? null,
          lineItems,
        }),
      });
      if (!patchRes.ok) {
        setError(await parseError(patchRes));
        return;
      }
      onAdded();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const readOnlyDraft = invoiceStatus !== "draft";

  function addCategoryFromInput() {
    const next = newCategoryInput.trim();
    if (next === "") return;
    setCustomCategoryOptions((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setCategory(next);
    setNewCategoryInput("");
    setShowAddCategory(false);
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
        aria-label="Dismiss add invoice line dialog"
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-line-create-heading"
        className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex max-w-2xl gap-4">
                  <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-lg font-display text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                    +
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                      Invoice line
                    </p>
                    <h2 id="invoice-line-create-heading" className="text-xl font-semibold tracking-tight text-pine-2">
                      Add line
                    </h2>
                    <p className="text-sm leading-6 text-ink/65">
                      Category, description, amount, and service month where needed.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                  <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-xs font-medium uppercase tracking-wide text-pine-2 shadow-sm">
                    {currencyCode}
                  </div>
                  <button type="button" className={INVOICE_MODAL_CLOSE_BTN_CLASS} onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            <form id="invoice-line-create-form" className="grid gap-5 p-5 sm:p-6" onSubmit={onSubmit}>
              {readOnlyDraft ? (
                <p className="text-sm text-[var(--text-secondary)]">Only draft invoices accept new lines.</p>
              ) : null}
              <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-line-category">
                <span className="village-label">Category</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    id="invoice-line-category"
                    className="village-input min-w-0"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={readOnlyDraft}
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="village-button border-[var(--line)] bg-transparent px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => setShowAddCategory((prev) => !prev)}
                    disabled={readOnlyDraft}
                  >
                    {showAddCategory ? "Cancel new category" : "Add category"}
                  </button>
                </div>
                {showAddCategory ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="village-input min-w-0"
                      placeholder="New category"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      disabled={readOnlyDraft}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="village-btn-secondary px-3 py-2 text-xs"
                      onClick={addCategoryFromInput}
                      disabled={readOnlyDraft || newCategoryInput.trim() === ""}
                    >
                      Save category
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-line-description">
                <span className="village-label">Description</span>
                <input
                  id="invoice-line-description"
                  className="village-input min-w-0"
                  placeholder="Shown on statements"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnlyDraft}
                  required
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-2" htmlFor="invoice-line-amount">
                  <span className="village-label">Amount</span>
                  <input
                    id="invoice-line-amount"
                    className="village-input min-w-0"
                    placeholder={
                      monthlyFeeSelected
                        ? `Fetched from resident ward (${currencyCode})`
                        : `e.g. 120.50 (${currencyCode})`
                    }
                    inputMode="decimal"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    disabled={readOnlyDraft || monthlyFeeSelected}
                    autoComplete="off"
                  />
                </label>
                <label className="flex min-w-[10rem] max-w-xs flex-1 flex-col gap-2" htmlFor="invoice-line-service-month">
                  <span className="village-label">Service month</span>
                  <input
                    id="invoice-line-service-month"
                    type="month"
                    className="village-input"
                    value={serviceMonth}
                    onChange={(e) => setServiceMonth(e.target.value)}
                    disabled={readOnlyDraft}
                  />
                </label>
              </div>
              <p className="-mt-3 text-xs text-ink/60">
                For category <span className="font-mono">monthly_fee</span>, choose a service month (YYYY-MM).
              </p>
              {monthlyFeeSelected ? (
                <p className="-mt-3 text-xs text-ink/60">
                  Monthly fee amount is auto-fetched from the resident ward rate.
                </p>
              ) : null}
              {error ? <p className="text-sm font-medium text-terracotta">{error}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  form="invoice-line-create-form"
                  type="submit"
                  className={INVOICE_MODAL_PRIMARY_BTN_CLASS}
                  disabled={submitting || readOnlyDraft || disabled}
                >
                  {submitting ? "Adding…" : "Add line"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type EditInvoiceLineModalProps = {
  open: boolean;
  line: {
    id: string;
    category: string;
    description: string;
    amountMinor: number;
    serviceMonth: string | null;
  } | null;
  homeId: string;
  invoiceId: string;
  currencyCode: string;
  invoiceStatus: string;
  monthlyFeeAmountMinor: number | null;
  disabled?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function EditInvoiceLineModal({
  open,
  line,
  homeId,
  invoiceId,
  currencyCode,
  invoiceStatus,
  monthlyFeeAmountMinor,
  disabled,
  onClose,
  onSaved,
}: EditInvoiceLineModalProps) {
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [serviceMonth, setServiceMonth] = useState("");
  const [customCategoryOptions, setCustomCategoryOptions] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const categoryOptions = useMemo(
    () => buildCategoryOptions(customCategoryOptions, category),
    [customCategoryOptions, category],
  );
  const monthlyFeeSelected = isMonthlyFeeCategory(category);

  const closeModal = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  useBodyScrollLock(open && line != null, closeModal);

  useEffect(() => {
    if (!open || !line) {
      setError(null);
      setSubmitting(false);
      setCustomCategoryOptions([]);
      setNewCategoryInput("");
      setShowAddCategory(false);
      return;
    }
    setCategory(line.category);
    setDescription(line.description);
    setAmountDollars(Number.isFinite(line.amountMinor / 100) ? (line.amountMinor / 100).toFixed(2) : "");
    setServiceMonth(line.serviceMonth ?? "");
  }, [open, line]);

  useEffect(() => {
    if (!open || !line) return;
    if (!monthlyFeeSelected) return;
    if (monthlyFeeAmountMinor == null) {
      setAmountDollars("");
      return;
    }
    setAmountDollars((monthlyFeeAmountMinor / 100).toFixed(2));
  }, [line, monthlyFeeAmountMinor, monthlyFeeSelected, open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!line || invoiceStatus !== "draft" || submitting || disabled) return;
    const trimmedDesc = description.trim();
    const normalizedAmount = amountDollars.trim().replace(/,/g, "");
    const parsed = Number.parseFloat(normalizedAmount);
    const cents = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
    if (!trimmedDesc) {
      setError("Description is required.");
      return;
    }
    if (!monthlyFeeSelected && cents === null) {
      setError(`Enter a valid amount (${currencyCode}).`);
      return;
    }
    if (monthlyFeeSelected && monthlyFeeAmountMinor == null) {
      setError("Monthly fee is not configured for this resident ward.");
      return;
    }
    const month = monthlyFeeSelected
      ? serviceMonth.trim() || null
      : serviceMonth.trim() === ""
        ? null
        : serviceMonth.trim();

    if (monthlyFeeSelected) {
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        setError("monthly_fee lines need a service month (YYYY-MM).");
        return;
      }
    }

    const updatedPayload: LineDraftSubmit = {
      category: category.trim(),
      description: trimmedDesc,
      amountMinor: monthlyFeeSelected ? (monthlyFeeAmountMinor ?? 0) : (cents ?? 0),
      serviceMonth: month,
    };

    setSubmitting(true);
    setError(null);
    try {
      const detailRes = await fetch(`/api/homes/${homeId}/invoices/${invoiceId}`);
      if (!detailRes.ok) {
        setError(await parseError(detailRes));
        return;
      }
      const detailJson = (await detailRes.json()) as {
        invoice?: {
          issuedOn?: string | null;
          lineItems?: {
            id: string;
            category: string;
            description: string;
            amountMinor: number;
            serviceMonth: string | null;
          }[];
        };
      };
      const inv = detailJson.invoice;
      if (!inv) {
        setError("Could not load invoice.");
        return;
      }
      const existing = Array.isArray(inv.lineItems) ? inv.lineItems : [];
      const lineItems = existing.map((row) =>
        row.id === line.id
          ? {
              id: line.id,
              category: updatedPayload.category,
              description: updatedPayload.description,
              amountMinor: updatedPayload.amountMinor,
              serviceMonth: updatedPayload.serviceMonth,
            }
          : {
              id: row.id,
              category: row.category,
              description: row.description,
              amountMinor: row.amountMinor,
              serviceMonth: row.serviceMonth,
            },
      );

      const patchRes = await fetch(`/api/homes/${homeId}/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuedOn: inv.issuedOn ?? null,
          lineItems,
        }),
      });
      if (!patchRes.ok) {
        setError(await parseError(patchRes));
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const readOnlyDraft = invoiceStatus !== "draft";

  function addCategoryFromInput() {
    const next = newCategoryInput.trim();
    if (next === "") return;
    setCustomCategoryOptions((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setCategory(next);
    setNewCategoryInput("");
    setShowAddCategory(false);
  }

  if (!open || !line) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
      <button
        type="button"
        className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
        aria-label="Dismiss edit invoice line dialog"
        onClick={closeModal}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-line-edit-heading"
        className={INVOICE_MODAL_PORTAL_SHELL_CLASS}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="village-card overflow-hidden border-0 p-0 shadow-none">
            <div className="border-b border-pine/10 bg-[linear-gradient(135deg,rgba(26,77,58,0.09),rgba(184,71,50,0.08)_48%,rgba(250,247,241,0.15))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex max-w-2xl gap-4">
                  <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-cream shadow-[0_14px_34px_-20px_rgba(26,77,58,0.8)]">
                    <PencilLine size={22} aria-hidden strokeWidth={2} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
                      Invoice line
                    </p>
                    <h2 id="invoice-line-edit-heading" className="text-xl font-semibold tracking-tight text-pine-2">
                      Edit line
                    </h2>
                    <p className="text-sm leading-6 text-ink/65">
                      Update category, description, amount, and service month.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                  <div className="rounded-2xl border border-pine/10 bg-cream/72 px-4 py-3 text-xs font-medium uppercase tracking-wide text-pine-2 shadow-sm">
                    {currencyCode}
                  </div>
                  <button type="button" className={INVOICE_MODAL_CLOSE_BTN_CLASS} onClick={closeModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            <form id="invoice-line-edit-form" className="grid gap-5 p-5 sm:p-6" onSubmit={onSubmit}>
              {readOnlyDraft ? (
                <p className="text-sm text-[var(--text-secondary)]">Only draft lines can be edited.</p>
              ) : null}
              <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-line-edit-category">
                <span className="village-label">Category</span>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    id="invoice-line-edit-category"
                    className="village-input min-w-0"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={readOnlyDraft}
                  >
                    {categoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="village-button border-[var(--line)] bg-transparent px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    onClick={() => setShowAddCategory((prev) => !prev)}
                    disabled={readOnlyDraft}
                  >
                    {showAddCategory ? "Cancel new category" : "Add category"}
                  </button>
                </div>
                {showAddCategory ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="village-input min-w-0"
                      placeholder="New category"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      disabled={readOnlyDraft}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="village-btn-secondary px-3 py-2 text-xs"
                      onClick={addCategoryFromInput}
                      disabled={readOnlyDraft || newCategoryInput.trim() === ""}
                    >
                      Save category
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="flex max-w-2xl flex-col gap-2" htmlFor="invoice-line-edit-description">
                <span className="village-label">Description</span>
                <input
                  id="invoice-line-edit-description"
                  className="village-input min-w-0"
                  placeholder="Shown on statements"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={readOnlyDraft}
                  required
                  autoComplete="off"
                />
              </label>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-2" htmlFor="invoice-line-edit-amount">
                  <span className="village-label">Amount</span>
                  <input
                    id="invoice-line-edit-amount"
                    className="village-input min-w-0"
                    placeholder={
                      monthlyFeeSelected
                        ? `Fetched from resident ward (${currencyCode})`
                        : `e.g. 120.50 (${currencyCode})`
                    }
                    inputMode="decimal"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    disabled={readOnlyDraft || monthlyFeeSelected}
                    autoComplete="off"
                  />
                </label>
                <label className="flex min-w-[10rem] max-w-xs flex-1 flex-col gap-2" htmlFor="invoice-line-edit-service-month">
                  <span className="village-label">Service month</span>
                  <input
                    id="invoice-line-edit-service-month"
                    type="month"
                    className="village-input"
                    value={serviceMonth}
                    onChange={(e) => setServiceMonth(e.target.value)}
                    disabled={readOnlyDraft}
                  />
                </label>
              </div>
              <p className="-mt-3 text-xs text-ink/60">
                For category <span className="font-mono">monthly_fee</span>, choose a service month (YYYY-MM).
              </p>
              {monthlyFeeSelected ? (
                <p className="-mt-3 text-xs text-ink/60">
                  Monthly fee amount is auto-fetched from the resident ward rate.
                </p>
              ) : null}
              {error ? <p className="text-sm font-medium text-terracotta">{error}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  form="invoice-line-edit-form"
                  type="submit"
                  className={INVOICE_MODAL_PRIMARY_BTN_CLASS}
                  disabled={submitting || readOnlyDraft || disabled}
                >
                  {submitting ? "Saving…" : "Save line"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
