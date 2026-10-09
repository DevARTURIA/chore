'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usd } from '@/lib/fonctions/lib';

/**
 * Replaces degen mode. Below these limits a move runs without the review sheet; above them,
 * or once the 24 h total is reached, the server refuses until the user confirms.
 * Scheduled automations use the same limits, since no one is there to click.
 */
export function AutoApproveLimits({
  perTx,
  perDay,
  onSave,
}: {
  perTx: number;
  perDay: number;
  onSave: (limits: {
    autoApproveTxUsd: number;
    autoApproveDayUsd: number;
  }) => Promise<{ success: boolean; error?: string } | undefined>;
}) {
  const [tx, setTx] = useState(String(perTx));
  const [day, setDay] = useState(String(perDay));
  const [saving, setSaving] = useState(false);
  /** Raising a limit lets more run without a click: it takes a second, explicit step. */
  const [raising, setRaising] = useState(false);
  // An empty field is not a zero: clearing it must not quietly turn auto-approve off.
  const parse = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
  const txN = parse(tx);
  const dayN = parse(day);
  const valid =
    Number.isFinite(txN) && Number.isFinite(dayN) && txN >= 0 && dayN >= txN;
  const changed = txN !== perTx || dayN !== perDay;
  const raises = valid && (txN > perTx || dayN > perDay);

  async function save(t: number, d: number) {
    setSaving(true);
    const result = await onSave({ autoApproveTxUsd: t, autoApproveDayUsd: d });
    setSaving(false);
    setRaising(false);
    if (result?.success) toast.success('Limits saved');
    else toast.error('Limits not saved', { description: result?.error });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Auto-approve
        </p>
        <p className="mt-1 text-sm">
          {perTx > 0
            ? `Swaps and orders up to ${usd(perTx)} run without asking, up to ${usd(perDay)} per 24 h.`
            : 'Off: every move of funds asks for your confirmation.'}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="auto-tx" className="text-xs text-muted-foreground">
            Per move (USD)
          </Label>
          <Input
            id="auto-tx"
            name="autoApproveTxUsd"
            autoComplete="off"
            inputMode="decimal"
            className="w-28 font-mono tabular-nums"
            value={tx}
            aria-invalid={!valid}
            aria-describedby={!valid ? 'auto-error' : undefined}
            onChange={(e) => {
              setTx(e.target.value);
              setRaising(false);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="auto-day" className="text-xs text-muted-foreground">
            Per 24 h (USD)
          </Label>
          <Input
            id="auto-day"
            name="autoApproveDayUsd"
            autoComplete="off"
            inputMode="decimal"
            className="w-28 font-mono tabular-nums"
            value={day}
            aria-invalid={!valid}
            aria-describedby={!valid ? 'auto-error' : undefined}
            onChange={(e) => {
              setDay(e.target.value);
              setRaising(false);
            }}
          />
        </div>
        <Button
          size="sm"
          disabled={!valid || !changed || saving || raising}
          onClick={() => (raises ? setRaising(true) : save(txN, dayN))}
        >
          {saving ? 'Saving…' : 'Save limits'}
        </Button>
        {perTx > 0 && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setTx('0');
              setDay('0');
              save(0, 0);
            }}
          >
            Turn off
          </Button>
        )}
      </div>
      {!valid && (
        <p id="auto-error" role="alert" className="text-xs text-destructive">
          Enter a number of 0 or more in both fields, the 24 h limit at least
          the per-move one.
        </p>
      )}
      {raising && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1">
            Swaps and orders up to {usd(txN)} will run without asking, up to{' '}
            {usd(dayN)} per 24 h.
          </span>
          <Button size="sm" variant="outline" onClick={() => setRaising(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={() => save(txN, dayN)}>
            {saving ? 'Saving…' : 'Raise limits'}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Checked by the server, not by the AI. Above a limit, chore shows the
        review and waits for you. Sending to another wallet or launching a token
        always asks. Automations that buy or sell use these limits too.
      </p>
    </div>
  );
}
