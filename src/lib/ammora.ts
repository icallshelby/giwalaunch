import {
  AMMORA_FEE_POLICY_VERSION,
  AmmoraV4LaunchCurveClient,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
  buildClaimFeeVaultFor,
  classifyAmmoraV4ExactInputFill,
  feeVaultAbi,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4NextConfigId,
  verifyAmmoraV4CoreAtBlock,
} from '@ammora-protocol/sdk';
import {
  encodeFunctionData,
  erc20Abi,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { CORE, getPrimaryClient, withRpcFallback } from './chain';

/** The template Config the GiwaLaunch Config will be based on (verified on-chain 17 Nov 2026). */
export const TEMPLATE_CONFIG_ID = 6n;
export const TEMPLATE_CONFIG_HASH =
  '0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667';

/** GiwaLaunch's own Config — created in Fase 1 (pending user wallet decision). */
export const GIWALAUNCH_CONFIG_ID: bigint | null = null;

export type ConfigEntry = Awaited<ReturnType<typeof getAmmoraV4ConfigAtBlock>>;
export type CurveState = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient['getStateAtBlock']>
>;
export type CurveQuote = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient['quoteExactInputAtBlock']>
>;

export const CURVE_STATUS_LABELS = [
  'Uninitialized',
  'Active',
  'Ready to migrate',
  'Migrated',
] as const;

async function latestBlock(client: PublicClient): Promise<bigint> {
  return client.getBlockNumber();
}

/** Newest-first Config list (default: latest 10). Reads are sequential
 *  and paced — the public RPC rate-limits bursts. */
export async function listConfigs(limit = 10): Promise<ConfigEntry[]> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    const nextId = await getAmmoraV4NextConfigId(client, CORE.configRegistry, block);
    const ids: bigint[] = [];
    for (let id = nextId - 1n; id >= 1n && ids.length < limit; id--) ids.push(id);
    const entries: ConfigEntry[] = [];
    for (const id of ids) {
      entries.push(await getAmmoraV4ConfigAtBlock(client, CORE.configRegistry, id, block));
    }
    return entries;
  });
}

export async function getConfig(configId: bigint): Promise<ConfigEntry> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    return getAmmoraV4ConfigAtBlock(client, CORE.configRegistry, configId, block);
  });
}

/** Template #6 economics (verified on-chain): the numbers the Launch
 *  form previews before the GiwaLaunch Config exists. */
export async function getTemplateConfig(): Promise<ConfigEntry> {
  return getConfig(TEMPLATE_CONFIG_ID);
}

export interface VerifiedCurve {
  curve: Address;
  token: Address;
  state: CurveState;
  blockNumber: bigint;
}

/** Read + authenticate a curve: core verified at the block, contract
 *  code present, and factory binding (tokenForCurve) matches the state.
 *  Throws on any mismatch — the UI must show an error, never the curve. */
export async function getVerifiedCurve(curve: Address): Promise<VerifiedCurve> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    await verifyAmmoraV4CoreAtBlock(client, CORE, block);
    const code = await client.getBytecode({ address: curve, blockNumber: block });
    if (!code || code === '0x') {
      throw new Error(`No contract at ${curve} on GIWA Sepolia (block ${block}).`);
    }
    const sdk = new AmmoraV4LaunchCurveClient(client, curve, CORE);
    const state = await sdk.getStateAtBlock(block);
    if (state.asOfBlock !== block) throw new Error('Curve state is from a different block.');
    const factoryToken = await client.readContract({
      address: CORE.launchFactory,
      abi: ammoraLaunchFactoryV4Abi,
      functionName: 'tokenForCurve',
      args: [curve],
      blockNumber: block,
    });
    if (
      factoryToken === zeroAddress ||
      factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
      state.feePolicy.toLowerCase() !== CORE.feePolicy.toLowerCase() ||
      state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
    ) {
      throw new Error('Curve is not bound to the reviewed V4 factory and fee policy.');
    }
    return { curve, token: factoryToken, state, blockNumber: block };
  });
}

export async function quoteCurve(
  curve: Address,
  amountIn: bigint,
  baseForQuote: boolean,
): Promise<{ quote: CurveQuote; fill: ReturnType<typeof classifyAmmoraV4ExactInputFill> }> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    const sdk = new AmmoraV4LaunchCurveClient(client, curve, CORE);
    const quote = await sdk.quoteExactInputAtBlock(amountIn, baseForQuote, block);
    if (quote.asOfBlock !== block) throw new Error('Curve quote is from a different block.');
    return { quote, fill: classifyAmmoraV4ExactInputFill(quote, baseForQuote) };
  });
}

export interface SwapPlan {
  state: CurveState;
  amountOut: bigint;
  minimumAmountOut: bigint;
  fillKind: string;
  tokenOut: Address;
  baseForQuote: boolean;
  tx: { to: Address; data: Hex };
  approval: { token: Address; spender: Address; amount: bigint };
}

