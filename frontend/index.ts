import { JsonRpcProvider, FallbackProvider, formatEther } from "ethers6";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const primaryRpc = new JsonRpcProvider(process.env.ALCHEMY_RPC_SEPOLIA!);

const provider = new FallbackProvider([
    { provider: primaryRpc, priority: 1, weight: 3 },
    { provider: new JsonRpcProvider(process.env.SEPOLIA_PUBLIC_RPC!), priority: 2, weight: 1 }
]);

provider.getNetwork().then(net => {
    console.log("Connected chainId:", net.chainId);
});



console.log("RPC:", process.env.ALCHEMY_RPC_SEPOLIA);

const BACKEND_URL = "http://localhost:3000";
const CONFIRMATIONS = 6;

async function main() {
    console.log("🚀 Starting multi-RPC secure deposit indexer...");

    provider.on("block", async (blockNumber: number) => {
        try {
            const confirmedBlock = blockNumber - CONFIRMATIONS;
            if (confirmedBlock <= 0) return;

            console.log(`Processing confirmed block: ${confirmedBlock}`);

            const response = await axios.get(`${BACKEND_URL}/txn`);
            const addresses: string[] = response.data.addresses;

            if (!addresses.length) return;

            const interestedAddresses = new Set(
                addresses.map(a => a.toLowerCase())
            );

            console.log(`Monitoring ${addresses.length} addresses.`);

            const block = await primaryRpc.send("eth_getBlockByNumber", [
                `0x${confirmedBlock.toString(16)}`,
                true
            ]);

            if (!block) return;

            for (const tx of block.transactions) {
                if (!tx.to) continue;

                const to = tx.to.toLowerCase();

                if (interestedAddresses.has(to)) {
                    const amountEth = formatEther(tx.value);

                    await axios.post(`${BACKEND_URL}/txn`, {
                        address: to,
                        amount: amountEth,
                        txHash: tx.hash
                    });

                    console.log(`✅ Credited ${amountEth} ETH to ${to}`);
                }
            }





        } catch (error) {
            console.error("Indexer error:", error);
        }
    });
}

main();
