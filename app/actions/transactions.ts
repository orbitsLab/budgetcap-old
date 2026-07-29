"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────

const transactionSchema = z.object({
  householdId: z.string().cuid(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  date: z.string().datetime({ offset: true }).or(z.string().date()),
  amountInPaise: z.number().int().refine((v) => v !== 0, { message: "Amount cannot be zero" }),
  payee: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  envelopeId: z.string().cuid().optional().nullable(),
  toEnvelopeId: z.string().cuid().optional().nullable(), // TRANSFER destination
  accountId: z.string().cuid().optional().nullable(),
  toAccountId: z.string().cuid().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurringDayOfMonth: z.number().int().min(1).max(28).optional().nullable(),
});

export type CreateTransactionInput = z.infer<typeof transactionSchema>;
export type CreateTransactionResult = { success: true; id: string } | { error: string };

// ─────────────────────────────────────────────────────────
// Create Transaction
// ─────────────────────────────────────────────────────────

export async function createTransaction(
  data: CreateTransactionInput
): Promise<CreateTransactionResult> {
  await requireAuth();

  const parsed = transactionSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid transaction data";
    return { error: msg };
  }

  const {
    householdId,
    type,
    date,
    amountInPaise,
    payee,
    notes,
    envelopeId,
    toEnvelopeId,
    accountId,
    toAccountId,
    isRecurring,
    recurringDayOfMonth,
  } = parsed.data;

  // Validate TRANSFER: must have either envelope-to-envelope or account-to-account
  if (type === "TRANSFER") {
    const hasEnvelopeTransfer = envelopeId && toEnvelopeId;
    const hasAccountTransfer = accountId && toAccountId;
    if (!hasEnvelopeTransfer && !hasAccountTransfer) {
      return { error: "Transfer requires either source & destination envelopes, or source & destination accounts." };
    }
    if (envelopeId && toEnvelopeId && envelopeId === toEnvelopeId) {
      return { error: "Source and destination envelopes must be different." };
    }
    if (accountId && toAccountId && accountId === toAccountId) {
      return { error: "Source and destination accounts must be different." };
    }
  }

  const tx = await prisma.transaction.create({
    data: {
      householdId,
      type,
      date: new Date(date),
      amountInPaise,
      payee: payee || null,
      notes: notes || null,
      envelopeId: envelopeId || null,
      toEnvelopeId: type === "TRANSFER" ? toEnvelopeId || null : null,
      accountId: accountId || null,
      toAccountId: type === "TRANSFER" ? toAccountId || null : null,
      isRecurring: isRecurring ?? false,
      recurringDayOfMonth: isRecurring ? recurringDayOfMonth ?? null : null,
    },
  });

  // Revalidate cache tags and paths
  revalidateTag("household_transactions", "max");
  revalidateTag("household_envelopes", "max");
  revalidateTag("household_dashboard_summary", "max");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { success: true, id: tx.id };
}

const updateTransactionSchema = transactionSchema.extend({
  id: z.string().cuid(),
});

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export async function updateTransaction(
  data: UpdateTransactionInput
): Promise<CreateTransactionResult> {
  await requireAuth();

  const parsed = updateTransactionSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid transaction data";
    return { error: msg };
  }

  const {
    id,
    householdId,
    type,
    date,
    amountInPaise,
    payee,
    notes,
    envelopeId,
    toEnvelopeId,
    accountId,
    toAccountId,
    isRecurring,
    recurringDayOfMonth,
  } = parsed.data;

  // Validate TRANSFER: must have either envelope-to-envelope or account-to-account
  if (type === "TRANSFER") {
    const hasEnvelopeTransfer = envelopeId && toEnvelopeId;
    const hasAccountTransfer = accountId && toAccountId;
    if (!hasEnvelopeTransfer && !hasAccountTransfer) {
      return { error: "Transfer requires either source & destination envelopes, or source & destination accounts." };
    }
    if (envelopeId && toEnvelopeId && envelopeId === toEnvelopeId) {
      return { error: "Source and destination envelopes must be different." };
    }
    if (accountId && toAccountId && accountId === toAccountId) {
      return { error: "Source and destination accounts must be different." };
    }
  }

  const tx = await prisma.transaction.update({
    where: { id },
    data: {
      type,
      date: new Date(date),
      amountInPaise,
      payee: payee || null,
      notes: notes || null,
      envelopeId: envelopeId || null,
      toEnvelopeId: type === "TRANSFER" ? toEnvelopeId || null : null,
      accountId: accountId || null,
      toAccountId: type === "TRANSFER" ? toAccountId || null : null,
      isRecurring: isRecurring ?? false,
      recurringDayOfMonth: isRecurring ? recurringDayOfMonth ?? null : null,
    },
  });

  // Revalidate cache tags and paths
  revalidateTag("household_transactions", "max");
  revalidateTag("household_envelopes", "max");
  revalidateTag("household_dashboard_summary", "max");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { success: true, id: tx.id };
}

