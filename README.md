# M3 PriceCall

**Live app:** https://m3-pulse.vercel.app
**Repo:** https://github.com/Wots18/m3-pulse
**Built for:** Unicity Builder Program (Sphere SDK track)

A real-money price-direction prediction market built on Unicity's Sphere SDK. Players stake UCT on whether an asset's price will go **UP**, **DOWN**, or stay **FLAT** over a 5-minute round. Payment happens through an actual connected Sphere wallet, payouts are computed and sent automatically with no human in the loop, and every bet and result is confirmed to the player via a Sphere direct message.

Started from Unicity's reference repo (`unicity-sphere/single-digit-lottery`, a random-digit draw) and rebuilt into a market resolved against real price data.

## How it works

**Rounds.** Every 5 minutes a new round opens on a rotating asset (21 markets: BTC, ETH, SOL, XRP, BNB, DOGE, TON, ADA, LINK, AVAX, DOT, LTC, ATOM, UNI, NEAR, TRX, BCH, SHIB, MATIC, ICP, OKB) and captures its live USD price from CoinGecko. Players call UP, DOWN, or FLAT before the round closes. At close, the round captures the price again and resolves against whichever direction actually happened.

**Payment.** The frontend connects to the player's real Sphere wallet via Sphere Connect (ConnectClient / autoConnect) and sends a real intent('send', ...) - an actual wallet approval prompt, not a typed nametag. The backend agent receives it over the wallet-api delivery rail and matches the transfer to the player's bet by memo (a unique invoice ID), then confirms the bet.

**Payouts - fully automatic, self-funding.** This is a parimutuel market: every round's pool is the losing bets from that round, so the agent never needs outside funding to pay winners. When a round closes, a scheduled job computes the winning direction, takes a 5% house fee off the top, and splits the remaining pool proportionally among winning bets - then sends the tokens directly to each winner's wallet. No admin action, no manual payout button, anywhere in the flow.

**Notifications.** The agent sends the player a Sphere direct message the moment their bet is confirmed, and another when the round resolves (win, with payout amount, or loss) - using the SDK's messaging module alongside its payments module.

## Try it

1. Open the live app: https://m3-pulse.vercel.app
2. Connect your Sphere wallet (extension or the sphere.unicity.network popup)
3. Pick UP, DOWN, or a small UCT amount, and confirm the payment prompt in your wallet
4. Watch for the Sphere DM confirming your call is locked in
5. When the round closes (up to 5 min), watch for the result DM - winners get paid automatically, no waiting on anyone

## Architecture

- frontend/ - Vite + React + TypeScript, with Sphere Connect integration for wallet connection and payment intents
- backend/ - Node + Express + MongoDB + TypeScript
  - sphere.service.ts - agent identity, wallet-api delivery rail, incoming payment matching, DM sending
  - round-scheduler.service.ts - round lifecycle timer
  - game.service.ts - round creation, resolution, parimutuel payout math, bet + payment state
  - price.service.ts - live price feed (CoinGecko)

**Network:** Unicity testnet2
**Coin:** UCT (native testnet coin, 18 decimals) - f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0
**Agent nametag:** @m3pricecall02
**SDK:** @unicitylabs/sphere-sdk ^0.11.14

## What's next

- Let players pick which of the 21 markets to bet on directly, instead of the automatic per-round rotation
- Remove the temporary /api/debug/* diagnostic endpoints used during development (already stripped from the submitted build)
