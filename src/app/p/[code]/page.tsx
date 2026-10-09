import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { brand } from '@/config/brand';
import type { CardModel, Proof } from '@/lib/fonctions/cards';
import { cardByCode, lookFrom } from '@/server/cards';

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const query = (look: Record<string, string>) =>
  new URLSearchParams(look).toString();

/** The site's address, for links shared outside: the configured one, else this request's host. */
async function origin() {
  if (brand.website) return brand.website.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { code } = await params;
  const card = await cardByCode(code);
  if (!card) return { title: 'Card not found' };
  const m = card.model as unknown as CardModel;
  const look = lookFrom(card.look, await searchParams);
  const image = `/api/card/${code}?${query({ ...look })}`;
  const title = `${m.title}: ${m.big}`;
  return {
    metadataBase: new URL(await origin()),
    title,
    description: `${m.line}. ${m.source}. Every number is read from Solana; this page lists the transactions.`,
    openGraph: {
      title,
      images: [
        {
          url: image,
          ...(look.format === 'wide'
            ? { width: 1200, height: 630 }
            : { width: 1080, height: 1080 }),
        },
      ],
    },
    twitter: {
      card: look.format === 'wide' ? 'summary_large_image' : 'summary',
      title,
      images: [image],
    },
  };
}

/** The proof page: the card, how its numbers were made, and every transaction behind them. Public. */
export default async function ProofPage({ params, searchParams }: Props) {
  const { code } = await params;
  const card = await cardByCode(code);
  if (!card) notFound();
  const m = card.model as unknown as CardModel;
  const proof = card.proof as unknown as Proof;
  const look = lookFrom(card.look, await searchParams);
  const image = `/api/card/${code}?${query({ ...look })}`;
  const page = `${await origin()}/p/${code}`;
  const tweet = `https://x.com/intent/post?text=${encodeURIComponent(`${m.title}: ${m.big} (${m.line}). Read from Solana, check it here:`)}&url=${encodeURIComponent(page)}`;
  const variant = (k: string, v: string, label: string) => {
    const on = (look as unknown as Record<string, string>)[k] === v;
    return (
      <a
        key={k + v}
        href={`/p/${code}?${query({ ...look, [k]: v })}`}
        aria-current={on ? 'true' : undefined}
        className={`rounded-md border px-3 py-1.5 text-sm ${on ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
      </a>
    );
  };

  return (
    <main className="mx-auto grid max-w-3xl gap-8 px-4 py-10">
      <header className="grid gap-2">
        <p className="font-mono text-sm text-muted-foreground">
          proof {code} · made{' '}
          {card.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC
        </p>
        <h1 className="text-balance text-3xl font-extrabold tracking-tight">
          {m.title}: {m.big}
        </h1>
      </header>

      <figure className="grid gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={`${m.title}, ${m.big}, ${m.line}`}
          width={look.format === 'wide' ? 1200 : 1080}
          height={look.format === 'wide' ? 630 : 1080}
          className="h-auto w-full rounded-lg border"
        />
        <div className="flex flex-wrap items-center gap-2">
          {variant('style', 'plage', 'Beach')}
          {variant('style', 'nuit', 'Night')}
          {look.style === 'plage' && m.movers?.length
            ? [
                variant('sky', 'stats', 'Numbers'),
                variant('sky', 'tokens', 'Top movers'),
              ]
            : null}
          {variant('format', 'wide', 'Wide')}
          {variant('format', 'square', 'Square')}
          <a
            href={tweet}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
          >
            Post on X <span aria-hidden="true">↗</span>
          </a>
        </div>
      </figure>

      <section className="grid gap-3" aria-labelledby="how">
        <h2 id="how" className="text-lg font-bold">
          How these numbers are made
        </h2>
        <ul className="grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          {proof.method.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {proof.note && (
          <p className="text-sm text-muted-foreground">{proof.note}</p>
        )}
      </section>

      {proof.rows.length > 0 && (
        <section className="grid gap-3" aria-labelledby="txs">
          <h2 id="txs" className="text-lg font-bold">
            {card.kind === 'rugcheck'
              ? 'What was found'
              : `Transactions (${proof.rows.length})`}
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {proof.rows.map((r) => (
                  <tr
                    key={r.signature + r.detail}
                    className="border-b last:border-0"
                  >
                    <td className="hidden whitespace-nowrap px-3 py-2 font-mono text-muted-foreground sm:table-cell">
                      {r.time || r.symbol}
                    </td>
                    <td className="px-3 py-2">
                      <span className="block font-mono text-xs text-muted-foreground sm:hidden">
                        {r.time || r.symbol}
                      </span>
                      {r.side === 'held'
                        ? r.detail
                        : `${r.side === 'buy' ? 'Buy' : 'Sell'} ${r.symbol}: ${r.detail}`}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <a
                        href={
                          r.side === 'held'
                            ? `https://solscan.io/token/${r.signature}`
                            : `https://solscan.io/tx/${r.signature}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Solscan <span aria-hidden="true">↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="text-sm text-muted-foreground">
        Information, not financial advice. Past results say nothing about future
        ones. The beach image is made with AI.
      </footer>
    </main>
  );
}
