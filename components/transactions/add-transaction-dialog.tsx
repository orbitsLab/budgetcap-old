"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTransaction } from "@/app/actions/transactions";
import type { AccountWithBalance } from "@/app/actions/accounts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, RepeatIcon, ArrowLeftRight, Layers } from "lucide-react";
import { format } from "date-fns";

interface EnvelopeOption {
  id: string;
  name: string;
  setName: string;
}

interface AddTransactionDialogProps {
  householdId: string;
  envelopes: EnvelopeOption[];
  accounts: AccountWithBalance[];
  onSuccess?: () => void;
}

type TxType = "INCOME" | "EXPENSE" | "TRANSFER";
type TransferSubType = "ACCOUNT" | "ENVELOPE";

export function AddTransactionDialog({
  householdId,
  envelopes,
  accounts,
  onSuccess,
}: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form state
  const [type, setType] = useState<TxType>("EXPENSE");
  const [transferSubType, setTransferSubType] = useState<TransferSubType>("ACCOUNT");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [notes, setNotes] = useState("");
  const [envelopeId, setEnvelopeId] = useState("");
  const [toEnvelopeId, setToEnvelopeId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState("1");

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    const paise = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(paise) || paise === 0) e.amount = "Enter a valid non-zero amount";
    // INCOME and TRANSFER must be positive
    if ((type === "INCOME" || type === "TRANSFER") && paise < 0) e.amount = "Amount must be positive for income and transfers";

    if (type === "EXPENSE") {
      if (!envelopeId) e.envelope = "Select an envelope";
    }

    if (type === "TRANSFER") {
      if (transferSubType === "ACCOUNT") {
        if (!accountId || accountId === "none") e.account = "Select a source account";
        if (!toAccountId || toAccountId === "none") e.toAccount = "Select a destination account";
        if (accountId && toAccountId && accountId === toAccountId)
          e.toAccount = "Source and destination accounts must differ";
      } else {
        // ENVELOPE transfer
        if (!envelopeId) e.envelope = "Select a source envelope";
        if (!toEnvelopeId) e.toEnvelope = "Select a destination envelope";
        if (envelopeId && toEnvelopeId && envelopeId === toEnvelopeId)
          e.toEnvelope = "Source and destination envelopes must differ";
      }
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const paise = Math.round(parseFloat(amount) * 100);

    // Build payload based on type + subtype
    const isAccountTransfer = type === "TRANSFER" && transferSubType === "ACCOUNT";
    const isEnvelopeTransfer = type === "TRANSFER" && transferSubType === "ENVELOPE";

    startTransition(async () => {
      const result = await createTransaction({
        householdId,
        type,
        date: new Date(date).toISOString(),
        amountInPaise: paise,
        payee: payee || undefined,
        notes: notes || undefined,
        envelopeId: isAccountTransfer ? null : (type === "INCOME" ? null : envelopeId || null),
        toEnvelopeId: isEnvelopeTransfer ? toEnvelopeId || null : null,
        accountId: isEnvelopeTransfer
          ? null
          : !accountId || accountId === "none"
          ? null
          : accountId,
        toAccountId: isAccountTransfer
          ? toAccountId && toAccountId !== "none"
            ? toAccountId
            : null
          : null,
        isRecurring,
        recurringDayOfMonth: isRecurring ? parseInt(recurringDay) : null,
      });

      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Transaction added!");
        setOpen(false);
        resetForm();
        onSuccess?.();
      }
    });
  }

  function resetForm() {
    setType("EXPENSE");
    setTransferSubType("ACCOUNT");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setAmount("");
    setPayee("");
    setNotes("");
    setEnvelopeId("");
    setToEnvelopeId("");
    setAccountId("");
    setToAccountId("");
    setIsRecurring(false);
    setRecurringDay("1");
    setErrors({});
  }

  const typeColors: Record<TxType, string> = {
    INCOME: "text-positive",
    EXPENSE: "text-negative",
    TRANSFER: "text-primary",
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} id="add-transaction-btn" className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Add Transaction
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Transaction Type */}
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["EXPENSE", "INCOME", "TRANSFER"] as TxType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors ${
                      type === t
                        ? `border-primary bg-primary/10 ${typeColors[t]}`
                        : "border-input hover:bg-muted/50"
                    }`}
                    id={`tx-type-${t.toLowerCase()}`}
                  >
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Transfer Sub-Type Tabs */}
            {type === "TRANSFER" && (
              <div className="space-y-1.5">
                <Label>Transfer Type</Label>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setTransferSubType("ACCOUNT"); setErrors({}); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                      transferSubType === "ACCOUNT"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                    id="tx-transfer-account-tab"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Account Transfer
                  </button>
                  <div className="w-px bg-border" />
                  <button
                    type="button"
                    onClick={() => { setTransferSubType("ENVELOPE"); setErrors({}); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                      transferSubType === "ENVELOPE"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                    id="tx-transfer-envelope-tab"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Envelope Transfer
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {transferSubType === "ACCOUNT"
                    ? "Move money between two bank/cash accounts."
                    : "Reallocate budget between two envelopes."}
                </p>
              </div>
            )}

            {/* Date + Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tx-amount">Amount (₹)</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    ₹
                  </span>
                  <Input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7"
                  />
                </div>
                {type === "EXPENSE" && (
                  <p className="text-xs text-muted-foreground">
                    Use a negative amount for a refund or credit.
                  </p>
                )}
                {errors.amount && (
                  <p className="text-xs text-destructive">{errors.amount}</p>
                )}
              </div>
            </div>

            {/* ── ACCOUNT TRANSFER FIELDS ── */}
            {type === "TRANSFER" && transferSubType === "ACCOUNT" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-account">From Account</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="tx-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.account && (
                    <p className="text-xs text-destructive">{errors.account}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx-to-account">To Account</Label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger id="tx-to-account">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.id !== accountId)
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.toAccount && (
                    <p className="text-xs text-destructive">{errors.toAccount}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── ENVELOPE TRANSFER FIELDS ── */}
            {type === "TRANSFER" && transferSubType === "ENVELOPE" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tx-envelope">From Envelope</Label>
                  <Select value={envelopeId} onValueChange={setEnvelopeId}>
                    <SelectTrigger id="tx-envelope">
                      <SelectValue placeholder="Select envelope" />
                    </SelectTrigger>
                    <SelectContent>
                      {envelopes.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.setName} → {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.envelope && (
                    <p className="text-xs text-destructive">{errors.envelope}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tx-to-envelope">To Envelope</Label>
                  <Select value={toEnvelopeId} onValueChange={setToEnvelopeId}>
                    <SelectTrigger id="tx-to-envelope">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {envelopes
                        .filter((e) => e.id !== envelopeId)
                        .map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.setName} → {e.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.toEnvelope && (
                    <p className="text-xs text-destructive">{errors.toEnvelope}</p>
                  )}
                </div>
              </div>
            )}

            {/* ── INCOME / EXPENSE FIELDS ── */}
            {type !== "TRANSFER" && (
              <>
                {/* Account (optional) */}
                <div className="space-y-1.5">
                  <Label htmlFor="tx-account">Account (Optional)</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="tx-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Envelope (required for EXPENSE) */}
                {type === "EXPENSE" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="tx-envelope">Envelope</Label>
                    <Select value={envelopeId} onValueChange={setEnvelopeId}>
                      <SelectTrigger id="tx-envelope">
                        <SelectValue placeholder="Select envelope" />
                      </SelectTrigger>
                      <SelectContent>
                        {envelopes.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.setName} → {e.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.envelope && (
                      <p className="text-xs text-destructive">{errors.envelope}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Payee + Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="tx-payee">Payee</Label>
              <Input
                id="tx-payee"
                placeholder="e.g. Swiggy, Amazon..."
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-notes">Notes</Label>
              <Input
                id="tx-notes"
                placeholder="Optional"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Recurring toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <RepeatIcon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Recurring</p>
                <p className="text-xs text-muted-foreground">Auto-generate each month</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isRecurring}
                onClick={() => setIsRecurring((r) => !r)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isRecurring ? "bg-primary" : "bg-muted"
                }`}
                id="tx-recurring-toggle"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isRecurring ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {isRecurring && (
              <div className="space-y-1.5">
                <Label htmlFor="tx-recurring-day">Day of month</Label>
                <Input
                  id="tx-recurring-day"
                  type="number"
                  min="1"
                  max="28"
                  value={recurringDay}
                  onChange={(e) => setRecurringDay(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending} id="tx-submit-btn">
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
