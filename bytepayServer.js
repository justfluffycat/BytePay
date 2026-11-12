const express = require("express");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(express.json({ limit: "10kb" }));

// ====== Configuration ======
const PORT = 5000;
const BLOCK_SIZE = 3;               // transactions per block
const FAUCET_AMOUNT = 10;           // starting balance for new accounts
const FAUCET_COOLDOWN_MS = 60_000;  // 1 new account per IP per minute

// ====== State (in-memory) ======
const blockchain = [];
const balances = {};     // address -> balance (integer)
const nonces = {};       // address -> last used nonce
const publicKeys = {};   // address -> public key (PEM)
const faucetLog = {};    // ip -> time of last faucet request
let pendingTransactions = [];

// ====== Helpers ======
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

const addressFromPublicKey = (pem) => "by1" + sha256(pem).slice(0, 40);

function blockHash(b) {
  return sha256(
    JSON.stringify({
      index: b.index,
      transactions: b.transactions,
      timestamp: b.timestamp,
      previousHash: b.previousHash,
    })
  );
}

function createBlock() {
  const block = {
    index: blockchain.length,
    transactions: pendingTransactions,
    timestamp: Date.now(),
    previousHash: blockchain.length ? blockchain[blockchain.length - 1].hash : "0",
  };
  block.hash = blockHash(block);
  blockchain.push(block);
  pendingTransactions = [];
}

// Message signed by the sender
function txMessage({ from, to, amount, nonce }) {
  return `${from}:${to}:${amount}:${nonce}`;
}

// ====== Routes ======
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Create an account.
// If the client sends { publicKey }, the server only stores the public key (SECURE).
// Otherwise, the server generates a keypair (DEMO ONLY, the private key is returned once).
app.post("/create", (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  if (faucetLog[ip] && now - faucetLog[ip] < FAUCET_COOLDOWN_MS) {
    return res.status(429).json({ error: "Too many requests, please try again later" });
  }

  let publicKey = req.body && req.body.publicKey;
  let privateKey;

  if (publicKey !== undefined) {
    try {
      const keyObj = crypto.createPublicKey(publicKey);
      if (keyObj.asymmetricKeyType !== "ed25519") throw new Error();
      publicKey = keyObj.export({ type: "spki", format: "pem" });
    } catch {
      return res.status(400).json({ error: "Invalid ed25519 public key (PEM)" });
    }
  } else {
    const pair = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pair.publicKey;
    privateKey = pair.privateKey;
  }

  const address = addressFromPublicKey(publicKey);
  if (publicKeys[address]) {
    return res.status(409).json({ error: "Account already exists" });
  }

  publicKeys[address] = publicKey;
  balances[address] = FAUCET_AMOUNT;
  nonces[address] = 0;
  faucetLog[ip] = now;

  const response = { address, publicKey };
  if (privateKey) response.privateKey = privateKey; // demo only
  res.json(response);
});

// Send coins
app.post("/send", (req, res) => {
  const { from, to, amount, nonce, signature } = req.body || {};

  // --- Input validation ---
  if (typeof from !== "string" || typeof to !== "string") {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive integer" });
  }
  if (!publicKeys[from]) {
    return res.status(404).json({ error: "Sender not found" });
  }
  if (!publicKeys[to]) {
    return res.status(404).json({ error: "Recipient not found" });
  }
  if (from === to) {
    return res.status(400).json({ error: "Cannot send to yourself" });
  }
  if (!Number.isSafeInteger(nonce) || nonce !== nonces[from] + 1) {
    return res.status(400).json({
      error: "Invalid nonce",
      expectedNonce: nonces[from] + 1,
    });
  }
  if (typeof signature !== "string") {
    return res.status(400).json({ error: "Signature is required" });
  }

  // --- Verify signature ---
  let valid = false;
  try {
    valid = crypto.verify(
      null,
      Buffer.from(txMessage({ from, to, amount, nonce })),
      publicKeys[from],
      Buffer.from(signature, "base64")
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // --- Check balance ---
  if (balances[from] < amount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }

  // --- Execute ---
  balances[from] -= amount;
  balances[to] += amount;
  nonces[from] = nonce;
  pendingTransactions.push({ from, to, amount, nonce, signature });

  if (pendingTransactions.length >= BLOCK_SIZE) {
    createBlock();
  }

  res.json({ success: true });
});

// Check balance
app.get("/balance/:address", (req, res) => {
  const { address } = req.params;
  if (!publicKeys[address]) {
    return res.status(404).json({ error: "Account not found" });
  }
  res.json({ balance: balances[address] });
});

// Next nonce the client should use
app.get("/nonce/:address", (req, res) => {
  const { address } = req.params;
  if (!publicKeys[address]) {
    return res.status(404).json({ error: "Account not found" });
  }
  res.json({ nextNonce: nonces[address] + 1 });
});

// View blockchain
app.get("/chain", (req, res) => {
  res.json({ blocks: blockchain, pending: pendingTransactions });
});

// Validate blockchain integrity
app.get("/validate", (req, res) => {
  for (let i = 0; i < blockchain.length; i++) {
    const b = blockchain[i];
    const expectedPrev = i === 0 ? "0" : blockchain[i - 1].hash;
    if (b.previousHash !== expectedPrev || b.hash !== blockHash(b)) {
      return res.json({ valid: false, brokenAt: i });
    }
  }
  res.json({ valid: true });
});

app.listen(PORT, () => {
  console.log(`BytePay server is now running on port ${PORT}`);
});
