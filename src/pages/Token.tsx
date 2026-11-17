import { useCallback, useEffect, useMemo, useState } from 'react';
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import {
  CURVE_STATUS_LABELS,
  getAllowance,
  getTokenBalance,
  getTokenMeta,
  getVerifiedCurve,
  planSwap,
  quoteCurve,
  type CurveState,
  type SwapPlan,
  type VerifiedCurve,
} from '../lib/ammora';
import { explorerAddress, explorerTx, getPrimaryClient } from '../lib/chain';
import { formatBps, formatEth, shortAddress } from '../lib/format';
import { getWalletClient } from '../lib/wallet';
import type { WalletState } from '../hooks/useWallet';

const QUOTE_SAMPLES_WETH = ['0.001', '0.005', '0.01', '0.02', '0.05'];

function isAddress(v: string): v is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function CurveChart({
  samples,
  loading,
}: {
  samples: { wethIn: number; tokensOut: number }[];
  loading: boolean;
}) {
  if (loading) return <p className="muted small">Sampling live quotes…</p>;
  if (samples.length < 2) return <p className="muted small">No quote data yet.</p>;
  const W = 520;
  const H = 180;
  const maxX = Math.max(...samples.map((s) => s.wethIn));
  const maxY = Math.max(...samples.map((s) => s.tokensOut));
  const px = (x: number) => 40 + (x / maxX) * (W - 60);
  const py = (y: number) => H - 30 - (y / maxY) * (H - 50);
  const points = samples.map((s) => `${px(s.wethIn)},${py(s.tokensOut)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bonding curve: tokens out vs WETH in">
      <line x1={40} y1={H - 30} x2={W - 20} y2={H - 30} stroke="#263252" />
      <line x1={40} y1={10} x2={40} y2={H - 30} stroke="#263252" />
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth={2.5} />
      {samples.map((s) => (
        <circle key={s.wethIn} cx={px(s.wethIn)} cy={py(s.tokensOut)} r={4} fill="#8b5cf6" />
      ))}
      <text x={W - 20} y={H - 10} fill="#93a1bd" fontSize={11} textAnchor="end">
        WETH in →
      </text>
      <text x={44} y={20} fill="#93a1bd" fontSize={11}>
        tokens out
      </text>
    </svg>
  );
}

export function Token({ address, wallet }: { address: string; wallet: WalletState }) {
  const curve = useMemo(() => (isAddress(address) ? address : null), [address]);
  const [verified, setVerified] = useState<VerifiedCurve | null>(null);
  const [meta, setMeta] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [samples, setSamples] = useState<{ wethIn: number; tokensOut: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [price, setPrice] = useState<string | null>(null);

  // Trade state
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<{
    amountOut: bigint;
    fee: bigint;
    fillKind: string;
    minimumAmountOut: bigint;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SwapPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [gradNote, setGradNote] = useState(false);

  const load = useCallback(async () => {
    if (!curve) {
      setLoading(false);
      setError('Invalid curve address in the URL.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const v = await getVerifiedCurve(curve);
      setVerified(v);
      const m = await getTokenMeta(v.token);
      setMeta(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [curve]);

  useEffect(() => {
    load();
  }, [load]);

  // Live quote samples for the chart + effective price (buy side).
  useEffect(() => {
    if (!verified || !meta) return;
    let cancelled = false;
    setChartLoading(true);
    (async () => {
      try {
        const out: { wethIn: number; tokensOut: number }[] = [];
        for (const w of QUOTE_SAMPLES_WETH) {
          if (cancelled) return;
          const amountIn = parseUnits(w, 18);
          const { quote } = await quoteCurve(verified.curve, amountIn, false);
          out.push({
            wethIn: Number(w),
            tokensOut: Number(formatUnits(quote.amountOut, meta.decimals)),
          });
          if (out.length === 1) {
            const perToken = Number(w) / out[0].tokensOut;
            setPrice(`${perToken.toPrecision(4)} WETH per ${meta.symbol} (from a 0.001 WETH quote)`);
          }
        }
        if (!cancelled) setSamples(out);
      } catch {
        if (!cancelled) setSamples([]);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [verified, meta]);

  const state: CurveState | null = verified?.state ?? null;
  const progress =
    state && state.migrationQuoteThreshold > 0n
      ? Math.min(100, Number((state.quoteReserve * 10000n) / state.migrationQuoteThreshold) / 100)
      : 0;

  const tokenIn: Address | null = state
    ? direction === 'buy'
      ? state.quoteToken
      : state.baseToken
    : null;
  const tokenInDecimals = direction === 'buy' ? 18 : (meta?.decimals ?? 9);
  const tokenInSymbol = direction === 'buy' ? 'WETH' : (meta?.symbol ?? 'TOKEN');

  const getQuote = async () => {
    if (!curve || !tokenIn || !amount) return;
    setQuoteLoading(true);
    setQuoteError(null);
    setQuote(null);
    setPlan(null);
    try {
      const amountIn = parseUnits(amount, tokenInDecimals);
      const baseForQuote = direction === 'sell';
      const { quote: q, fill } = await quoteCurve(curve, amountIn, baseForQuote);
      setQuote({
        amountOut: q.amountOut,
        fee: q.fee,
        fillKind: fill.kind,
        minimumAmountOut: (q.amountOut * 9950n) / 10000n,
      });
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuoteLoading(false);
    }
  };

  const buildPlan = async () => {
    if (!curve || !tokenIn || !amount || !wallet.account) return;
    setPlanLoading(true);
    setPlanError(null);
    setPlan(null);
    try {
      const amountIn = parseUnits(amount, tokenInDecimals);
      const p = await planSwap(curve, tokenIn, amountIn, wallet.account, 50);
      setPlan(p);
      const allow = await getAllowance(tokenIn, wallet.account, curve);
      setAllowance(allow);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanLoading(false);
    }
  };

  const approve = async () => {
    if (!plan || !wallet.account) return;
    setSending(true);
    setTxStatus(null);
    try {
      const client = getWalletClient();
      if (!client) throw new Error('No wallet client.');
      const hash = await client.sendTransaction({
        account: wallet.account,
        chain: null,
        to: plan.approval.token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [plan.approval.spender, plan.approval.amount],
        }),
        value: 0n,
      });
      setTxHash(hash);
      setTxStatus('Approval sent — waiting for confirmation…');
      await getPrimaryClient().waitForTransactionReceipt({ hash });
      setTxStatus('Approval confirmed. You can swap now.');
      const allow = await getAllowance(plan.approval.token, wallet.account, curve!);
      setAllowance(allow);
    } catch (e) {
      setTxStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const executeSwap = async () => {
    if (!plan || !wallet.account) return;
    setSending(true);
    setTxStatus(null);
    try {
      const client = getWalletClient();
      if (!client) throw new Error('No wallet client.');
      const hash = await client.sendTransaction({
        account: wallet.account,
        chain: null,
        to: plan.tx.to,
        data: plan.tx.data,
        value: 0n,
      });
      setTxHash(hash);
      setTxStatus('Swap sent — waiting for confirmation…');
      const receipt = await getPrimaryClient().waitForTransactionReceipt({ hash });
      setTxStatus(
        receipt.status === 'success'
          ? 'Swap confirmed on-chain.'
          : 'Transaction mined but reverted — check the explorer.',
      );
      setQuote(null);
      setPlan(null);
      setAmount('');
      await load();
    } catch (e) {
      setTxStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const refreshBalance = async () => {
    if (!verified || !meta || !wallet.account) return null;
    const bal = await getTokenBalance(verified.token, wallet.account);
    return formatEth(bal, meta.decimals);
  };
  const [myBalance, setMyBalance] = useState<string | null>(null);
  useEffect(() => {
    if (wallet.account && verified && meta) {
      refreshBalance().then(setMyBalance).catch(() => setMyBalance(null));
    } else {
      setMyBalance(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.account, verified, meta]);

  if (!curve) {
    return (
      <div className="empty">
        <h3>Invalid address</h3>
        <p>That is not a valid contract address. Go back to Discover and paste a curve address.</p>
        <a className="btn primary" href="#/">
          Back to Discover
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="empty">
        <h3>Verifying the curve…</h3>
        <p className="muted">Checking factory binding and reading on-chain state.</p>
      </div>
    );
  }

  if (error || !verified || !state || !meta) {
    return (
      <div className="empty">
        <h3>Could not load this curve</h3>
        <p className="muted">{error ?? 'Unknown error.'}</p>
        <p className="small muted">
          The address must be an Ammora V4 launch curve on GIWA Sepolia (chain 91342),
          bound to the reviewed factory.
        </p>
        <button className="btn" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const needsApproval =
    plan !== null && allowance !== null && allowance < plan.approval.amount;

  return (
    <>
      <section className="hero">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>
            {meta.name} <span>({meta.symbol})</span>
          </h1>
          <span className={`pill ${state.status === 1 ? 'green' : state.status === 2 ? 'amber' : 'purple'}`}>
            {CURVE_STATUS_LABELS[state.status] ?? `status ${state.status}`}
          </span>
        </div>
        <p className="mono small" style={{ marginTop: 10 }}>
          token{' '}
          <a href={explorerAddress(verified.token)} target="_blank" rel="noreferrer">
            {verified.token} ↗
          </a>{' '}
          · curve{' '}
          <a href={explorerAddress(curve)} target="_blank" rel="noreferrer">
            {curve} ↗
          </a>{' '}
          · Config #{state.configId.toString()} · as of block{' '}
          {state.asOfBlock.toString()}
        </p>
        {price && <p className="muted">Current price ≈ {price}</p>}
        {myBalance !== null && wallet.account && (
          <p className="muted small">
            Your balance: {myBalance} {meta.symbol} ({shortAddress(wallet.account)})
          </p>
        )}
      </section>

      <div className="two-col">
        <div className="card">
          <h3>Bonding curve</h3>
          <p className="small muted">
            Live quotes from the curve contract: tokens you receive for a WETH buy of each
            size. (No indexer on this testnet — the chart is sampled quotes, not history.)
          </p>
          <CurveChart samples={samples} loading={chartLoading} />
          <div style={{ marginTop: 16 }}>
            <div className="kv">
              <span className="k">Graduation progress</span>
              <span className="v">
                {formatEth(state.quoteReserve, 18)} / {formatEth(state.migrationQuoteThreshold, 18)} WETH
              </span>
            </div>
            <div className="progress" style={{ marginTop: 8 }}>
              <div style={{ width: `${progress}%` }} />
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {progress.toFixed(1)}% of the way to graduation. At 100% the curve is ready to
              migrate into a concentrated AMM pool.
            </p>
          </div>
          <div className="kv">
            <span className="k">Quote reserve</span>
            <span className="v">{formatEth(state.quoteReserve, 18)} WETH</span>
          </div>
          <div className="kv">
            <span className="k">Base reserve</span>
            <span className="v">{formatEth(state.baseReserve, meta.decimals)} {meta.symbol}</span>
          </div>
          <div className="kv">
            <span className="k">Current fee</span>
            <span className="v">{formatBps(state.currentFeeBps)}</span>
          </div>
          <div className="kv">
            <span className="k">Creator</span>
            <span className="v mono">{shortAddress(state.creator)}</span>
          </div>
          <div className="kv">
            <span className="k">Fee vault</span>
            <span className="v mono">{shortAddress(state.feeVault)}</span>
          </div>
          {state.status === 3 && (
            <div className="kv">
              <span className="k">Graduated pool</span>
              <span className="v mono">
                <a href={explorerAddress(state.canonicalPool)} target="_blank" rel="noreferrer">
                  {shortAddress(state.canonicalPool)} ↗
                </a>
              </span>
            </div>
          )}
          {state.status === 2 && (
            <div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={() => setGradNote(true)}>
                Graduate to AMM pool
              </button>
              {gradNote && (
                <div className="notice info" style={{ marginTop: 12 }}>
                  This curve is ready to migrate. Migration is a separate on-chain transaction
                  (final buy + migrate) and ships with the Fase 4 update, once the demo token
                  is live. Nothing is submitted from this button yet.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Trade</h3>
          <div className="tabs">
            <button className={direction === 'buy' ? 'active' : ''} onClick={() => { setDirection('buy'); setQuote(null); setPlan(null); }}>
              Buy
            </button>
            <button className={direction === 'sell' ? 'active' : ''} onClick={() => { setDirection('sell'); setQuote(null); setPlan(null); }}>
              Sell
            </button>
          </div>
          {state.status !== 1 && (
            <div className="notice">
              This curve is {CURVE_STATUS_LABELS[state.status] ?? `status ${state.status}`} —
              trading is only open while it is Active.
            </div>
          )}
          <label className="field">
            Amount ({tokenInSymbol})
          </label>
          <input
            className="input"
            inputMode="decimal"
            placeholder={direction === 'buy' ? '0.01' : '1000'}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            disabled={state.status !== 1}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn" onClick={getQuote} disabled={!amount || quoteLoading || state.status !== 1}>
              {quoteLoading ? 'Quoting…' : 'Get quote'}
            </button>
            <button
              className="btn primary"
              onClick={buildPlan}
              disabled={!quote || planLoading || state.status !== 1}
            >
              {planLoading ? 'Planning…' : 'Preview swap'}
            </button>
          </div>
          {quoteError && <div className="notice error">{quoteError}</div>}
          {quote && (
            <div style={{ marginTop: 14 }}>
              <div className="kv">
                <span className="k">You receive (est.)</span>
                <span className="v">
                  {formatEth(quote.amountOut, direction === 'buy' ? meta.decimals : 18)}{' '}
                  {direction === 'buy' ? meta.symbol : 'WETH'}
                </span>
              </div>
              <div className="kv">
                <span className="k">Fee</span>
                <span className="v">{formatEth(quote.fee, 18)} WETH</span>
              </div>
              <div className="kv">
                <span className="k">Minimum out (0.5% slippage)</span>
                <span className="v">
                  {formatEth(quote.minimumAmountOut, direction === 'buy' ? meta.decimals : 18)}{' '}
                  {direction === 'buy' ? meta.symbol : 'WETH'}
                </span>
              </div>
              <div className="kv">
                <span className="k">Fill</span>
                <span className="v">{quote.fillKind}</span>
              </div>
            </div>
          )}
          {planError && <div className="notice error">{planError}</div>}
          {plan && (
            <div style={{ marginTop: 14 }}>
              <h4 style={{ margin: '0 0 8px' }}>Review before you sign</h4>
              <div className="kv">
                <span className="k">Send</span>
                <span className="v">
                  {formatEth(plan.approval.amount, tokenInDecimals)} {tokenInSymbol}
                </span>
              </div>
              <div className="kv">
                <span className="k">Approve (if needed)</span>
                <span className="v mono">{shortAddress(plan.approval.spender)}</span>
              </div>
              <div className="kv">
                <span className="k">Minimum out</span>
                <span className="v">
                  {formatEth(plan.minimumAmountOut, direction === 'buy' ? meta.decimals : 18)}{' '}
                  {direction === 'buy' ? meta.symbol : 'WETH'}
                </span>
              </div>
              <div className="kv">
                <span className="k">Recipient</span>
                <span className="v mono">{shortAddress(wallet.account ?? '')}</span>
              </div>
              <p className="small muted">
                Approval is exact-amount only — never unlimited. The swap reverts if the
                minimum output is not met.
              </p>
              {!wallet.account ? (
                <button className="btn primary" onClick={wallet.connect} style={{ width: '100%' }}>
                  Connect wallet to continue
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {needsApproval && (
                    <button className="btn" onClick={approve} disabled={sending}>
                      {sending ? 'Waiting…' : `Approve ${tokenInSymbol} (exact)`}
                    </button>
                  )}
                  <button className="btn primary" onClick={executeSwap} disabled={sending || needsApproval}>
                    {sending ? 'Waiting…' : needsApproval ? 'Approve first' : `Swap`}
                  </button>
                </div>
              )}
            </div>
          )}
          {txHash && (
            <p className="small" style={{ marginTop: 12 }}>
              Tx: <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="mono">{txHash.slice(0, 18)}… ↗</a>
              <br />
              <span className="muted">{txStatus}</span>
            </p>
          )}
          <p className="small muted" style={{ marginTop: 16 }}>
            Testnet only. Swaps are real transactions on GIWA Sepolia — they cost testnet gas
            and move testnet tokens. Always re-check the plan above before signing.
          </p>
        </div>
      </div>
    </>
  );
}
