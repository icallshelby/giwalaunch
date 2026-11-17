import { shortAddress } from '../lib/format';
import { FAUCET_URLS } from '../lib/chain';
import type { WalletState } from '../hooks/useWallet';

interface HeaderProps {
  route: string;
  wallet: WalletState;
}

export function Header({ route, wallet }: HeaderProps) {
  const link = (hash: string, label: string) => (
    <a href={hash} className={route === hash ? 'active' : ''}>
      {label}
    </a>
  );
  return (
    <header className="site">
      <div className="header-inner">
        <a href="#/" className="logo">
          Giwa<b>Launch</b>
        </a>
        <nav className="main">
          {link('#/', 'Discover')}
          {link('#/launch', 'Launch a token')}
          {link('#/fees', 'Fees')}
        </nav>
        <div className="header-right">
          <span className="chain-badge" title="GIWA Sepolia testnet">
            <span className="dot" /> GIWA Sepolia · 91342
          </span>
          <a className="btn small ghost" href={FAUCET_URLS[0]} target="_blank" rel="noreferrer">
            Faucet ↗
          </a>
          {wallet.account ? (
            <button
              className="btn small"
              onClick={wallet.disconnect}
              title="Disconnect (local only — nothing is signed)"
            >
              {shortAddress(wallet.account)} · Disconnect
            </button>
          ) : (
            <button className="btn small primary" onClick={wallet.connect} disabled={wallet.connecting}>
              {wallet.connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
      {wallet.error && (
        <div className="header-inner" style={{ paddingTop: 0 }}>
          <div className="notice error" style={{ margin: 0, flex: 1 }}>
            {wallet.error}
            {!wallet.hasProvider && (
              <>
                {' '}
                Open this site from the in-app browser of Rabby or MetaMask on your phone —
                a regular mobile browser cannot sign.
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
