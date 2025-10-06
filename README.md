# AMM: Automated Market Maker Trading System

## Description
AMM is a smart contract that creates a decentralized trading system on the Stacks blockchain. Think of it like setting up your own trading spots for different tokens where anyone can start a new trading pair, put in some tokens to get it going, and then others can come trade or add their own tokens too. When people trade they pay a tiny fee that goes back to whoever helped make the trading possible.

## What It Does
- **Create Trading Pools**: Set up trading pools that handle token swaps automatically.
- **Add Liquidity**: Liquidity providers earn fees from every trade.
- **Token Swapping**: Trade one token for another.
- **Remove Liquidity**: take your tokens back anytime you want.
- **Fee Collection**: Earn small fees from every trade in your pools.

## Key Features

# Liquidity Pools
Create trading pairs between any two tokens where people can swap back and forth automatically.

# Smart Trading
Your tokens are safely held by the contract and enable automatic price discovery based on supply and demand.

# Real-Time Fee Earnings
Liquidity providers earn fees continuously from trading activity, proportional to their pool share.

# Fair Pricing
Both traders and liquidity providers benefit from automatic price discovery based on supply and demand.

# Flexible Participation
Anyone can become a liquidity provider or trader with no special permissions needed.

## How It Works
1. **Create Pool**: Set up a trading pair between two tokens with initial liquidity.
2. **Add Liquidity**: People deposit equal values of both tokens to enable trading.
3. **Trading Happens**: Users swap tokens, paying small fees to liquidity providers.
4. **Earn Rewards**: Pool creators earn fees proportional to their share of the pool.

# Use Cases
- **Token Trading**: Swap between different cryptocurrencies instantly.
- **Passive Income**: Earn fees by providing liquidity to trading pairs.
- **Price Discovery**: Let markets determine fair exchange rates automatically.
- **Decentralized Exchange**: Trade without relying on centralized platforms.
- **New Token Support**: Help new tokens get initial trading liquidity.

# Contract Functions

# AMM Contract (`amm.clar`)
- `create-pool`: Set up new trading pairs between tokens.
- `add-liquidity`: Deposit tokens to earn fees from trades.
- `remove-liquidity`: Withdraw your tokens and collected fees.
- `swap`: Trade one token for another at current market rates.
- `get-pool-id`: Get a unique ID for a pool (hash of tokens and fee).
- `get-position-liquidity`: View your liquidity ownership in specific pools.
- `get-pool-data`: Check current state and balances of trading pools.

# Mock Token Contract (`mock-token.clar`)
- `transfer`: Move tokens between accounts.
- `mint`: Create new tokens for testing.
- `get-name`: Returns "Mock Token".
- `get-symbol`: Returns "MT".
- `get-decimals`: Returns 6 (for precision).
- `get-balance`: Check a user's token balance.
- `get-total-supply`: View total tokens in circulation.
- `get-token-uri`: Returns none (for learning).

# Slippage Protection Feature (New Addition)

## What I Added

# Smart Contract Enhancement
I added slippage protection to the `swap` function to protect traders from unfavorable price changes:

- **New Error Constant**: `ERR_INSUFFICIENT_OUTPUT_AMOUNT` (u209) - triggers when output is below minimum
- **New Parameter**: `min-amount-out` - minimum tokens the trader will accept
- **Protection Logic**: `(asserts! (>= amount-out min-amount-out) ERR_INSUFFICIENT_OUTPUT_AMOUNT)`
- **Updated Events**: Swap logs now include minimum amount for tracking
- **Comprehensive Tests**: Added test cases for slippage protection scenarios

# Frontend Implementation (`frontend/` folder)

Built a complete web interface to interact with the AMM contract:

**Features:**
- **Wallet Connection**: Integrates with Leather wallet (supports other Stacks wallets too)
- **Slippage Settings**: Choose tolerance level (0.5%, 1%, or 5%)
- **Live Calculations**: Shows expected output based on AMM formula, displays minimum tokens you'll accept (slippage protection), real-time updates as you adjust amount or slippage
- **Transaction Execution**: Sends swap transaction to blockchain with protection
- **Error Handling**: Detects when slippage protection triggers (ERR 209)

**Files:**
- `frontend/index.html` - User interface with swap form and slippage controls
- `frontend/app.js` - JavaScript logic with detailed comments 

## How Slippage Protection Works

When you swap tokens, the price might change between when you click "swap" and when the transaction processes. Slippage protection ensures you don't get a worse deal than expected

1. **You set tolerance**: Choose 0.5% (strict), 1% (balanced), or 5% (flexible)
2. **App calculates minimum**: If you expect 1000 tokens with 1% slippage, minimum is 990 tokens
3. **Contract enforces**: If actual output < 990 tokens, transaction fails with ERR 209
4. **You're protected**: Your tokens are safe, try again with higher slippage or better timing

# Testing the Frontend

1. **Install Leather Wallet**: Get it from https://leather.io/install-extension
2. **Switch to Testnet4**: In Leather settings, change network to Testnet4
3. **Open Frontend**: Open `frontend/index.html` in your browser
4. **Connect Wallet**: Click "Connect Wallet" and approve in Leather
5. **Test Swap**: Enter amount (e.g., 100000), select slippage (try 0.5% for strict protection), click "Execute Swap", approve in Leather popup
6. **Watch Protection**: If price moves too much, you'll see "Slippage Protection Triggered!"

# Testing & Development
1. Install Clarinet from https://github.com/hirosystems/clarinet/releases
2. Create a new project: clarinet new amm
3. Copy both contract files from this repository to the amm/contracts folder
4. Validate contracts: `clarinet check`
5. Run tests: `clarinet test`

----

# Author
Timothy Terese Chimbiv, created for the Stacks Ascent program.
Version: 3.0