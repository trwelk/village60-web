import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  accounts,
  homePurchaseOrderLines,
  homePurchaseOrderReceiveEvents,
  homePurchaseOrders,
  inventoryItems,
  invoiceLineItems,
  invoices,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { NotFoundError, ValidationError } from "@/lib/homes/errors";
import { ensureHomeAccount } from "@/lib/billing/homeAccounts";
import { bumpInvNumberSequence } from "@/lib/billing/invoiceNumbers";
import { finalizeInvoiceAsTrustedSystem, finalizeInvoiceInTransaction } from "@/lib/billing/invoiceLifecycle";
import { utcDateOnlyFromMs } from "@/lib/billing/billingMonth";

const INVENTORY_PO_CATEGORY = "inventory_po";

function residentBillingAccountId(db: AppDb, residentId: string): string {
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.accountType, "resident"), eq(accounts.residentId, residentId)))
    .get();
  if (!row) {
    throw new NotFoundError("Resident billing account not found.");
  }
  return row.id;
}

function resolveBillingAccountIdForOwner(
  db: AppDb,
  poHomeId: string,
  ownerType: string,
  ownerId: string,
): string {
  if (ownerType === "HOME") {
    const acc = ensureHomeAccount(db, poHomeId);
    return acc.id;
  }
  if (ownerType === "RESIDENT") {
    return residentBillingAccountId(db, ownerId);
  }
  throw new ValidationError("Invalid purchase order line owner.");
}

type LineCostRow = {
  lineId: string;
  itemId: string;
  ownerType: string;
  ownerId: string;
  itemName: string;
  amountMinor: number;
};

function computeLineCostsForPurchaseOrder(
  db: AppDb,
  purchaseOrderId: string,
): LineCostRow[] {
  const poLines = db
    .select()
    .from(homePurchaseOrderLines)
    .where(eq(homePurchaseOrderLines.purchaseOrderId, purchaseOrderId))
    .all();
  if (poLines.length === 0) {
    return [];
  }
  const lineIds = poLines.map((l) => l.id);
  const events = db
    .select()
    .from(homePurchaseOrderReceiveEvents)
    .where(
      and(
        eq(homePurchaseOrderReceiveEvents.purchaseOrderId, purchaseOrderId),
        inArray(homePurchaseOrderReceiveEvents.purchaseOrderLineId, lineIds),
      ),
    )
    .all();

  const minorByLineId = new Map<string, number>();
  for (const ev of events) {
    const add = Math.round(ev.unitPriceCents * ev.qtyReceivedEvent);
    minorByLineId.set(
      ev.purchaseOrderLineId,
      (minorByLineId.get(ev.purchaseOrderLineId) ?? 0) + add,
    );
  }

  const itemIds = [...new Set(poLines.map((l) => l.itemId))];
  const items = db
    .select({ id: inventoryItems.id, name: inventoryItems.name })
    .from(inventoryItems)
    .where(inArray(inventoryItems.id, itemIds))
    .all();
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));

  const rows: LineCostRow[] = [];
  for (const line of poLines) {
    const amountMinor = minorByLineId.get(line.id) ?? 0;
    if (amountMinor <= 0) continue;
    rows.push({
      lineId: line.id,
      itemId: line.itemId,
      ownerType: line.ownerType,
      ownerId: line.ownerId,
      itemName: itemNameById.get(line.itemId) ?? line.itemId,
      amountMinor,
    });
  }
  return rows;
}

/**
 * When a purchase order reaches `CLOSED`, create one invoice per billing account
 * (home stock vs each resident) that had received-value PO lines, with `inventory_po` lines,
 * then post ledger charges and set each invoice to `finalized`.
 * Idempotent: skips finalized rows; finalizes an existing draft for (`purchaseOrderId`, `accountId`).
 */
export function createPurchaseOrderCloseInvoices(
  db: AppDb,
  purchaseOrderId: string,
  nowUtcMs: number,
): void {
  const po = db
    .select()
    .from(homePurchaseOrders)
    .where(eq(homePurchaseOrders.id, purchaseOrderId))
    .get();
  if (!po || po.status !== "CLOSED") {
    return;
  }

  const billedLines = computeLineCostsForPurchaseOrder(db, purchaseOrderId);
  if (billedLines.length === 0) {
    return;
  }

  const byOwner = new Map<string, LineCostRow[]>();
  for (const row of billedLines) {
    const key = `${row.ownerType}\n${row.ownerId}`;
    const list = byOwner.get(key) ?? [];
    list.push(row);
    byOwner.set(key, list);
  }

  for (const [, ownerLines] of byOwner) {
    const sample = ownerLines[0];
    if (!sample) continue;
    const accountId = resolveBillingAccountIdForOwner(
      db,
      po.homeId,
      sample.ownerType,
      sample.ownerId,
    );

    const existing = db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(
        and(eq(invoices.purchaseOrderId, purchaseOrderId), eq(invoices.accountId, accountId)),
      )
      .get();
    if (existing) {
      if (existing.status === "finalized") {
        continue;
      }
      if (existing.status === "draft") {
        finalizeInvoiceAsTrustedSystem(db, {
          invoiceId: existing.id,
          finalizedAtUtcMs: nowUtcMs,
        });
        continue;
      }
      throw new ValidationError(
        `Purchase order invoice must be draft or finalized; got ${existing.status}.`,
      );
    }

    const invoiceId = randomUUID();
    db.transaction((tx) => {
      const invNo = bumpInvNumberSequence(tx, po.homeId, nowUtcMs);
      tx.insert(invoices)
        .values({
          id: invoiceId,
          accountId,
          homeId: po.homeId,
          invNo,
          purchaseOrderId,
          status: "draft",
          issuedOn: utcDateOnlyFromMs(nowUtcMs),
          totalMinorSnapshot: null,
          createdAtUtcMs: nowUtcMs,
          updatedAtUtcMs: nowUtcMs,
        })
        .run();

      for (const line of ownerLines) {
        tx.insert(invoiceLineItems)
          .values({
            id: randomUUID(),
            invoiceId,
            category: INVENTORY_PO_CATEGORY,
            description: `${line.itemName} — PO ${po.poNumber}`,
            amountMinor: line.amountMinor,
            serviceMonth: null,
            quantity: 1,
            createdAtUtcMs: nowUtcMs,
            updatedAtUtcMs: nowUtcMs,
          })
          .run();
      }

      finalizeInvoiceInTransaction(tx, invoiceId, {
        finalizedAtUtcMs: nowUtcMs,
        recordedByUserId: null,
      });
    });
  }
}
