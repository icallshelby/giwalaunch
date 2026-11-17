import { createWalletClient, custom, type Address, type WalletClient } from 'viem';
import { GIWA_SEPOLIA, RPC_FALLBACK, RPC_PRIMARY } from './chain';

export const GIWA_CHAIN_ID_HEX = '0x164a6'; // 91342

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      isRabby?: boolean;
    };
  }
}

export function hasInjectedWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum;
}

export function getWalletClient(): WalletClient | null {
  if (!window.ethereum) return null;
  return createWalletClient({
    chain: GIWA_SEPOLIA,
    transport: custom(window.ethereum),
  });
}

async function ensureGiwaChain(): Promise<void> {
  const eth = window.ethereum;
  if (!eth) throw new Error('No injected wallet found.');
  const chainId = (await eth.request({ method: 'eth_chainId' })) as string;
  if (chainId.toLowerCase() === GIWA_CHAIN_ID_HEX) return;
  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GIWA_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const e = err as { code?: number };
    if (e?.code !== 4902) throw err;
    await eth.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: GIWA_CHAIN_ID_HEX,
          chainName: 'GIWA Sepolia',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [RPC_PRIMARY, RPC_FALLBACK],
          blockExplorerUrls: ['https://sepolia-explorer.giwa.io'],
        },
      ],
    });
  }
}

/** Request account access and switch to GIWA Sepolia. Returns the address. */
export async function connectWallet(): Promise<Address> {
  if (!window.ethereum) {
    throw new Error(
      'No wallet detected in this browser. Open this site from the in-app browser of Rabby or MetaMask on your phone.',
    );
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  if (!accounts || accounts.length === 0) throw new Error('No account selected.');
  await ensureGiwaChain();
  return accounts[0] as Address;
}
