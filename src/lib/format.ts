/** Small display helpers. Amounts stay `bigint` until the last moment;
 *  formatting is display-only and never feeds a transaction. */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatEth(value: bigint, decimals = 18, maxFrac = 6): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const whole = abs / unit;
  const frac = abs % unit;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fracStr ? `.${fracStr}` : ''}`;
}

export function formatUsdLike(value: bigint, decimals: number): string {
  return formatEth(value, decimals, 4);
}

/** "0.05 WETH" style: raw amount + token decimals + symbol. */
export function formatToken(value: bigint, decimals: number, symbol: string): string {
  return `${formatEth(value, decimals)} ${symbol}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;
}

export function formatBlock(n: bigint | number): string {
  return Number(n).toLocaleString('en-US');
}

export function timeAgo(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