// ─────────────────────────────────────────────────────────
// Delete Transaction
// ─────────────────────────────────────────────────────────

export async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  await requireAuth();
  
  // Find transaction to get household ID
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { householdId: true },
  });

  await prisma.transaction.delete({ where: { id } });

  // Revalidate cache tags and paths
  revalidateTag("household_transactions", "max");
  revalidateTag("household_envelopes", "max");
  revalidateTag("household_dashboard_summary", "max");
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { success: true };
}

// ─────────────────────────────────────────────────────────
// Fetch Transactions
// ─────────────────────────────────────────────────────────

export interface TransactionWithRelations {
  id: string;
  date: Date;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amountInPaise: number;
  payee: string | null;
  notes: string | null;
  isRecurring: boolean;
  recurringDayOfMonth?: number | null;
  envelope: { id: string; name: string } | null;
  toEnvelope: { id: string; name: string } | null;
  envelopeId?: string | null;
  toEnvelopeId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
}

export async function getTransactions(
  householdId: string,
  options?: {
    envelopeId?: string;
    accountId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ transactions: TransactionWithRelations[]; total: number }> {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const url = new URL(`${baseUrl}/api/transactions`);
  url.searchParams.set("householdId", householdId);
  if (options?.envelopeId) url.searchParams.set("envelopeId", options.envelopeId);
  if (options?.accountId) url.searchParams.set("accountId", options.accountId);
  if (options?.from) url.searchParams.set("from", options.from.toISOString());
  if (options?.to) url.searchParams.set("to", options.to.toISOString());
  if (options?.limit !== undefined) url.searchParams.set("limit", options.limit.toString());
  if (options?.offset !== undefined) url.searchParams.set("offset", options.offset.toString());

  const res = await fetch(url.toString(), {
    headers: { "x-household-id": householdId },
    next: { tags: ["household_transactions"] },
  });
  
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const data = await res.json();

  // Convert date strings back to Date objects
  return {
    transactions: data.transactions.map((t: any) => ({
      ...t,
      date: new Date(t.date),
    })),
    total: data.total,
  };
}

// ─────────────────────────────────────────────────────────
// Step 5: Generate Recurring Transactions
// Called by the cron API route on the 1st of each month
// ─────────────────────────────────────────────────────────

export async function generateRecurringTransactions(): Promise<{
  generated: number;
  errors: string[];
}> {
  const today = new Date();
  const dayOfMonth = today.getDate();

  // Find all recurring transaction templates due today
  const templates = await prisma.transaction.findMany({
    where: {
      isRecurring: true,
      recurringDayOfMonth: dayOfMonth,
      recurringParentId: null, // only templates, not generated copies
    },
  });

  let generated = 0;
  const errors: string[] = [];

  for (const template of templates) {
    // Check if already generated this month
    const alreadyExists = await prisma.transaction.findFirst({
      where: {
        recurringParentId: template.id,
        date: {
          gte: new Date(today.getFullYear(), today.getMonth(), 1),
          lt: new Date(today.getFullYear(), today.getMonth() + 1, 1),
        },
      },
    });

    if (alreadyExists) continue;

    try {
      await prisma.transaction.create({
        data: {
          householdId: template.householdId,
          envelopeId: template.envelopeId,
          toEnvelopeId: template.toEnvelopeId,
          accountId: template.accountId,
          toAccountId: template.toAccountId,
          type: template.type,
          date: today,
          amountInPaise: template.amountInPaise,
          payee: template.payee,
          notes: template.notes ? `[Recurring] ${template.notes}` : "[Recurring]",
          isRecurring: false,
          recurringParentId: template.id,
        },
      });
      generated++;
    } catch (err) {
      errors.push(`Failed to generate from template ${template.id}: ${String(err)}`);
    }
  }

  // Revalidate cache tags and paths if any transactions were generated
  if (generated > 0) {
    revalidateTag("household_transactions", "max");
    revalidateTag("household_envelopes", "max");
    revalidateTag("household_dashboard_summary", "max");
  }
  revalidatePath("/transactions");
  revalidatePath("/budget");
  return { generated, errors };
}
