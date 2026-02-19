# ETH Indexer

A full-stack Ethereum deposit indexer that monitors the Sepolia testnet for incoming ETH transactions and automatically credits user balances — similar to how centralized exchanges (e.g. Binance) handle deposits.

## Architecture

```
┌─────────────┐       polls blocks       ┌──────────────┐
│   Frontend   │ ──────────────────────► │  Sepolia RPC  │
│  (Indexer)   │                         └──────────────┘
│              │  GET /txn  ──────────►  ┌──────────────┐
│              │  POST /txn ──────────►  │   Backend    │
└─────────────┘                          │  (Express)   │
                                         │              │
                                         │  PostgreSQL  │
                                         └──────────────┘
```

## Tech Stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Backend  | Node.js, Express 5, TypeScript, PostgreSQL   |
| Frontend | Node.js, TypeScript, ethers.js v6, Axios     |
| Security | bcrypt, AES-256-CBC encryption, Helmet, CORS |
| Wallet   | HD Wallet (BIP-39 mnemonic → derived keys)   |

## Features

- **HD Wallet derivation** — each user gets a unique deposit address derived from a single mnemonic using BIP-44 paths.
- **Private key encryption** — user private keys are encrypted at rest with AES-256-CBC.
- **Multi-RPC fallback** — the indexer uses a `FallbackProvider` with Alchemy + public Sepolia RPCs for reliability.
- **6-block confirmation** — deposits are only credited after 6 block confirmations to prevent reorg issues.
- **Automatic balance crediting** — detected deposits are POSTed to the backend, which updates user balances in a single DB transaction.

## Getting Started

### Prerequisites

- Node.js ≥ 18
- PostgreSQL (or Docker: `docker run -d --name my-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres`)
- Alchemy API key (Sepolia)


### 1. Database Setup

```sql
-- Run the migration
\i backend/migrations/init.sql
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mynewdb
MNEMONIC=<your 12-word BIP-39 mnemonic>
ENCRYPTION_KEY=<exactly 32 characters>
```

```bash
npm run build
npm start        # runs on port 3000
```

### 3. Frontend (Indexer)

```bash
cd frontend
npm install
```

Create a `.env` file:

```env
ALCHEMY_RPC_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
SEPOLIA_PUBLIC_RPC=https://rpc.sepolia.org
```

```bash
npm start        # starts listening for new blocks
```

## API Endpoints

| Method | Path   | Description                              |
| ------ | ------ | ---------------------------------------- |
| POST   | /signup | Create a new user with derived HD wallet |
| GET    | /txn   | List all monitored deposit addresses     |
| POST   | /txn   | Credit a user's balance after a deposit  |

## License

[MIT](LICENSE)