/**
 * Unsigned exact-input swap plan on a curve (mirrors the reviewed
 * `planCurveAtBlock` in the Ammora examples repo). Returns the plan only —
 * nothing is signed or sent here. The caller shows approval / target /
 * recipient / minimum output and only then asks the wallet to sign.
 * Slippage default 50 bps (0.5%). Ordinary swaps must fill in full.
 */
export async function planSwap(
  curve: Address,
  tokenIn: Address,
  amountIn: bigint,
  recipient: Address,
  slippageBps = 50,
): Promise<SwapPlan> {
  if (amountIn <= 0n) throw new Error('Amount must be positive.');
  if (slippageBps < 0 || slippageBps > 1000) throw new Error('Slippage must be 0–1000 bps.');
  const client = getPrimaryClient();
  const block = await latestBlock(client);
  await verifyAmmoraV4CoreAtBlock(client, CORE, block);
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, CORE);
  const state = await sdk.getStateAtBlock(block);
  const factoryToken = await client.readContract({
    address: CORE.launchFactory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: 'tokenForCurve',
    args: [curve],
    blockNumber: block,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== CORE.feePolicy.toLowerCase() ||
    state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
  ) {
    throw new Error('Curve is not bound to the reviewed V4 factory and fee policy.');
  }
  if (state.status !== 1) throw new Error(`Curve status ${state.status} is not active.`);
  const baseForQuote = tokenIn.toLowerCase() === state.baseToken.toLowerCase();
  if (!baseForQuote && tokenIn.toLowerCase() !== state.quoteToken.toLowerCase()) {
    throw new Error('tokenIn is not a curve asset.');
  }
  const quote = await sdk.quoteExactInputAtBlock(amountIn, baseForQuote, block);
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  if (fill.kind !== 'full') {
    throw new Error(`Unexpected fill ${fill.kind}; ordinary orders must fill in full.`);
  }
  const minimumAmountOut = (quote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  if (minimumAmountOut === 0n) throw new Error('Minimum output rounds to zero.');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  return {
    state,
    amountOut: quote.amountOut,
    minimumAmountOut,
    fillKind: fill.kind,
    tokenOut: baseForQuote ? state.quoteToken : state.baseToken,
    baseForQuote,
    tx: {
      to: curve,
      data: encodeFunctionData({
        abi: ammoraLaunchPoolV4Abi,
        functionName: 'swapExactInput',
        args: [amountIn, minimumAmountOut, baseForQuote, false, recipient, deadline],
      }),
    },
    approval: { token: tokenIn, spender: curve, amount: amountIn },
  };
}

/** ERC-20 metadata (name / symbol / decimals) for a token address. */
export async function getTokenMeta(token: Address): Promise<{
  name: string;
  symbol: string;
  decimals: number;
}> {
  return withRpcFallback(async (client) => {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    return { name, symbol, decimals };
  });
}

/** ERC-20 balance of an address. */
export async function getTokenBalance(token: Address, owner: Address): Promise<bigint> {
  return withRpcFallback(async (client) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    }),
  );
}

/** ERC-20 allowance (owner -> spender). */
export async function getAllowance(
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return withRpcFallback(async (client) =>
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, spender],
    }),
  );
}

/** The FeeVault for the launch factory — creator/partner fees settle here. */
export async function getFeeVault(): Promise<Address> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    return client.readContract({
      address: CORE.launchFactory,
      abi: ammoraLaunchFactoryV4Abi,
      functionName: 'feeVault',
      blockNumber: block,
    }) as Promise<Address>;
  });
}

/** Claimable fee balance for a beneficiary in the FeeVault, per fee token. */
export async function getClaimable(
  feeVault: Address,
  feeToken: Address,
  beneficiary: Address,
): Promise<bigint> {
  return withRpcFallback(async (client) => {
    const block = await latestBlock(client);
    return client.readContract({
      address: feeVault,
      abi: feeVaultAbi,
      functionName: 'claimable',
      args: [feeToken, beneficiary],
      blockNumber: block,
    });
  });
}

/** Unsigned FeeVault claim plan (to + data). The SDK builder returns only
 *  the calldata — the call targets the FeeVault itself. The caller asks the
 *  wallet to sign only after showing it. Payout defaults to the beneficiary. */
export function buildFeeClaimPlan(
  feeVault: Address,
  feeToken: Address,
  beneficiary: Address,
  recipient: Address = beneficiary,
): { to: Address; data: Hex } {
  const { data } = buildClaimFeeVaultFor(feeToken, beneficiary, recipient);
  return { to: feeVault, data };
}

/** Quote token of the deployment (canonical WETH on OP Stack chains). */
export const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address;
