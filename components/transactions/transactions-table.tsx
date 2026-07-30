"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { deleteTransaction, deleteMultipleTransactions } from "@/app/actions/transactions";
import type { TransactionWithRelations } from "@/app/actions/transactions";
import type { AccountWithBalance } from "@/app/actions/accounts";
import { formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, RepeatIcon, Filter, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format } from "date-fns";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { EditTransactionDialog } from "./edit-transaction-dialog";

interface EnvelopeOption {
  id: string;
  name: string;
  setName: string;
}

interface TransactionsTableProps {
  transactions: TransactionWithRelations[];
  total: number;
  householdId: string;
  envelopes: EnvelopeOption[];
  accounts: AccountWithBalance[];
  initialFilters?: {
    envelopeId?: string;
    accountId?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

const TYPE_LABELS: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary" | "success" }> = {
  INCOME:   { label: "Income",   variant: "success" },
  EXPENSE:  { label: "Expense",  variant: "destructive" },
  TRANSFER: { label: "Transfer", variant: "outline" },
};

const PAGE_SIZE = 25;

export function TransactionsTable({
  transactions: initialTransactions,
  total: initialTotal,
  householdId,
  envelopes,
  accounts,
  initialFilters,
}: TransactionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [transactions, setTransactions] = useState(initialTransactions);
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(initialFilters?.page ? parseInt(initialFilters.page, 10) : 0);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allIds = transactions.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // ── Filters ────────────────────────────────────────────────────────────────
  const [filterEnvelope, setFilterEnvelope] = useState(initialFilters?.envelopeId ?? "all");
  const [filterAccount, setFilterAccount] = useState(initialFilters?.accountId ?? "all");
  const [filterFrom, setFilterFrom] = useState(initialFilters?.from ?? "");
  const [filterTo, setFilterTo] = useState(initialFilters?.to ?? "");

  // Sync with prop changes (e.g. after database mutations or query updates)
  useEffect(() => {
    setTransactions(initialTransactions);
    setSelected(new Set()); // clear selection when data refreshes
  }, [initialTransactions]);

  useEffect(() => {
    setFilterEnvelope(initialFilters?.envelopeId ?? "all");
    setFilterAccount(initialFilters?.accountId ?? "all");
    setFilterFrom(initialFilters?.from ?? "");
    setFilterTo(initialFilters?.to ?? "");
    setPage(initialFilters?.page ? parseInt(initialFilters.page, 10) : 0);
  }, [initialFilters]);

  const totalPages = Math.ceil(initialTotal / PAGE_SIZE);

  const applyFilters = (envelopeId: string, accountId: string, from: string, to: string, newPage: number) => {
    const params = new URLSearchParams();
    if (envelopeId && envelopeId !== "all") params.set("envelopeId", envelopeId);
    if (accountId && accountId !== "all") params.set("accountId", accountId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (newPage > 0) params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  // ── Single delete ──────────────────────────────────────────────────────────
  function handleDelete(id: string) {
    if (!confirm("Delete this transaction?")) return;
    startTransition(async () => {
      await deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      toast.success("Transaction deleted");
    });
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────
  function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} selected transaction${ids.length > 1 ? "s" : ""}?`)) return;
    startTransition(async () => {
      const result = await deleteMultipleTransactions(ids);
      if (result.success) {
        setTransactions((prev) => prev.filter((t) => !selected.has(t.id)));
        setSelected(new Set());
        toast.success(`${result.deleted} transaction${result.deleted > 1 ? "s" : ""} deleted`);
      } else {
        toast.error("Failed to delete transactions");
      }
    });
  }

  // ── Amount display helper ─────────────────────────────────────────────────
  function amountDisplay(tx: TransactionWithRelations) {
    const abs = formatINR(Math.abs(tx.amountInPaise));
    if (tx.type === "INCOME") return { sign: "+", text: abs, color: "text-positive" };
    if (tx.type === "EXPENSE") {
      if (tx.amountInPaise < 0) return { sign: "+", text: abs, color: "text-positive" };
      return { sign: "−", text: abs, color: "text-negative" };
    }
    return { sign: "", text: abs, color: "text-foreground" };
  }

  return (
    <div className="space-y-4">
      {/* Filters bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground sm:hidden">Filters</span>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Date range */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterFrom(val);
                  applyFilters(filterEnvelope, filterAccount, val, filterTo, 0);
                }}
                className="h-9 sm:h-8 flex-1 sm:w-36 text-xs"
                id="filter-from-date"
                aria-label="From date"
              />
              <span className="text-muted-foreground text-xs shrink-0">to</span>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterTo(val);
                  applyFilters(filterEnvelope, filterAccount, filterFrom, val, 0);
                }}
                className="h-9 sm:h-8 flex-1 sm:w-36 text-xs"
                id="filter-to-date"
                aria-label="To date"
              />
            </div>

            {/* Envelope filter */}
            <Select
              value={filterEnvelope}
              onValueChange={(val) => {
                setFilterEnvelope(val);
                applyFilters(val, filterAccount, filterFrom, filterTo, 0);
              }}
            >
              <SelectTrigger className="h-9 sm:h-8 w-full sm:w-40 text-xs" id="filter-envelope">
                <SelectValue placeholder="All envelopes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All envelopes</SelectItem>
                {envelopes.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.setName} → {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Account filter */}
            <Select
              value={filterAccount}
              onValueChange={(val) => {
                setFilterAccount(val);
                applyFilters(filterEnvelope, val, filterFrom, filterTo, 0);
              }}
            >
              <SelectTrigger className="h-9 sm:h-8 w-full sm:w-40 text-xs" id="filter-account">
                <SelectValue placeholder="All accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Add Transaction Button */}
        <div className="w-full md:w-auto shrink-0">
          <AddTransactionDialog householdId={householdId} envelopes={envelopes} accounts={accounts} />
        </div>
      </div>

      {/* Bulk action bar — slides in when rows are selected */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              id="bulk-clear-selection-btn"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isPending}
            id="bulk-delete-btn"
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete {selected.size} {selected.size === 1 ? "transaction" : "transactions"}
          </Button>
        </div>
      )}

      {/* Desktop Table (hidden on mobile) */}
      <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-4">
                <Checkbox
                  id="select-all-checkbox"
                  checked={allSelected}
                  data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                  onCheckedChange={toggleAll}
                  aria-label="Select all transactions"
                  className="cursor-pointer"
                />
              </TableHead>
              <TableHead className="w-28">Date</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Envelope</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No transactions yet. Add one above!
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => {
                const { sign, text, color } = amountDisplay(tx);
                const isSelected = selected.has(tx.id);
                return (
                  <TableRow
                    key={tx.id}
                    data-state={isSelected ? "selected" : undefined}
                    className={cn(isSelected && "bg-primary/5")}
                  >
                    <TableCell className="pl-4">
                      <Checkbox
                        id={`select-tx-${tx.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(tx.id)}
                        aria-label={`Select transaction ${tx.id}`}
                        className="cursor-pointer"
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(tx.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {tx.payee ?? <span className="text-muted-foreground italic">—</span>}
                        {tx.isRecurring && (
                          <RepeatIcon
                            className="h-3.5 w-3.5 text-primary shrink-0"
                            aria-label="Recurring transaction"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.type === "TRANSFER" ? (
                        <span className="text-muted-foreground">
                          {tx.envelope?.name ?? "—"} → {tx.toEnvelope?.name ?? "—"}
                        </span>
                      ) : (
                        tx.envelope?.name ?? (
                          <span className="text-muted-foreground italic">—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_LABELS[tx.type]?.variant ?? "outline"}>
                        {TYPE_LABELS[tx.type]?.label ?? tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                      {tx.notes ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn("text-right font-semibold text-sm tabular-nums", color)}
                    >
                      {sign}{text}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <EditTransactionDialog
                          transaction={tx}
                          householdId={householdId}
                          envelopes={envelopes}
                          accounts={accounts}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(tx.id)}
                          disabled={isPending}
                          aria-label="Delete transaction"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List (hidden on desktop) */}
      <div className="space-y-3 sm:hidden">
        {transactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-muted-foreground text-sm">
            No transactions yet. Add one above!
          </div>
        ) : (
          transactions.map((tx) => {
            const { sign, text, color } = amountDisplay(tx);
            const isSelected = selected.has(tx.id);
            return (
              <div
                key={tx.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 shadow-sm space-y-3 transition-colors",
                  isSelected && "border-primary/40 bg-primary/5"
                )}
              >
                {/* Header: Checkbox + Date + Type Badge */}
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`mobile-select-tx-${tx.id}`}
                    checked={isSelected}
                    onCheckedChange={() => toggleOne(tx.id)}
                    aria-label={`Select transaction ${tx.id}`}
                    className="cursor-pointer shrink-0"
                  />
                  <div className="flex items-center justify-between flex-1 text-xs text-muted-foreground">
                    <span>{format(new Date(tx.date), "dd MMM yyyy")}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={TYPE_LABELS[tx.type]?.variant ?? "outline"}>
                        {TYPE_LABELS[tx.type]?.label ?? tx.type}
                      </Badge>
                      {tx.isRecurring && (
                        <RepeatIcon
                          className="h-3.5 w-3.5 text-primary shrink-0"
                          aria-label="Recurring transaction"
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Body: Payee, Envelope, Notes */}
                <div className="space-y-1">
                  <div className="font-semibold text-sm text-foreground flex items-center justify-between">
                    <span>{tx.payee ?? <span className="text-muted-foreground italic font-normal">—</span>}</span>
                    <span className={cn("font-semibold text-sm tabular-nums", color)}>
                      {sign}{text}
                    </span>
                  </div>
                  
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>
                      {tx.type === "TRANSFER" ? (
                        <span>
                          {tx.envelope?.name ?? "—"} → {tx.toEnvelope?.name ?? "—"}
                        </span>
                      ) : (
                        tx.envelope?.name ?? <span className="italic">—</span>
                      )}
                    </span>
                    {tx.notes && <span className="truncate max-w-[150px]">{tx.notes}</span>}
                  </div>
                </div>

                {/* Action Footer: Edit and Delete buttons */}
                <div className="flex justify-end items-center gap-1 border-t border-border/40 pt-2">
                  <EditTransactionDialog
                    transaction={tx}
                    householdId={householdId}
                    envelopes={envelopes}
                    accounts={accounts}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-destructive gap-1 px-2"
                    onClick={() => handleDelete(tx.id)}
                    disabled={isPending}
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="text-xs">Delete</span>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page + 1} of {totalPages} · {initialTotal} transactions
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const newP = Math.max(0, page - 1);
                setPage(newP);
                applyFilters(filterEnvelope, filterAccount, filterFrom, filterTo, newP);
              }}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const newP = Math.min(totalPages - 1, page + 1);
                setPage(newP);
                applyFilters(filterEnvelope, filterAccount, filterFrom, filterTo, newP);
              }}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
