# GiwaLaunch

Launchpad on **GIWA Sepolia** (chain 91342) built with the **Ammora SDK 0.3.9**.
Built for the Ammora Builder Mission, Season 2.

**Testnet only.** Nothing here is real money — tokens launched here are testnet
tokens with no market value.

## What it does

- **Discover** — live launch Configs from the Ammora registry (newest first),
  plus a lookup by curve address.
- **Token page** — verified curve state (factory binding checked on-chain),
  graduation progress, a bonding-curve chart sampled from live quotes, and
  Buy/Sell with plan → exact-amount approve → swap. Graduate button appears
  when a curve is ready to migrate.
- **Launch** — form + unsigned preview of the economics of template Config #6.
  Token creation opens once the GiwaLaunch Config is created (Fase 1).
- **Fees** — fee schedule, FeeVault address, claimable WETH for the connected
  wallet, and a claim button.

## Data honesty

All numbers come from GIWA Sepolia contracts via the Ammora SDK. If a value is
not on chain yet, the page says so instead of inventing it. No fake TVL, no
fake volume, no fake tokens.

## Run it

```bash
npm ci
npm run dev     # local dev server
npm run build   # typecheck + production build -> dist/
```

Deploy is GitHub Pages via `.github/workflows/pages.yml` (push to `main`).

## Verified on-chain (17 Nov 2026, Fase 0 spike)

- SDK `@ammora-protocol/sdk@0.3.9`, chain 91342, auto-route V4 deployment.
- Template Config **#6**: hash
  `0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667`,
  graduation threshold **0.05 WETH**, total supply 1,000,000,000 tokens
  (9 decimals), cliff fee 1%, creator share 30% of non-protocol fees,
  pool creation fee **0**, LP split partner 62.5% / creator 37.5% permanent
  locked, migration mode concentrated.
- RPCs: primary `sepolia-rpc.giwa.io` (fast, ~2.7s for 4 reads) and fallback
  Pocket `giwa-sepolia-testnet.api.pocket.network` (works, ~13.6s).
- Gas ~0.001 gwei — a 300k-gas tx costs ≈ 0.0000003 ETH. The budget is the
  0.05 WETH graduation threshold, not gas: ≈ 4 days of faucet claims
  (0.005 + 0.01 ETH/day from the two GIWA faucets).

See `../BUILD.md` for the full spike record and the pending user items.
