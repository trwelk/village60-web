"use client";

import { MODAL_PRIMARY_BTN_CLASS } from "@/app/dashboard/expenses/ExpenseEditorDialog";
import {
  VillageSelect,
  type VillageSelectOption,
} from "@/components/VillageSelect";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MODAL_CLOSE_BTN_CLASS =
  "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[color-mix(in_srgb,var(--line-subtle)_80%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-muted)_45%,transparent)] hover:text-[var(--text-primary)] sm:py-2.5";

export type MedicationRow = {
  id: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  quantityPerServing: number;
  servingsPerDay: number | null;
  directions: string;
  prn: boolean;
  minimumInStock: number | null;
  currentStock: number;
};

type Props = {
  homeId: string;
  residentId: string;
  /** Omit section heading (e.g. host page already has a title). */
  hideSectionTitle?: boolean;
  /** Table with column headers (management page). */
  tableLayout?: boolean;
  /** Unit dropdown with presets + Other (30b). */
  unitPresets?: boolean;
};

const UNIT_PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: "tablet", label: "Tablet" },
  { value: "capsule", label: "Capsule" },
  { value: "item", label: "Item" },
  { value: "mL", label: "mL" },
  { value: "drop", label: "Drop" },
  { value: "patch", label: "Patch" },
  { value: "puff", label: "Puff" },
  { value: "sachet", label: "Sachet" },
  { value: "IU", label: "IU" },
];

const ADD_UNIT_OPTIONS: VillageSelectOption[] = [
  ...UNIT_PRESET_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  { value: "__other__", label: "Other" },
];

const ADJUST_EVENT_OPTIONS: VillageSelectOption[] = [
  { value: "delivery", label: "Delivery (receive stock)" },
  { value: "audit_correction", label: "Audit correction" },
];

async function parseError(res: Response): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    /* ignore */
  }
  return "Request failed.";
}

function servingsCell(day: number | null): string {
  return day === null ? "—" : String(day);
}

function formatStockOnHand(n: number): string {
  if (Number.isInteger(n)) {
    return String(n);
  }
  const r = Math.round(n * 1000) / 1000;
  return String(r);
}

function formatMedicationSubtitle(m: MedicationRow): string {
  const pieces = [
    `${m.strength} · ${m.unit} · qty ${m.quantityPerServing}`,
    m.servingsPerDay === null ? "— servings/day" : `${m.servingsPerDay}/day`,
    m.minimumInStock === null ? "— min in stock" : `reorder ≤ ${m.minimumInStock}`,
    `stock ${formatStockOnHand(m.currentStock)}`,
  ];
  return pieces.join(" · ");
}

function parseNullablePositiveInt(raw: string, label: string): number | null {
  const t = raw.trim();
  if (t === "" || t === "-") {
    return null;
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${label} must be a positive integer or blank.`);
  }
  return n;
}

function parseNullableNonNegativeInt(
  raw: string,
  label: string,
): number | null {
  const t = raw.trim();
  if (t === "" || t === "-") {
    return null;
  }
  const n = Number.parseInt(t, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer or blank.`);
  }
  return n;
}

function parseNullableNonNegativeReal(
  raw: string,
  label: string,
): number | null {
  const t = raw.trim();
  if (t === "" || t === "-") {
    return null;
  }
  const n = Number.parseFloat(t);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`${label} must be a non-negative number or blank.`);
  }
  return n;
}

function resolveUnitFromPresets(select: string, other: string): string {
  if (select === "__other__") {
    const t = other.trim();
    if (!t) {
      throw new Error("Custom unit is required when Other is selected.");
    }
    return `Other: ${t}`;
  }
  return select;
}

const prnBadgeClass =
  "ml-2 inline-flex rounded-full bg-pine-soft px-2 py-0.5 text-xs font-semibold text-pine";

type CatalogMedOption = {
  id: string;
  name: string;
  strength: string;
  unit: string;
};

function isDuplicateCatalogMessage(msg: string): boolean {
  return (
    msg.includes("already has a medication with the same name") ||
    msg.includes("same name, strength, and unit")
  );
}

