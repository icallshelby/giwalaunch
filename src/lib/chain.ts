import { createPublicClient, custom, defineChain, http, type PublicClient, type Transport } from 'viem';
import { giwaSepoliaAutoRouteDeployment } from '@ammora-protocol/sdk';

/** GIWA Sepolia testnet (OP Stack L2). Chain id 91342, gas in ETH. */
export const GIWA_SEPOLIA = defineChain({
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://sepolia-rpc.giwa.io'] },
  },
  blockExplorers: {
    default: { name: 'GIWA Sepolia Explorer', url: 'https://sepolia-explorer.giwa.io' },
  },
});

export const RPC_PRIMARY = 'https://sepolia-rpc.giwa.io';
export const RPC_FALLBACK = 'https://giwa-sepolia-testnet.api.pocket.network';
export const EXPLORER = 'https://sepolia-explorer.giwa.io';
export const FAUCET_URLS = ['https://faucet.giwa.io', 'https://faucet.lambda256.io/giwa-sepolia'];

/** The reviewed V4 auto-route deployment catalog shipped with SDK 0.3.9. */
export const DEPLOYMENT = giwaSepoliaAutoRouteDeployment;

export const CORE = {
  configRegistry: DEPLOYMENT.contracts.launch.configRegistry,
  launchFactory: DEPLOYMENT.contracts.launch.factory,
  graduationAdapter: DEPLOYMENT.contracts.launch.graduationAdapter,
  feePolicy: DEPLOYMENT.contracts.launch.feePolicy,
} as const;

/**
 * Paced HTTP transport: the public GIWA RPC is rate-limited and counts
 * each JSON-RPC method. Serialize calls with a 600ms gap (same policy as
 * the Ammora examples repo). No automatic retries, no writes.
 */
export function pacedHttp(url: string, intervalMs = 600): Transport {
  let tail: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  const base = http(url, { retryCount: 0 });
  return (parameters) => {
    const transport = base(parameters);
    return custom({
      request: (args) => {
        const result = tail.then(async () => {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(0, nextStart - Date.now())),
          );
          try {
            return await transport.request(args);
          } finally {
            nextStart = Date.now() + intervalMs;
          }
        });
        tail = result.catch(() => undefined);
        return result;
      },
    }, { retryCount: 0 })(parameters);
  };
}

let primaryClient: PublicClient | null = null;
let fallbackClient: PublicClient | null = null;

export function getPrimaryClient(): PublicClient {
  if (!primaryClient) {
    primaryClient = createPublicClient({
      chain: GIWA_SEPOLIA,
      transport: pacedHttp(RPC_PRIMARY),
    });
  }
  return primaryClient;
}

export function getFallbackClient(): PublicClient {
  if (!fallbackClient) {
    fallbackClient = createPublicClient({
      chain: GIWA_SEPOLIA,
      transport: pacedHttp(RPC_FALLBACK),
    });
  }
  return fallbackClient;
}

/**
 * Run a read against the primary RPC; on any failure, retry once against
 * the Pocket fallback. Throws the fallback error if both fail, so the UI
 * can show an honest error state instead of stale or fake data.
 */
export async function withRpcFallback<T>(fn: (client: PublicClient) => Promise<T>): Promise<T> {
  try {
    return await fn(getPrimaryClient());
  } catch (primaryError) {
    try {
      return await fn(getFallbackClient());
    } catch {
      throw primaryError;
    }
  }
}

export function explorerAddress(address: string): string {
  return `${EXPLORER}/address/${address}`;
}

export function explorerTx(hash: string): string {
  return `${EXPLORER}/tx/${hash}`;
}
