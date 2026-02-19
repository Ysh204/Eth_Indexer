import express from "express";
import { HDNodeWallet, isAddress } from "ethers6";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import helmet from "helmet";
import cors from "cors";
import crypto from "crypto";
import bip39 from "bip39";


dotenv.config();


const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors());

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing in .env");
}

if (!process.env.MNEMONIC) {
    throw new Error("MNEMONIC missing in .env");
}

const mnemonic = process.env.MNEMONIC!.trim();



if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic");
}

const seed = bip39.mnemonicToSeedSync(mnemonic);




if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 characters long");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});


const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY);

// ---------------- ENCRYPTION ----------------

function encryptPrivateKey(privateKey: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(privateKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

// ---------------- GET ALL DEPOSIT ADDRESSES ----------------

app.get("/txn", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT depositaddress FROM binanceUsers"
        );

        res.json({
            addresses: result.rows.map(r => r.depositaddress)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch addresses" });
    }
});


// ---------------- SIGNUP ----------------


app.post("/signup", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "username and password required" });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const hashedPassword = await bcrypt.hash(password, 12);

        const insert = await client.query(
            `INSERT INTO binanceUsers (username, password, depositaddress, encryptedprivatekey)
       VALUES ($1, $2, $3, $4) RETURNING id`,
            [username, hashedPassword, "temp", "temp"]
        );

        const userId: number = insert.rows[0].id;

        const hdNode = HDNodeWallet.fromSeed(seed);
        const child = hdNode.derivePath(`m/44'/60'/${userId}'/0/0`);

        const encryptedKey = encryptPrivateKey(child.privateKey);

        await client.query(
            `UPDATE binanceUsers 
       SET depositaddress = $1, encryptedprivatekey = $2
       WHERE id = $3`,
            [child.address.toLowerCase(), encryptedKey, userId]
        );

        await client.query("COMMIT");

        res.json({
            message: "User created securely",
            user: {
                id: userId,
                username,
                depositAddress: child.address
            }
        });

    } catch (error: any) {
        await client.query("ROLLBACK");
        console.error(error);
        res.status(500).json({ error: "Signup failed" });
    } finally {
        client.release();
    }
});

// ---------------- CREDIT BALANCE ----------------

app.post("/txn", async (req, res) => {
    const { address, amount, txHash } = req.body;

    if (!address || !amount) {
        return res.status(400).json({ error: "address and amount required" });
    }

    if (!isAddress(address)) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const user = await client.query(
            "SELECT id FROM binanceUsers WHERE LOWER(depositaddress) = $1",
            [address.toLowerCase()]
        );

        if (user.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "User not found" });
        }

        const userId = user.rows[0].id;

        await client.query(
            "UPDATE binanceUsers SET balance = balance + $1 WHERE id = $2",
            [amount, userId]
        );

        await client.query(
            "INSERT INTO transactions (user_id, tx_hash, amount, type) VALUES ($1, $2, $3, $4)",
            [userId, txHash || null, amount, "deposit"]
        );

        await client.query("COMMIT");

        res.json({ message: "Balance credited successfully" });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        res.status(500).json({ error: "Transaction failed" });
    } finally {
        client.release();
    }
});

app.listen(3000, () => {
    console.log("Secure wallet backend running on port 3000");
});