export function MedicationsTab({
  homeId,
  residentId,
  hideSectionTitle = false,
  tableLayout = false,
  unitPresets = false,
}: Props) {
  const base = `/api/homes/${homeId}/residents/${residentId}/clinical`;
  const [medications, setMedications] = useState<MedicationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [addName, setAddName] = useState("");
  const [addStrength, setAddStrength] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addUnitSelect, setAddUnitSelect] = useState("tablet");
  const [addUnitOther, setAddUnitOther] = useState("");
  const [addQtyServing, setAddQtyServing] = useState("");
  const [addServingsDay, setAddServingsDay] = useState("");
  const [addDirections, setAddDirections] = useState("");
  const [addMinStock, setAddMinStock] = useState("");
  const [addInitialStock, setAddInitialStock] = useState("");
  const [addPrn, setAddPrn] = useState(false);

  const [catalogSearchText, setCatalogSearchText] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogMedOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [pickedCatalog, setPickedCatalog] = useState<CatalogMedOption | null>(null);
  const [addCreateNewMode, setAddCreateNewMode] = useState(false);
  const [addProductError, setAddProductError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [editQtyServing, setEditQtyServing] = useState("");
  const [editServingsDay, setEditServingsDay] = useState("");
  const [editDirections, setEditDirections] = useState("");
  const [editMinStock, setEditMinStock] = useState("");
  const [editPrn, setEditPrn] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [prnModal, setPrnModal] = useState<MedicationRow | null>(null);
  const [prnQtyText, setPrnQtyText] = useState("");
  const [adjustModal, setAdjustModal] = useState<MedicationRow | null>(null);
  const [adjustEventType, setAdjustEventType] = useState<
    "delivery" | "audit_correction"
  >("delivery");
  const [adjustAmountText, setAdjustAmountText] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(base);
    if (!res.ok) {
      setLoadError(await parseError(res));
      return;
    }
    const json = (await res.json()) as { medications: MedicationRow[] };
    setMedications(json.medications);
  }, [base]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/profile");
        if (!res.ok || cancelled) {
          return;
        }
        const p = (await res.json()) as { role?: string };
        if (p.role === "admin" && !cancelled) {
          setViewerIsAdmin(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!unitPresets) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const q = catalogSearchText.trim();
        const path = `/api/homes/${homeId}/medications${q ? `?q=${encodeURIComponent(q)}` : ""}`;
        const res = await fetch(path);
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setCatalogResults([]);
          return;
        }
        const raw = (await res.json()) as {
          medications?: Array<{
            id: string;
            name: string;
            strength: string;
            unit: string;
          }>;
        };
        setCatalogResults(raw.medications ?? []);
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [catalogSearchText, homeId, unitPresets]);

  useEffect(() => {
    if (!catalogOpen || !unitPresets) {
      return;
    }
    function onDocMouseDown(e: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        setCatalogOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [catalogOpen, unitPresets]);

  const closeAddModal = useCallback(() => {
    if (addSubmitting) return;
    setAddModalOpen(false);
  }, [addSubmitting]);

  const openAddModal = useCallback(() => {
    setActionError(null);
    setAddProductError(null);
    setAddModalOpen(true);
  }, []);

  useEffect(() => {
    if (!tableLayout || !addModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAddModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tableLayout, addModalOpen, closeAddModal]);

  async function submitAddMedication() {
    setActionError(null);
    setAddProductError(null);
    let servingsPerDay: number | null;
    let minimumInStock: number | null;
    let initialStock: number | null;
    let quantityPerServing: number;
    try {
      quantityPerServing = parseNullableNonNegativeReal(
        addQtyServing,
        "Qty per serving",
      ) ?? 0;
      if (quantityPerServing <= 0) {
        throw new Error("Qty per serving must be greater than 0.");
      }
      servingsPerDay = parseNullablePositiveInt(
        addServingsDay,
        "Servings/day",
      );
      minimumInStock = parseNullableNonNegativeInt(
        addMinStock,
        "Minimum in stock",
      );
      initialStock = parseNullableNonNegativeReal(
        addInitialStock,
        "Initial stock",
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Invalid number.");
      return;
    }

    let payload: Record<string, unknown>;

    if (unitPresets) {
      if (pickedCatalog) {
        payload = {
          medicationId: pickedCatalog.id,
          quantityPerServing,
          directions: addDirections,
          servingsPerDay,
          minimumInStock,
          prn: addPrn,
          initialStock: initialStock ?? 0,
        };
      } else if (addCreateNewMode) {
        const unitVal = addUnitPayload();
        if (unitVal === null) {
          return;
        }
        const n = addName.trim();
        const s = addStrength.trim();
        if (!n || !s) {
          setActionError(
            "Name and strength are required for a new formulary product.",
          );
          return;
        }
        payload = {
          medication: { name: n, strength: s, unit: unitVal },
          quantityPerServing,
          directions: addDirections,
          servingsPerDay,
          minimumInStock,
          prn: addPrn,
          initialStock: initialStock ?? 0,
        };
      } else {
        setActionError(
          "Select a medication from the formulary search, or use Create new formulary product.",
        );
        return;
      }
    } else {
      const unitVal = addUnitPayload();
      if (unitVal === null) {
        return;
      }
      payload = {
        medication: {
          name: addName,
          strength: addStrength,
          unit: unitVal,
        },
        quantityPerServing,
        directions: addDirections,
        servingsPerDay,
        minimumInStock,
        prn: addPrn,
        initialStock: initialStock ?? 0,
      };
    }

    setAddSubmitting(true);
    try {
      const res = await fetch(`${base}/medications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await parseError(res);
        if (unitPresets && addCreateNewMode && isDuplicateCatalogMessage(msg)) {
          setAddProductError(msg);
        } else {
          setActionError(msg);
        }
        return;
      }

      setAddName("");
      setAddStrength("");
      setAddUnit("");
      setAddUnitSelect("tablet");
      setAddUnitOther("");
      setAddQtyServing("");
      setAddServingsDay("");
      setAddDirections("");
      setAddMinStock("");
      setAddInitialStock("");
      setAddPrn(false);
      if (unitPresets) {
        setPickedCatalog(null);
        setAddCreateNewMode(false);
        setCatalogSearchText("");
        setCatalogResults([]);
        setCatalogOpen(false);
        setAddProductError(null);
      }
      if (tableLayout) {
        setAddModalOpen(false);
      }
      await refresh();
    } finally {
      setAddSubmitting(false);
    }
  }

  function beginEdit(m: MedicationRow) {
    setEditId(m.id);
    setEditQtyServing(String(m.quantityPerServing));
    setEditServingsDay(m.servingsPerDay === null ? "" : String(m.servingsPerDay));
    setEditDirections(m.directions);
    setEditMinStock(m.minimumInStock === null ? "" : String(m.minimumInStock));
    setEditPrn(m.prn);
  }

  function addUnitPayload(): string | null {
    try {
      return unitPresets
        ? resolveUnitFromPresets(addUnitSelect, addUnitOther)
        : addUnit;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Invalid unit.");
      return null;
    }
  }

  async function saveEdit(m: MedicationRow) {
    setActionError(null);
    let servingsPerDay: number | null;
    let minimumInStock: number | null;
    let quantityPerServing: number;
    try {
      quantityPerServing = parseNullableNonNegativeReal(
        editQtyServing,
        "Qty per serving",
      ) ?? 0;
      if (quantityPerServing <= 0) {
        throw new Error("Qty per serving must be greater than 0.");
      }
      servingsPerDay = parseNullablePositiveInt(editServingsDay, "Servings/day");
      minimumInStock = parseNullableNonNegativeInt(
        editMinStock,
        "Minimum in stock",
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Invalid number.");
      return;
    }
    const res = await fetch(`${base}/medications/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantityPerServing,
        directions: editDirections,
        servingsPerDay,
        minimumInStock,
        prn: editPrn,
      }),
    });
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    setEditId(null);
    await refresh();
  }

  function openPrnModal(m: MedicationRow) {
    setActionError(null);
    setPrnModal(m);
    setPrnQtyText(String(m.quantityPerServing));
  }

  async function submitPrnDose() {
    if (!prnModal) {
      return;
    }
    setActionError(null);
    const n = Number.parseFloat(prnQtyText.trim());
    if (Number.isNaN(n) || n <= 0) {
      setActionError("Quantity must be a positive number.");
      return;
    }
    const res = await fetch(`${base}/medications/${prnModal.id}/prn-dispense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: n }),
    });
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    setPrnModal(null);
    await refresh();
  }

  function openAdjustModal(m: MedicationRow) {
    setActionError(null);
    setAdjustModal(m);
    setAdjustEventType("delivery");
    setAdjustAmountText("");
  }

  async function submitStockAdjust() {
    if (!adjustModal) {
      return;
    }
    setActionError(null);
    const amount = Number.parseFloat(adjustAmountText.trim());
    if (Number.isNaN(amount)) {
      setActionError("Amount must be a number.");
      return;
    }
    if (adjustEventType === "delivery" && amount <= 0) {
      setActionError("Delivery amount must be positive.");
      return;
    }
    if (adjustEventType === "audit_correction" && amount === 0) {
      setActionError("Audit correction cannot be zero.");
      return;
    }
    const res = await fetch(
      `${base}/medications/${adjustModal.id}/stock-adjust`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: adjustEventType, amount }),
      },
    );
    if (!res.ok) {
      setActionError(await parseError(res));
      return;
    }
    setAdjustModal(null);
    await refresh();
  }

  function stockActionButtons(
    m: MedicationRow
  ) {
    return (
      <>
        {m.prn ? (
          <button
            type="button"
            className="village-link text-sm whitespace-nowrap"
            onClick={() => openPrnModal(m)}
          >
            Log PRN dose
          </button>
        ) : null}
        {viewerIsAdmin ? (
          <button
            type="button"
            className="village-link text-sm whitespace-nowrap"
            onClick={() => openAdjustModal(m)}
          >
            Adjust stock
          </button>
        ) : null}
      </>
    );
  }

  function renderAddUnitField() {
    if (!unitPresets) {
      return (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Unit</span>
          <input
            className="village-input"
            value={addUnit}
            onChange={(e) => setAddUnit(e.target.value)}
            placeholder="tablet, capsule, mL …"
          />
        </label>
      );
    }
    return (
      <>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Unit</span>
          <VillageSelect
            className="w-full"
            ariaLabel="Unit"
            value={addUnitSelect}
            onChange={setAddUnitSelect}
            options={ADD_UNIT_OPTIONS}
          />
        </label>
        {addUnitSelect === "__other__" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Custom unit</span>
            <input
              className="village-input"
              aria-label="Custom unit"
              value={addUnitOther}
              onChange={(e) => setAddUnitOther(e.target.value)}
              placeholder="Describe unit"
            />
          </label>
        ) : null}
      </>
    );
  }

  function renderEditForm(m: MedicationRow, wrapClass: string) {
    return (
      <div className={wrapClass}>
        <div className="rounded-md border border-pine/15 bg-pine-soft/25 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3">
          <p className="font-medium text-ink">{m.name}</p>
          <p className="text-ink/75">
            {m.strength} · {m.unit}
          </p>
          <p className="mt-1 text-xs text-ink/55">
            Product comes from the home formulary. Edit the catalog entry there to
            rename.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Qty per serving</span>
          <input
            className="village-input"
            value={editQtyServing}
            onChange={(e) => setEditQtyServing(e.target.value)}
            placeholder="Qty per serving"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Servings/day (optional)</span>
          <input
            className="village-input"
            value={editServingsDay}
            onChange={(e) => setEditServingsDay(e.target.value)}
            placeholder="Leave blank if not scheduled daily"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2 lg:col-span-3">
          <span className="village-field-label">Directions</span>
          <textarea
            className="village-input min-h-[4.5rem]"
            value={editDirections}
            onChange={(e) => setEditDirections(e.target.value)}
            placeholder="How and when it is taken"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Minimum in stock (optional)</span>
          <input
            className="village-input"
            value={editMinStock}
            onChange={(e) => setEditMinStock(e.target.value)}
            placeholder="Threshold"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <input
            type="checkbox"
            className="village-checkbox"
            checked={editPrn}
            onChange={(e) => setEditPrn(e.target.checked)}
          />
          <span className="village-field-label">PRN</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="button"
            className="village-btn-primary text-xs sm:text-sm"
            onClick={() => void saveEdit(m)}
          >
            Save
          </button>
          <button
            type="button"
            className="village-btn-secondary text-xs sm:text-sm"
            onClick={() => setEditId(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return <p className="village-alert-error">{loadError}</p>;
  }

  if (medications === null) {
    return <p className="village-muted">Loading…</p>;
  }

  const colCount = 10;

  const listRows = medications.map((m) => (
    <li
      key={m.id}
      className="village-list-row flex-col gap-2 sm:flex-row sm:items-start"
    >
      {editId === m.id ? (
        renderEditForm(m, "flex w-full flex-col gap-2")
      ) : confirmDeleteId === m.id ? (
        <div className="flex w-full flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-ink">{m.name}</span>
            {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
            <p className="mt-0.5 text-ink/80">{formatMedicationSubtitle(m)}</p>
            <p className="mt-0.5 text-ink/65">{m.directions}</p>
          </div>
          <span className="village-muted">Remove?</span>
          <button
            type="button"
            className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
            onClick={async () => {
              setActionError(null);
              const res = await fetch(`${base}/medications/${m.id}`, {
                method: "DELETE",
              });
              if (!res.ok && res.status !== 204) {
                setActionError(await parseError(res));
                return;
              }
              setConfirmDeleteId(null);
              await refresh();
            }}
          >
            Confirm
          </button>
          <button
            type="button"
            className="village-link-subtle text-sm"
            onClick={() => setConfirmDeleteId(null)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-ink">{m.name}</span>
            {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
            <p className="mt-0.5 text-ink/80">{formatMedicationSubtitle(m)}</p>
            <p className="mt-0.5 text-ink/65">{m.directions}</p>
          </div>
          {stockActionButtons(m)}
          <button
            type="button"
            className="village-link text-sm"
            onClick={() => beginEdit(m)}
          >
            Edit
          </button>
          <button
            type="button"
            className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
            onClick={() => setConfirmDeleteId(m.id)}
          >
            Remove
          </button>
        </div>
      )}
    </li>
  ));

  const tableRows = medications.flatMap((m) => {
    if (editId === m.id) {
      return [
        <tr key={`${m.id}-edit`} className="border-b border-pine/10 bg-pine-soft/35">
          <td colSpan={colCount} className="p-4">
            {renderEditForm(
              m,
              "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
            )}
          </td>
        </tr>,
      ];
    }
    if (confirmDeleteId === m.id) {
      return [
        <tr key={`${m.id}-del`} className="border-b border-pine/10">
          <td colSpan={colCount} className="p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-ink">{m.name}</span>
                {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
                <p className="mt-0.5 text-ink/80">{formatMedicationSubtitle(m)}</p>
                <p className="mt-0.5 text-ink/65">{m.directions}</p>
              </div>
              <span className="village-muted">Remove?</span>
              <button
                type="button"
                className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4"
                onClick={async () => {
                  setActionError(null);
                  const res = await fetch(`${base}/medications/${m.id}`, {
                    method: "DELETE",
                  });
                  if (!res.ok && res.status !== 204) {
                    setActionError(await parseError(res));
                    return;
                  }
                  setConfirmDeleteId(null);
                  await refresh();
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="village-link-subtle text-sm"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>,
      ];
    }
    return [
      <tr key={m.id} className="border-b border-pine/10 align-top">
        <td className="py-3 pr-3 font-medium text-ink">
          {m.name}
          {m.prn ? <span className={prnBadgeClass}>PRN</span> : null}
        </td>
        <td className="py-3 pr-3">{m.strength}</td>
        <td className="py-3 pr-3">{m.unit}</td>
        <td className="py-3 pr-3">{m.quantityPerServing}</td>
        <td className="py-3 pr-3">{servingsCell(m.servingsPerDay)}</td>
        <td className="max-w-[14rem] py-3 pr-3 text-ink/85">{m.directions}</td>
        <td className="py-3 pr-3">{m.prn ? "Yes" : "—"}</td>
        <td className="py-3 pr-3 text-ink/90">
          {m.minimumInStock === null ? "—" : formatStockOnHand(m.minimumInStock)}
        </td>
        <td className="py-3 pr-3 text-ink/90">{formatStockOnHand(m.currentStock)}</td>
        <td className="py-3 pr-0 text-right align-top">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {stockActionButtons(m)}
            <button
              type="button"
              className="village-link text-sm whitespace-nowrap"
              onClick={() => beginEdit(m)}
            >
              Edit
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-danger underline decoration-danger/35 underline-offset-4 whitespace-nowrap"
              onClick={() => setConfirmDeleteId(m.id)}
            >
              Remove
            </button>
          </div>
        </td>
      </tr>,
    ];
  });

  return (
    <div className="flex flex-col gap-5">
      {!hideSectionTitle ? (
        <h3 className="village-section-title">Medications</h3>
      ) : null}
      {actionError && !(tableLayout && addModalOpen) ? (
        <p className="village-alert-error">{actionError}</p>
      ) : null}

      {tableLayout ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="village-btn-primary shrink-0 px-3 py-1.5 text-sm"
              onClick={openAddModal}
            >
              Add medication
            </button>
          </div>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-pine/20 text-left text-xs font-semibold uppercase tracking-wide text-ink/60">
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Strength</th>
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3">Qty/serving</th>
                  <th className="pb-2 pr-3">Servings/day</th>
                  <th className="pb-2 pr-3">Directions</th>
                  <th className="pb-2 pr-3">PRN</th>
                  <th className="pb-2 pr-3">Min (reorder below)</th>
                  <th className="pb-2 pr-3">Stock</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>{tableRows}</tbody>
            </table>
          </div>
        </>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">{listRows}</ul>
      )}

      {!tableLayout ? (
      <div className="village-card-soft flex flex-col gap-3 p-4 sm:p-5">
        {addProductError ? (
          <p
            className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {addProductError}
          </p>
        ) : null}

        {unitPresets ? (
          <>
            {pickedCatalog ? (
              <div className="rounded-md border border-pine/15 bg-pine-soft/25 px-3 py-2 text-sm">
                <p className="font-medium text-ink">{pickedCatalog.name}</p>
                <p className="text-ink/75">
                  {pickedCatalog.strength} · {pickedCatalog.unit}
                </p>
                <button
                  type="button"
                  className="village-link mt-2 text-xs"
                  onClick={() => {
                    setPickedCatalog(null);
                    setCatalogSearchText("");
                  }}
                >
                  Change medication
                </button>
              </div>
            ) : addCreateNewMode ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="village-link-subtle w-fit text-sm"
                  onClick={() => {
                    setAddCreateNewMode(false);
                    setAddProductError(null);
                    setAddName("");
                    setAddStrength("");
                    setAddUnit("");
                    setAddUnitSelect("tablet");
                    setAddUnitOther("");
                  }}
                >
                  Search formulary instead
                </button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="village-field-label">Name (new product)</span>
                    <input
                      className="village-input"
                      value={addName}
                      onChange={(e) => {
                        setAddName(e.target.value);
                        setAddProductError(null);
                      }}
                      placeholder="Name"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="village-field-label">Strength</span>
                    <input
                      className="village-input"
                      value={addStrength}
                      onChange={(e) => {
                        setAddStrength(e.target.value);
                        setAddProductError(null);
                      }}
                      placeholder="Strength"
                    />
                  </label>
                  {renderAddUnitField()}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="relative" ref={pickerRef}>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="village-field-label">Formulary medication</span>
                    <input
                      className="village-input"
                      value={catalogSearchText}
                      onChange={(e) => {
                        setCatalogSearchText(e.target.value);
                        setCatalogOpen(true);
                      }}
                      onFocus={() => setCatalogOpen(true)}
                      placeholder="Search formulary…"
                      autoComplete="off"
                      aria-autocomplete="list"
                    />
                  </label>
                  {catalogOpen ? (
                    <ul
                      className="absolute left-0 right-0 top-full z-[250] mt-1 max-h-52 overflow-auto rounded-md border border-pine/20 bg-white py-1 shadow-md"
                      role="listbox"
                    >
                      {catalogLoading ? (
                        <li className="px-3 py-2 text-sm text-ink/60">Loading…</li>
                      ) : catalogResults.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-ink/60">No matches</li>
                      ) : (
                        catalogResults.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={false}
                              aria-label={`${m.name} · ${m.strength} · ${m.unit}`}
                              className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-pine-soft/40"
                              onClick={() => {
                                setPickedCatalog(m);
                                setCatalogOpen(false);
                                setCatalogSearchText("");
                              }}
                            >
                              {m.name} · {m.strength} · {m.unit}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="village-link w-fit text-sm"
                  onClick={() => {
                    setAddCreateNewMode(true);
                    setCatalogOpen(false);
                    setAddProductError(null);
                  }}
                >
                  Create new formulary product
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Name</span>
              <input
                className="village-input"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Name"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Strength</span>
              <input
                className="village-input"
                value={addStrength}
                onChange={(e) => setAddStrength(e.target.value)}
                placeholder="Strength"
              />
            </label>
            {renderAddUnitField()}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Qty per serving</span>
            <input
              className="village-input"
              value={addQtyServing}
              onChange={(e) => setAddQtyServing(e.target.value)}
              placeholder="Qty per serving"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Servings/day (optional)</span>
            <input
              className="village-input"
              value={addServingsDay}
              onChange={(e) => setAddServingsDay(e.target.value)}
              placeholder="Leave blank if not scheduled daily"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Minimum in stock (optional)</span>
            <input
              className="village-input"
              value={addMinStock}
              onChange={(e) => setAddMinStock(e.target.value)}
              placeholder="Threshold"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="village-field-label">Initial stock (optional)</span>
            <input
              className="village-input"
              value={addInitialStock}
              onChange={(e) => setAddInitialStock(e.target.value)}
              placeholder="Current stock on hand"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="village-field-label">Directions</span>
          <textarea
            className="village-input min-h-[4.5rem]"
            value={addDirections}
            onChange={(e) => setAddDirections(e.target.value)}
            placeholder="How and when it is taken"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="village-checkbox"
            checked={addPrn}
            onChange={(e) => setAddPrn(e.target.checked)}
          />
          <span className="village-field-label">PRN (as needed)</span>
        </label>
        <button
          type="button"
          className="village-btn-primary w-fit"
          disabled={addSubmitting}
          onClick={() => void submitAddMedication()}
        >
          {addSubmitting ? "Adding…" : "Add medication"}
        </button>
      </div>
      ) : null}

      {tableLayout && addModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 pb-[env(safe-area-inset-bottom,0px)] sm:items-center sm:p-6 sm:pb-6">
              <button
                type="button"
                className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--text-primary)_42%,transparent)] backdrop-blur-[2px]"
                aria-label="Dismiss add medication dialog"
                onClick={closeAddModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-medication-modal-heading"
                data-testid="add-medication-modal-panel"
                className="relative z-10 flex max-h-[min(calc(100dvh-env(safe-area-inset-bottom,0px)-0.75rem),52rem)] w-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-[color-mix(in_srgb,var(--line-strong)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated)_65%)] shadow-[0_-8px_40px_-12px_color-mix(in_srgb,var(--text-primary)_35%,transparent)] sm:max-h-[min(92dvh,56rem)] sm:rounded-2xl sm:shadow-[0_22px_60px_-24px_color-mix(in_srgb,var(--text-primary)_38%,transparent)]"
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
                              Resident medication
                            </p>
                            <h2
                              id="add-medication-modal-heading"
                              className="text-xl font-semibold tracking-tight text-pine-2"
                            >
                              Add medication
                            </h2>
                            <p className="text-sm leading-6 text-ink/65">
                              Search the home formulary, set dosing and stock, or
                              create a new catalog product if needed.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={MODAL_CLOSE_BTN_CLASS}
                          onClick={closeAddModal}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-5 p-5 sm:p-6">
                      {addProductError ? (
                        <p
                          className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger"
                          role="alert"
                        >
                          {addProductError}
                        </p>
                      ) : null}
                      {actionError ? (
                        <p className="village-alert-error">{actionError}</p>
                      ) : null}

                      {unitPresets ? (
                        <>
                          {pickedCatalog ? (
                            <div className="rounded-md border border-pine/15 bg-pine-soft/25 px-3 py-2 text-sm">
                              <p className="font-medium text-ink">
                                {pickedCatalog.name}
                              </p>
                              <p className="text-ink/75">
                                {pickedCatalog.strength} · {pickedCatalog.unit}
                              </p>
                              <button
                                type="button"
                                className="village-link mt-2 text-xs"
                                onClick={() => {
                                  setPickedCatalog(null);
                                  setCatalogSearchText("");
                                }}
                              >
                                Change medication
                              </button>
                            </div>
                          ) : addCreateNewMode ? (
                            <div className="flex flex-col gap-3">
                              <button
                                type="button"
                                className="village-link-subtle w-fit text-sm"
                                onClick={() => {
                                  setAddCreateNewMode(false);
                                  setAddProductError(null);
                                  setAddName("");
                                  setAddStrength("");
                                  setAddUnit("");
                                  setAddUnitSelect("tablet");
                                  setAddUnitOther("");
                                }}
                              >
                                Search formulary instead
                              </button>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex flex-col gap-1.5 text-sm">
                                  <span className="village-field-label">
                                    Name (new product)
                                  </span>
                                  <input
                                    className="village-input"
                                    value={addName}
                                    onChange={(e) => {
                                      setAddName(e.target.value);
                                      setAddProductError(null);
                                    }}
                                    placeholder="Name"
                                  />
                                </label>
                                <label className="flex flex-col gap-1.5 text-sm">
                                  <span className="village-field-label">
                                    Strength
                                  </span>
                                  <input
                                    className="village-input"
                                    value={addStrength}
                                    onChange={(e) => {
                                      setAddStrength(e.target.value);
                                      setAddProductError(null);
                                    }}
                                    placeholder="Strength"
                                  />
                                </label>
                                {renderAddUnitField()}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <div className="relative" ref={pickerRef}>
                                <label className="flex flex-col gap-1.5 text-sm">
                                  <span className="village-field-label">
                                    Formulary medication
                                  </span>
                                  <input
                                    className="village-input"
                                    value={catalogSearchText}
                                    onChange={(e) => {
                                      setCatalogSearchText(e.target.value);
                                      setCatalogOpen(true);
                                    }}
                                    onFocus={() => setCatalogOpen(true)}
                                    placeholder="Search formulary…"
                                    autoComplete="off"
                                    aria-autocomplete="list"
                                  />
                                </label>
                                {catalogOpen ? (
                                  <ul
                                    className="absolute left-0 right-0 top-full z-[280] mt-1 max-h-52 overflow-auto rounded-md border border-pine/20 bg-white py-1 shadow-md"
                                    role="listbox"
                                  >
                                    {catalogLoading ? (
                                      <li className="px-3 py-2 text-sm text-ink/60">
                                        Loading…
                                      </li>
                                    ) : catalogResults.length === 0 ? (
                                      <li className="px-3 py-2 text-sm text-ink/60">
                                        No matches
                                      </li>
                                    ) : (
                                      catalogResults.map((m) => (
                                        <li key={m.id}>
                                          <button
                                            type="button"
                                            role="option"
                                            aria-selected={false}
                                            aria-label={`${m.name} · ${m.strength} · ${m.unit}`}
                                            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-pine-soft/40"
                                            onClick={() => {
                                              setPickedCatalog(m);
                                              setCatalogOpen(false);
                                              setCatalogSearchText("");
                                            }}
                                          >
                                            {m.name} · {m.strength} · {m.unit}
                                          </button>
                                        </li>
                                      ))
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                className="village-link w-fit text-sm"
                                onClick={() => {
                                  setAddCreateNewMode(true);
                                  setCatalogOpen(false);
                                  setAddProductError(null);
                                }}
                              >
                                Create new formulary product
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="village-field-label">Name</span>
                            <input
                              className="village-input"
                              value={addName}
                              onChange={(e) => setAddName(e.target.value)}
                              placeholder="Name"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="village-field-label">Strength</span>
                            <input
                              className="village-input"
                              value={addStrength}
                              onChange={(e) => setAddStrength(e.target.value)}
                              placeholder="Strength"
                            />
                          </label>
                          {renderAddUnitField()}
                        </div>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">Qty per serving</span>
                          <input
                            className="village-input"
                            value={addQtyServing}
                            onChange={(e) => setAddQtyServing(e.target.value)}
                            placeholder="Qty per serving"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            Servings/day (optional)
                          </span>
                          <input
                            className="village-input"
                            value={addServingsDay}
                            onChange={(e) => setAddServingsDay(e.target.value)}
                            placeholder="Leave blank if not scheduled daily"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            Minimum in stock (optional)
                          </span>
                          <input
                            className="village-input"
                            value={addMinStock}
                            onChange={(e) => setAddMinStock(e.target.value)}
                            placeholder="Threshold"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5 text-sm">
                          <span className="village-field-label">
                            Initial stock (optional)
                          </span>
                          <input
                            className="village-input"
                            value={addInitialStock}
                            onChange={(e) => setAddInitialStock(e.target.value)}
                            placeholder="Current stock on hand"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1.5 text-sm">
                        <span className="village-field-label">Directions</span>
                        <textarea
                          className="village-input min-h-[4.5rem]"
                          value={addDirections}
                          onChange={(e) => setAddDirections(e.target.value)}
                          placeholder="How and when it is taken"
                        />
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="village-checkbox"
                          checked={addPrn}
                          onChange={(e) => setAddPrn(e.target.checked)}
                        />
                        <span className="village-field-label">PRN (as needed)</span>
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          className={MODAL_PRIMARY_BTN_CLASS}
                          disabled={addSubmitting}
                          onClick={() => void submitAddMedication()}
                        >
                          {addSubmitting ? "Adding…" : "Add medication"}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {prnModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prn-dose-title"
        >
          <div className="w-full max-w-md rounded-lg border border-pine/20 bg-white p-5 shadow-lg">
            <h4 id="prn-dose-title" className="text-base font-semibold text-ink">
              Log PRN dose — {prnModal.name}
            </h4>
            <p className="mt-1 text-sm text-ink/70">
              Quantity removed from stock (defaults to qty per serving:{" "}
              {prnModal.quantityPerServing}).
            </p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Quantity</span>
              <input
                className="village-input"
                value={prnQtyText}
                onChange={(e) => setPrnQtyText(e.target.value)}
                inputMode="decimal"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="village-btn-primary text-sm"
                onClick={() => void submitPrnDose()}
              >
                Log dose
              </button>
              <button
                type="button"
                className="village-btn-secondary text-sm"
                onClick={() => setPrnModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {adjustModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-adj-title"
        >
          <div className="w-full max-w-md rounded-lg border border-pine/20 bg-white p-5 shadow-lg">
            <h4 id="stock-adj-title" className="text-base font-semibold text-ink">
              Adjust stock — {adjustModal.name}
            </h4>
            <p className="mt-1 text-sm text-ink/70">
              Delivery adds stock (positive amount). Audit correction adjusts the
              balance (amount may be negative).
            </p>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Event type</span>
              <VillageSelect
                className="w-full"
                ariaLabel="Stock adjustment event type"
                value={adjustEventType}
                onChange={(v) =>
                  setAdjustEventType(
                    v === "audit_correction" ? "audit_correction" : "delivery",
                  )
                }
                options={ADJUST_EVENT_OPTIONS}
              />
            </label>
            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="village-field-label">Amount</span>
              <input
                className="village-input"
                value={adjustAmountText}
                onChange={(e) => setAdjustAmountText(e.target.value)}
                placeholder={
                  adjustEventType === "delivery"
                    ? "Units received"
                    : "Positive or negative adjustment"
                }
                inputMode="decimal"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="village-btn-primary text-sm"
                onClick={() => void submitStockAdjust()}
              >
                Save
              </button>
              <button
                type="button"
                className="village-btn-secondary text-sm"
                onClick={() => setAdjustModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
