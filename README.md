# Token Radar — token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hudobeld/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hudobeld/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols,
ranks the pre-token ones by what a token launch would be worth if the record
stayed as it is, and gives every ranked protocol a concrete six-step farm plan.
Live-token protocols are kept apart and shown at their real market caps.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22+ (standard library only, no install). `main.ts` reads the snapshot,
writes `out/board.json` (198 rows), `out/data.js`, copies `dashboard/` and
`screenshots/` into `out/`, and writes `out/dossier.json` with
`vendor/makefun-board.ts`. Two runs write byte-identical output.

Serve the built dashboard locally and open it in a browser:

```sh
node serve.mjs out
```

Then open the printed address. Screenshots live in `screenshots/` and are
rebuilt with `work/shots.sh` (headless Chromium, 1440×900).

## The model (radar-2)

```
implied value = TVL × category multiple × growth multiplier × maturity multiplier
```

- **Category multiple** — the median market-cap / TVL of the live-token
  protocols in the same category, computed at run time from the snapshot.
  A category with fewer than 3 live samples falls back to the global median
  (0.205 on this snapshot). Clamped to 0.05–1.50. No protocol name is ever
  special-cased; the same function scores every row.
- **Growth multiplier** — 1 + clamp(7d TVL change, −60%, +120%) / 100 × 0.5.
  No reported change counts as 0%.
- **Maturity multiplier** — 0.6 + min(age in days, 1095) / 1095 × 0.4, so a
  protocol tracked for 3 years scores 1.00 and a new one 0.60. Unknown age
  counts as 365 days.

The board ranks all 198 rankable pre-token protocols: the snapshot's whole
40-protocol watchlist, plus 158 further pre-token protocols the watchlist
leaves out (138 below the $50M floor, 20 above it). A further 91 pre-token
protocols are left out entirely: the board applies the watchlist's own rule
to every row, so bridged, staked, wrapped, versioned and exchange-branded
products of a token that already trades are excluded wherever they sit —
without that rule the top of the board would be Coinbase Bridge, WBTC and
Binance Bitcoin. Rank 1 is the largest implied value. On this snapshot the
top of the board is Steakhouse Financial, Sentora Curator, Gauntlet and Veda,
and the board's implied values total about $3.6B — the dashboard shows the
exact total at run time. One limit the snapshot forces on the rule: each
record carries ten fields and no parent-protocol field, so a product of
another protocol whose own record does not name it as one cannot be excluded
automatically; the dashboard's Model page says so plainly.

## Farm plans

Each row carries 6 steps, each ending with its cost and time. Steps are
derived from the protocol's own record: the action follows its category
(lending supply/borrow, DEX liquidity, vault deposit, RWA mint-and-hold,
perpetual margin, bridge, stake, and so on); gas follows its main chain
(Ethereum dear, L2s and Solana cheap); capital follows its TVL ($50–$300);
the hold window follows its age (30–90 days). Every plan also covers a fresh
wallet, a weekly qualifying action, checking the protocol's own points page
before claiming, never paying to claim, and keeping a farm log.

## The dashboard

Dark "radar" theme, system fonts only, zero network: all data comes from
`window.RADAR` in `data.js`, rendered client-side. Three views:

- **Board** — sortable columns, text search, category / chain / minimum-TVL
  filters, watchlist-only switch, paged at 50 rows with "Show more".
  Click a row for the detail drawer: full fields, the model breakdown with
  real numbers, and the 6 farm steps.
- **Live tokens** — the top 30 live-token protocols by market cap, labelled
  as market values, never implied values.
- **Model & method** — the formula, the category-multiple table computed
  from this snapshot, how to read the board, and the disclaimer.

URL parameters set the initial state (used for the screenshots):
`?tab=live|model`, `?detail=<slug>`, `?filter=watchlist`,
`?category=RWA`, `?chain=Ethereum`, `?q=<text>`, `?mintvl=50000000`.

## Wording

A protocol on the board "records no token" in the snapshot — never "has no
token". The snapshot is DefiLlama's record, not proof, and implied value is
this entry's own claim: it does not predict whether or when a token is issued.

## Layout

```
main.ts                  entrypoint (Node stdlib only)
lib/model.ts             value model, farm plans, snapshot parsing, board self-check
vendor/makefun-board.ts  make.fun dossier library (copied byte-for-byte from the kit)
dashboard/               index.html, app.css, app.js (static, no network)
screenshots/             1-board.png, 2-detail.png, 3-filtered.png
work/                    check.mjs (gate self-check), shots.sh (screenshot helper)
serve.mjs                tiny static server for local viewing
LICENSE                  MIT (from the kit starter)
```
