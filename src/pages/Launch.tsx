import { useEffect, useState } from 'react';
import { getTemplateConfig, GIWALAUNCH_CONFIG_ID, type ConfigEntry } from '../lib/ammora';
import { explorerAddress } from '../lib/chain';
import { formatBps, formatEth, shortAddress } from '../lib/format';
import type { WalletState } from '../hooks/useWallet';

export function Launch({ wallet: _wallet }: { wallet: WalletState }) {
  const [template, setTemplate] = useState<ConfigEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [metadataUri, setMetadataUri] = useState('');
  const [firstBuy, setFirstBuy] = useState('');
  const [preview, setPreview] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await getTemplateConfig();
        if (!cancelled) setTemplate(t);
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

  const showPreview = () => {
    setFormError(null);
    if (!name.trim()) return setFormError('Token name is required.');
    if (!/^[A-Z0-9]{1,10}$/.test(symbol.trim().toUpperCase())) {
      return setFormError('Symbol: 1–10 uppercase letters/numbers.');
    }
    if (firstBuy) {
      const n = Number(firstBuy);
      if (!Number.isFinite(n) || n <= 0) return setFormError('First buy must be a positive number of WETH.');
    }
    setPreview(true);
  };

  const c = template?.config;

  return (
    <>
      <section className="hero">
        <h1>
          Launch a token <span>on GIWA Sepolia</span>
        </h1>
        <p>
          One form, one signature: your token is created, its bonding curve opens, and
          your first buy is placed in the same flow. Creator fees accrue to you
          automatically — 30% of non-protocol fees, claimable any time.
        </p>
      </section>

      {GIWALAUNCH_CONFIG_ID === null && (
        <div className="notice">
          <strong>Token creation opens soon.</strong> Launches run under the GiwaLaunch
          Config, which is created in Fase 1 (it needs the owner's wallet signature).
          Until then you can fill the form and preview the exact economics below — the
          launch button stays disabled so nobody signs against a Config that does not
          exist yet.
        </div>
      )}

      {loading && (
        <div className="empty">
          <h3>Reading template Config #6…</h3>
          <p className="muted">The preview below is read live from the chain, not hardcoded.</p>
        </div>
      )}
      {error && <div className="notice error">{error}</div>}

      <div className="two-col">
        <div className="card">
          <h3>Your token</h3>
          <label className="field">Token name</label>
          <input
            className="input"
            placeholder="e.g. Mula"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
          />
          <label className="field">Symbol</label>
          <input
            className="input"
            placeholder="e.g. MULA"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={10}
          />
          <label className="field">Metadata URI (optional)</label>
          <input
            className="input mono"
            placeholder="ipfs://… or https://… (token image + description)"
            value={metadataUri}
            onChange={(e) => setMetadataUri(e.target.value)}
          />
          <label className="field">First buy (WETH, optional)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="e.g. 0.01 — counts toward the 0.05 WETH graduation threshold"
            value={firstBuy}
            onChange={(e) => setFirstBuy(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          {formError && <div className="notice error">{formError}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={showPreview}>
              Preview launch
            </button>
          </div>
          {preview && c && (
            <div style={{ marginTop: 18 }}>
              <h4 style={{ margin: '0 0 8px' }}>Launch preview — {name.trim()} ({symbol.trim()})</h4>
              <div className="kv">
                <span className="k">Total supply</span>
                <span className="v">{formatEth(c.totalSupply, c.tokenDecimals)} {symbol.trim()}</span>
              </div>
              <div className="kv">
                <span className="k">Graduation threshold</span>
                <span className="v">{formatEth(c.migrationQuoteThreshold, 18)} WETH of buys</span>
              </div>
              <div className="kv">
                <span className="k">First buy</span>
                <span className="v">{firstBuy ? `${firstBuy} WETH` : 'none'}</span>
              </div>
              <div className="kv">
                <span className="k">Cliff fee</span>
                <span className="v">{formatBps(c.cliffFeeBps)}</span>
              </div>
              <div className="kv">
                <span className="k">Creator share</span>
                <span className="v">{formatBps(c.creatorShareOfNonProtocolBps)} of non-protocol fees</span>
              </div>
              <div className="kv">
                <span className="k">Pool creation fee</span>
                <span className="v">{formatEth(c.poolCreationFee, 18)} ETH</span>
              </div>
              <div className="kv">
                <span className="k">Post-migration fee</span>
                <span className="v">{formatBps(c.postMigrationFeeBps)}</span>
              </div>
              <p className="small muted">
                The plan (unsigned) will show approval, target contract and exact amounts
                before any signature is requested. Launching is a real testnet transaction —
                it costs testnet gas only.
              </p>
              <button className="btn primary" disabled title="Opens once the GiwaLaunch Config is created (Fase 1)">
                Launch (opens with the GiwaLaunch Config)
              </button>
            </div>
          )}
        </div>

        <div className="card">
          <h3>How it works</h3>
          <p>
            <strong>1. Create.</strong> Your token mints with a fixed supply of{' '}
            {c ? formatEth(c.totalSupply, c.tokenDecimals) : '…'} tokens and a bonding
            curve starts at the Config's start price.
          </p>
          <p>
            <strong>2. Trade.</strong> Anyone buys and sells on the curve. Buys count
            toward the graduation threshold of{' '}
            {c ? `${formatEth(c.migrationQuoteThreshold, 18)} WETH` : '…'}.
          </p>
          <p>
            <strong>3. Graduate.</strong> At the threshold, the curve migrates into a
            concentrated AMM pool — liquidity is permanently locked,{' '}
            {c
              ? `${formatBps(c.liquidityDistribution.partnerPermanentLockedBps)} to the partner and ${formatBps(c.liquidityDistribution.creatorPermanentLockedBps)} to the creator`
              : ''}.
          </p>
          <p>
            <strong>4. Claim fees.</strong> Trading fees accrue in the FeeVault; the
            creator claims {c ? formatBps(c.creatorShareOfNonProtocolBps) : '…'} of
            non-protocol fees, any time, from the Fees page.
          </p>
          {template && (
            <div style={{ marginTop: 14 }}>
              <div className="kv">
                <span className="k">Template Config</span>
                <span className="v">#6 · enabled</span>
              </div>
              <div className="kv">
                <span className="k">Template owner</span>
                <span className="v mono">
                  <a href={explorerAddress(template.identity.owner)} target="_blank" rel="noreferrer">
                    {shortAddress(template.identity.owner)} ↗
                  </a>
                </span>
              </div>
              <div className="kv">
                <span className="k">Migration mode</span>
                <span className="v">Concentrated graduation</span>
              </div>
            </div>
          )}
          <p className="small muted" style={{ marginTop: 14 }}>
            Testnet only — launched tokens have no market value. Never send real funds to
            a testnet address.
          </p>
        </div>
      </div>
    </>
  );
}
