# BytePay

A lightweight blockchain-powered payment server built with Node.js and Express.

- Every account has a unique address that **starts with `by1`**
- Every transfer is **digitally signed** (Ed25519)
- Transactions are grouped into blocks linked together with **SHA-256 hashes**
- Includes a static info website served at the root URL

> **Note:** BytePay is a learning and demo project, not a real-world currency. All data is stored in memory, so balances and blocks reset whenever the server restarts.

## Getting Started

### 1. Install Node.js

Download and install the **LTS** version of Node.js from [nodejs.org](https://nodejs.org).

Check that it is installed:

```bash
node -v
npm -v
```

### 2. Initialize the project

Open a terminal in the project folder and run:

```bash
npm init -y
```

### 3. Install the required packages

```bash
npm install express
```

`crypto` and `path` are built into Node.js, so they don't need to be installed.

### 4. Run the server

```bash
node bytepayServer.js
```

You should see:

```
BytePay server is now running on port 5000
```

Then open [http://localhost:5000](http://localhost:5000) in your browser.

## Project Structure

```
BytePay/
├── bytepayServer.js   # Express server and blockchain logic
├── package.json
└── public/
    └── index.html     # Info website served at "/"
```

## API Reference

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `POST` | `/create` | Create a new account and receive the starting balance |
| `POST` | `/send` | Send coins using a signed transaction |
| `GET` | `/balance/:address` | Check the balance of an address |
| `GET` | `/nonce/:address` | Get the next nonce to use for an address |
| `GET` | `/chain` | View all blocks and pending transactions |
| `GET` | `/validate` | Verify the integrity of the blockchain |

### Create an account

```bash
curl -X POST http://localhost:5000/create
```

Response:

```json
{
  "address": "by1...",
  "publicKey": "-----BEGIN PUBLIC KEY-----...",
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}
```

The private key is returned only in this demo mode. Keep it secret, since anyone who has it can spend your coins. In a real setup, the client generates its own key pair and sends only the public key:

```json
{ "publicKey": "-----BEGIN PUBLIC KEY-----..." }
```

### Send coins

1. Get the next nonce from `GET /nonce/:address`.
2. Sign the message `from:to:amount:nonce` with your private key:

   ```javascript
   const crypto = require("crypto");

   const signature = crypto
     .sign(null, Buffer.from(`${from}:${to}:${amount}:${nonce}`), privateKeyPem)
     .toString("base64");
   ```

3. Send the request:

   ```bash
   curl -X POST http://localhost:5000/send \
     -H "Content-Type: application/json" \
     -d '{"from":"by1...","to":"by1...","amount":5,"nonce":1,"signature":"..."}'
   ```

## How It Works

1. **Create an account.** A key pair is created, and the address is derived from the public key. The account starts with 10 coins.
2. **Sign a transaction.** The sender signs `from:to:amount:nonce` with their private key.
3. **Verification.** The server checks the signature, nonce, amount, and balance.
4. **Balances update.** Coins move from the sender to the recipient, and the transaction joins the pending list.
5. **Block creation.** Once 3 transactions are pending, they are sealed into a new block linked to the previous block by its hash.

## Rules Enforced by the Server

- Amounts must be positive whole numbers
- Both sender and recipient must exist
- You cannot send coins to yourself
- Nonces must increase by exactly 1 (prevents replay attacks)
- Signatures must be valid for the sender's public key
- Account creation is limited to one per IP address per minute

## Configuration

These values are at the top of `bytepayServer.js`:

| Constant | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `5000` | Port the server listens on |
| `BLOCK_SIZE` | `3` | Transactions per block |
| `FAUCET_AMOUNT` | `10` | Starting balance for new accounts |
| `FAUCET_COOLDOWN_MS` | `60000` | Cooldown between account creations per IP |

## Troubleshooting

- **`EADDRINUSE` error:** the port is already in use. Stop the other process or change `PORT` in `bytepayServer.js`. On macOS, port 5000 is often used by AirPlay Receiver, so try `5001`.
- **`Cannot find module 'express'`:** run `npm install express` in the project folder.
- **`Cannot GET /`:** make sure `public/index.html` exists next to `bytepayServer.js`.

## License

This project is for learning and demonstration purposes.
