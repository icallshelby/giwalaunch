import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Discover } from './pages/Discover';
import { Launch } from './pages/Launch';
import { Fees } from './pages/Fees';
import { Token } from './pages/Token';
import { useWallet } from './hooks/useWallet';

export type Route =
  | { name: 'discover' }
  | { name: 'launch' }
  | { name: 'fees' }
  | { name: 'token'; address: string };

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/token/')) {
    return { name: 'token', address: hash.slice('/token/'.length) };
  }
  if (hash === '/launch') return { name: 'launch' };
  if (hash === '/fees') return { name: 'fees' };
  return { name: 'discover' };
}

function routeKey(route: Route): string {
  if (route.name === 'token') return `#/token/${route.address}`;
  if (route.name === 'launch') return '#/launch';
  if (route.name === 'fees') return '#/fees';
  return '#/';
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const wallet = useWallet();

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <Header route={routeKey(route)} wallet={wallet} />
      <main className="container">
        {route.name === 'discover' && <Discover wallet={wallet} />}
        {route.name === 'launch' && <Launch wallet={wallet} />}
        {route.name === 'fees' && <Fees wallet={wallet} />}
        {route.name === 'token' && <Token address={route.address} wallet={wallet} />}
      </main>
      <footer className="site">
        <div className="container">
          <strong>GiwaLaunch</strong> — launchpad on GIWA Sepolia (chain 91342) built with the
          Ammora SDK 0.3.9. <strong>Testnet only.</strong> Nothing here is real money:
          tokens launched here are testnet tokens with no market value. Data is read
          live from GIWA Sepolia contracts via the Ammora SDK; if a value is not on
          chain yet, the page says so instead of inventing it. Built for the Ammora
          Builder Mission, Season 2.
        </div>
      </footer>
    </>
  );
}
