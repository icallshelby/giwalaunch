import { useEffect, useState } from 'react';
import { getAmmoraV4NextConfigId } from '@ammora-protocol/sdk';
import { getConfig, TEMPLATE_CONFIG_ID, type ConfigEntry } from '../lib/ammora';
import { CORE, explorerAddress, getPrimaryClient } from '../lib/chain';
import { formatBps, formatEth, shortAddress } from '../lib/format';
import type { WalletState } from '../hooks/useWallet';

function ConfigCard({ entry }: { entry: ConfigEntry }) {
  const c = entry.config;
  const id = entry.configId.toString();
  const isTemplate = entry.configId === TEMPLATE_CONFIG_ID;
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Config #{id}</h3>
        {entry.enabled ? (
          <span className="pill green">enabled</span>
        ) : (
          <span className="pill amber">disabled</span>
        )}
        {isTemplate && <span className="pill cyan">GiwaLaunch template</span>}
      </div>
      <div className="kv">
        <span className="k">Owner</span>
        <span className="v mono">{shortAddress(entry.identity.owner)}</span>
      </div>
      <div className="kv">
        <span className="k">Graduation threshold</span>
        <span className="v">{formatEth(c.migrationQuoteThreshold, 18)} WETH</span>
      </div>
      <div className="kv">
        <span className="k">Total supply</span>
        <span className="v">{formatEth(c.totalSupply, c.tokenDecimals)} tokens</span>
      </div>
      <div className="kv">
        <span className="k">Cliff fee</span>
        <span className="v">{formatBps(c.cliffFeeBps)}</span>
      </div>
      <div className="kv">
        <span className="k">Creator share (non-protocol)</span>
        <span className="v">{formatBps(c.creatorShareOfNonProtocolBps)}</span>
      </div>
      <div className="kv">
        <span className="k">Migration mode</span>
        <span className="v">{c.migrationMode === 0 ? 'Concentrated graduation' : `Mode ${c.migrationMode}`}</span>
      </div>
      <div className="kv">
        <span className="k">Created</span>
        <span className="v">block {entry.identity.createdAtBlock.toString()}</span>
      </div>
      <p className="small muted mono" style={{ marginTop: 10 }}>
        hash {entry.configHash.slice(0, 18)}… ·{' '}
        <a href={explorerAddress(entry.identity.owner)} target="_blank" rel="noreferrer">
          owner on explorer ↗
        </a>
      </p>
    </div>
  );
}

export function Discover({ wallet: _wallet }: { wallet: WalletState }) {
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read newest Configs one by one and render incrementally —
        // the public RPC is paced, so waiting for all of them is slow.
        const client = getPrimaryClient();
        const block = await client.getBlockNumber();
        const nextId = await getAmmoraV4NextConfigId(client, CORE.configRegistry, block);
        const ids: bigint[] = [];
        for (let id = nextId - 1n; id >= 1n && ids.length < 8; id--) ids.push(id);
        for (const id of ids) {
          if (cancelled) return;
          const entry = await getConfig(id);
          if (cancelled) return;
          setConfigs((prev) => [...prev, entry]);
          setLoaded((n) => n + 1);
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

  const openLookup = () => {
    const addr = lookup.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      window.location.hash = `#/token/${addr}`;
    } else {
      setError('Enter a valid 0x address (curve or token contract).');
    }
  };

  return (
    <>
      <section className="hero">
        <h1>
          Launch tokens on <span>GIWA Sepolia</span>
        </h1>
        <p>
          GiwaLaunch is a launchpad built with the Ammora SDK: create a token, trade it on
          its bonding curve, watch it graduate into an AMM pool, and claim creator fees.
          Everything here runs on the GIWA Sepolia testnet — no real money, ever.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn primary" href="#/launch">
            Launch a token
          </a>
          <a className="btn" href="#/fees">
            How fees work
          </a>
        </div>
      </section>

      <div className="notice info">
        <strong>Status: launchpad is live, Config setup is next.</strong> The site reads
        live Configs from the Ammora registry below. Token creation opens once the
        GiwaLaunch Config is created (Fase 1 — needs the owner's wallet signature).
        Until then, the Launch page previews the exact economics of template Config #6.
      </div>

      <section>
        <h2 style={{ margin: '28px 0 4px' }}>Find a token by curve address</h2>
        <p className="muted small">
          Paste an ALC curve contract address to open its trading page.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="input mono"
            placeholder="0x… curve address"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && openLookup()}
          />
          <button className="btn primary" onClick={openLookup}>
            Open
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ margin: '28px 0 4px' }}>Launch Configs on GIWA Sepolia</h2>
        <p className="muted small">
          A Config is the reusable economics of a launch: supply, curve, fees, graduation.
          Read live from the Ammora Config registry — newest first.
          {loading && configs.length > 0 ? ` Reading… (${loaded} loaded)` : ''}
        </p>
        {error && <div className="notice error">{error}</div>}
        {loading && configs.length === 0 && !error && (
          <div className="empty">
            <h3>Reading the registry…</h3>
            <p>The public RPC is slow — this takes a few seconds.</p>
          </div>
        )}
        {!loading && configs.length === 0 && !error && (
          <div className="empty">
            <h3>No Configs registered yet</h3>
            <p>Nothing is registered on this deployment yet.</p>
          </div>
        )}
        <div className="grid">
          {configs.map((entry) => (
            <ConfigCard key={entry.configId.toString()} entry={entry} />
          ))}
        </div>
      </section>
    </>
  );
}
