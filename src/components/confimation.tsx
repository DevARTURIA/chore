'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { PixelLoader, SkeletonCard } from '@/components/pixel-loader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Preview } from '@/lib/fonctions/apercu';
import { STALE_MS, ago } from '@/lib/fonctions/lib';
import { cn } from '@/lib/utils';
import { previewMove } from '@/server/actions/apercu';

/** The review sheet. For a move of funds, every number comes from code (Jupiter quote, chain
 * reads) computed from the exact arguments the agent will run with; the model's message is
 * only a caption. The friction follows the risk: two buttons, a box to tick, or no confirm. */
export const Confirmation = ({
  message,
  tool,
  args,
  result,
  toolCallId,
  addResultUtility,
}: {
  message: string;
  tool?: string;
  args?: unknown;
  result: string | undefined;
  toolCallId: string;
  addResultUtility: (result: string) => void;
}) => {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [answered, setAnswered] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const pending = !!message && !result;

  const load = useCallback(async () => {
    if (!tool) return;
    setLoading(true);
    setError(undefined);
    setAck(false);
    const r = await previewMove(tool, args).catch(() => undefined);
    // Aged from when it arrived here, so a clock that differs from the server's cannot block it.
    if (r?.data) setPreview({ ...r.data, at: Date.now() });
    else setError(r?.error ?? 'The review could not load.');
    setLoading(false);
  }, [tool, args]);

  useEffect(() => {
    if (pending && tool && !preview && !loading && !error) load();
  }, [pending, tool, preview, loading, error, load]);

  useEffect(() => {
    if (!pending || !preview) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pending, preview]);

  // After Confirm or Deny the buttons are gone: keyboard focus moves to the outcome.
  useEffect(() => {
    if (result && answered) resultRef.current?.focus();
  }, [result, answered]);

  function answer(value: 'confirm' | 'deny') {
    setAnswered(true);
    addResultUtility(value);
  }

  if (result) {
    return (
      <p
        ref={resultRef}
        tabIndex={-1}
        className="mt-2 flex items-center gap-2 text-xs text-muted-foreground outline-none"
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            result === 'deny' ? 'bg-destructive' : 'bg-primary',
          )}
        />
        {result === 'confirm'
          ? `Confirmed${preview ? `: ${preview.title}` : ''}`
          : 'Denied, nothing was sent'}
      </p>
    );
  }

  if (!message) {
    return (
      <p
        className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"
        role="status"
      >
        <PixelLoader size={9} />
        Preparing the review…
      </p>
    );
  }

  // A move of funds without its review cannot be confirmed: the server would refuse it anyway.
  const isMove = !!tool;
  const stale = !!preview && now - preview.at > STALE_MS;
  const friction = preview?.friction;
  const canConfirm =
    !isMove ||
    (!!preview &&
      !loading &&
      !stale &&
      friction !== 'block' &&
      (friction !== 'ack' || ack));
  // Why Confirm is off, said in words, in one region that stays mounted.
  const why = !isMove
    ? ''
    : loading
      ? 'Getting a quote…'
      : error
        ? `${error} Refresh to try again.`
        : !preview
          ? ''
          : friction === 'block'
            ? 'This cannot run as it is. See the reasons above.'
            : stale
              ? 'The quote is over 30 s old. Refresh it to confirm.'
              : friction === 'ack' && !ack
                ? 'Tick the box above to confirm.'
                : '';
  const whyId = `why-${toolCallId}`;

  return (
    <Card
      role="group"
      className="mt-2 w-full max-w-md overflow-hidden"
      aria-labelledby={`review-${toolCallId}`}
    >
      <div className="border-b px-4 py-3">
        <p
          id={`review-${toolCallId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Review before it runs
        </p>
        <p className="mt-1 text-sm font-semibold">
          {preview?.title ?? message}
        </p>
      </div>

      {isMove && !preview && loading && <SkeletonCard className="border-b" />}

      {preview && (
        <dl className="grid grid-cols-[auto_1fr] text-sm">
          {preview.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="border-b px-4 py-2 text-muted-foreground">
                {row.label}
              </dt>
              <dd
                className={cn(
                  'border-b px-4 py-2 text-right tabular-nums',
                  row.mono
                    ? 'break-all font-mono text-xs leading-5'
                    : 'break-words',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {preview && preview.notes.length > 0 && (
        <ul className="space-y-1.5 border-b px-4 py-3 text-sm">
          {preview.notes.map((note) => (
            <li key={note.text} className="flex gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  note.level === 'block' ? 'bg-destructive' : 'bg-pending',
                )}
              />
              <span>
                <span className="sr-only">
                  {note.level === 'block' ? 'Blocks: ' : 'Check: '}
                </span>
                {note.text}
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview && friction === 'ack' && (
        <label className="flex cursor-pointer items-start gap-2 border-b px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 accent-primary"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          I read the points above and still want to go ahead.
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
          {loading && <PixelLoader size={9} />}
          <span id={whyId} role="status">
            {why}
          </span>
          {!why && preview && (
            <span aria-hidden="true" className="tabular-nums">
              {preview.source}, {ago(preview.at, now)}
            </span>
          )}
        </p>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => answer('deny')}>
            {friction === 'block' ? 'Close' : 'Deny'}
          </Button>
          {(stale || (error && isMove)) && (
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
          {friction !== 'block' && (
            <Button
              size="sm"
              disabled={!canConfirm}
              aria-describedby={why ? whyId : undefined}
              onClick={() => answer('confirm')}
            >
              Confirm
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
