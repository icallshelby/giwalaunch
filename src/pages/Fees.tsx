import { useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import {
  buildFeeClaimPlan,
  getClaimable,
  getFeeVault,
  getTemplateConfig,
  WETH_ADDRESS,
  type ConfigEntry,
} from '../lib/ammora';
import { CORE, explorerAddress, getPrimaryClient } from '../lib/chain';
import { formatBps, formatEth, shortAddress } from '../lib/format';
import { getWalletClient } from '../lib/wallet';
import type { WalletState } from '../hooks/useWallet';

export function Fees({ wallet }: { wallet: WalletState }) {
  const [template, setTemplate] = useState<ConfigEntry | null>(null);
  const [feeVault, setFeeVault] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimable, setClaimable] = useState<bigint | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, fv] = await Promise.all([getTemplateConfig(), getFeeVault()]);
        if (!cancelled) {
          setTemplate(t);
          setFeeVault(fv);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const checkClaimable = async () => {
    if (!feeVault || !wallet.account) return;
    setClaimLoading(true);
    setError(null);
    try {
      const v = await getClaimable(feeVault, WETH_ADDRESS, wallet.account);
      setClaimable(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClaimLoading(false);
    }
  };

  useEffect(() => {
    if (feeVault && wallet.account) {
      checkClaimable();
    } else {
      setClaimable(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeVault, wallet.account]);

  const claim = async () => {
    if (!feeVault || !wallet.account || claimable === null || claimable === 0n) return;
    setSending(true);
    setTxStatus(null);
    try {
      const client = getWalletClient();
      if (!client) throw new Error('No wallet client.');
      const plan = buildFeeClaimPlan(feeVault, WETH_ADDRESS, wallet.account, wallet.account);
      const hash = await client.sendTransaction({
        account: wallet.account,
        chain: null,
        to: plan.to,
        data: plan.data,
        value: 0n,
      });
      setTxHash(hash);
      setTxStatus('Claim sent — waiting for confirmation…');
      const receipt = await getPrimaryClient().waitForTransactionReceipt({ hash });
      setTxStatus(
        receipt.status === 'success'
          ? 'Claim confirmed — fees are in your wallet.'
          : 'Transaction mined but reverted — check the explorer.',
      );
      await checkClaimable();
    } catch (e) {
      setTxStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const c = template?.config;

  return (
    <>
      <section className="hero">
        <h1>
          Creator fees, <span>claimable any time</span>
        </h1>
        <p>
          Every trade on a GiwaLaunch curve pays a fee. Fees settle in the FeeVault and
          the creator claims their share whenever they want — no lock-up, no schedule.
        </p>
      </section>

      {loading && (
        <div className="empty">
          <h3>Reading the fee policy…</h3>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}

      <div className="two-col">
        <div className="card">
          <h3>How fees work</h3>
          {c ? (
            <>
              <div className="kv">
                <span className="k">Cliff fee (pre-graduation)</span>
                <span className="v">{formatBps(c.cliffFeeBps)}</span>
              </div>
              <div className="kv">
                <span className="k">Creator share</span>
                <span className="v">{formatBps(c.creatorShareOfNonProtocolBps)} of non-protocol fees</span>
              </div>
              <div className="kv">
                <span className="k">Post-migration fee</span>
                <span className="v">{formatBps(c.postMigrationFeeBps)}</span>
              </div>
              <div className="kv">
                <span className="k">Migration fee</span>
                <span className="v">{formatBps(c.migrationQuoteFeeBps)}</span>
              </div>
              <div className="kv">
                <span className="k">Fee policy contract</span>
                <span className="v mono">
                  <a href={explorerAddress(CORE.feePolicy)} target="_blank" rel="noreferrer">
                    {shortAddress(CORE.feePolicy)} ↗
                  </a>
                </span>
              </div>
              <div className="kv">
                <span className="k">Fee vault</span>
                <span className="v mono">
                  {feeVault ? (
                    <a href={explorerAddress(feeVault)} target="_blank" rel="noreferrer">
                      {shortAddress(feeVault)} ↗
                    </a>
                  ) : (
                    '…'
                  )}
                </span>
              </div>
            </>
          ) : (
            <p className="muted">Fee schedule loads from template Config #6.</p>
          )}
          <p className="small muted" style={{ marginTop: 14 }}>
            Fees are denominated in WETH (the quote token). The partner share goes to the
            Config's partner recipient; the creator share goes to the token's creator.
            Protocol fees are separate and do not go to either.
          </p>
        </div>

        <div className="card">
          <h3>Your claimable fees</h3>
          {!wallet.account ? (
            <>
              <p className="muted">
                Connect your wallet to see what you can claim. Fees are keyed to the
                connected address — the claim goes to that same address.
              </p>
              <button className="btn primary" onClick={wallet.connect}>
                Connect wallet
              </button>
            </>
          ) : (
            <>
              <p className="muted small">
                Connected: <span className="mono">{shortAddress(wallet.account)}</span>
              </p>
              {claimLoading ? (
                <p className="muted">Reading the FeeVault…</p>
              ) : claimable !== null ? (
                <div className="kv">
                  <span className="k">Claimable (WETH)</span>
                  <span className="v">{formatEth(claimable, 18)} WETH</span>
                </div>
              ) : (
                <p className="muted">Could not read claimable fees yet.</p>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn" onClick={checkClaimable} disabled={claimLoading}>
                  Refresh
                </button>
                <button
                  className="btn primary"
                  onClick={claim}
                  disabled={sending || claimable === null || claimable === 0n}
                >
                  {sending ? 'Waiting…' : claimable === 0n ? 'Nothing to claim' : 'Claim WETH fees'}
                </button>
              </div>
              {txHash && (
                <p className="small" style={{ marginTop: 12 }}>
                  Tx: <span className="mono">{txHash.slice(0, 18)}…</span>
                  <br />
                  <span className="muted">{txStatus}</span>
                </p>
              )}
              <p className="small muted" style={{ marginTop: 14 }}>
                The claim is a real testnet transaction. It pays out to the connected
                address — a payout address never changes who the fees belong to.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>LP positions</h3>
        <p className="muted">
          After a token graduates, the creator and partner hold permanently locked LP
          positions in the concentrated AMM pool. Position balances and fee claims for
          those positions appear here once the first token graduates — there are no
          graduated tokens yet, so this section honestly shows nothing for now.
        </p>
      </div>
    </>
  );
}
