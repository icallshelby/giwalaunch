import { useCallback, useEffect, useState } from 'react';
import type { Address } from 'viem';
import { connectWallet, hasInjectedWallet } from '../lib/wallet';

export interface WalletState {
  account: Address | null;
  hasProvider: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [account, setAccount] = useState<Address | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasProvider = hasInjectedWallet();

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const address = await connectWallet();
      setAccount(address);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAccount(null), []);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const onAccounts = (accounts: unknown) => {
      const list = accounts as string[];
      setAccount(list && list.length > 0 ? (list[0] as Address) : null);
    };
    const onChain = () => {
      // Re-check the account on chain change; a wrong chain shows the
      // switch prompt again on next connect.
      setAccount((a) => a);
    };
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged', onChain);
    };
  }, []);

  return { account, hasProvider, connecting, error, connect, disconnect };
}
