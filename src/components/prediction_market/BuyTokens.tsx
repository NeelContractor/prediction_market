
"use client"
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { 
    createAssociatedTokenAccountInstruction, 
    createMintToInstruction, 
    getAssociatedTokenAddressSync, 
    getAccount,
    TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { useState } from "react";
import { WalletButton } from "../solana/solana-provider";
import { Input } from "../ui/input";
import Link from "next/link";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { ThemeSelect } from "../theme-select";

// Replace this with your actual private key (base58 encoded)
const PRIVATE_KEY = "21sMk9DJqwE6WQdPRq2EMZfEpkPtsw47mpmXxEn69DT77FX9Gchp4MJU2VKwPTV3Rq9ieA7q9oDDXawX5rXcxqBU"; 
const tokenMint = new PublicKey("6jXXbS8KKEFtRRitstezJCk7NjQfuZ2fKTT33iB6Kniy");
const tokenDecimals = 6;

export default function BuyTokens() {
    const { publicKey, wallet, sendTransaction } = useWallet();
    const router = useRouter();
    const { connection } = useConnection();
    const [amountOfTokenToBuy, setAmountOfTokenToBuy] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState("");
    
    // Initialize mint owner keypair (only if private key is provided)
    const MintOwner = PRIVATE_KEY ? Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY)) : null;

    async function getTokens() {
        if (!publicKey) {
            setMessage("Please connect your wallet first");
            return;
        }

        if (!MintOwner) {
            setMessage("Error: Mint authority private key not configured");
            return;
        }

        try {
            setIsLoading(true);
            setMessage("Processing...");

            // Get the user's associated token account address
            const associatedToken = getAssociatedTokenAddressSync(
                tokenMint,
                publicKey,
                false,
                TOKEN_PROGRAM_ID,
            );
            
            console.log("Associated Token Account:", associatedToken.toBase58());
            
            // Check if the associated token account exists
            let accountExists = false;
            try {
                await getAccount(connection, associatedToken);
                accountExists = true;
                console.log("Token account already exists");
            } catch (error) {
                console.log("Token account doesn't exist, will create it");
            }

            const transaction = new Transaction();

            // Create associated token account if it doesn't exist
            if (!accountExists) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey, // payer
                        associatedToken, // associated token account
                        publicKey, // owner
                        tokenMint, // mint
                        TOKEN_PROGRAM_ID,
                    )
                );
            }
            
            // Add mint instruction
            transaction.add(
                createMintToInstruction(
                    tokenMint, // mint
                    associatedToken, // destination
                    MintOwner.publicKey, // authority (mint owner, not user)
                    amountOfTokenToBuy * Math.pow(10, tokenDecimals), // amount with decimals
                    [], // multi signers
                    TOKEN_PROGRAM_ID
                )
            );

            // Get recent blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Partially sign with mint owner
            transaction.partialSign(MintOwner);
            
            // Send transaction (user will sign their part)
            const signature = await sendTransaction(transaction, connection);
            
            console.log("Transaction signature:", signature);
            setMessage(`Successfully minted ${amountOfTokenToBuy} tokens! Signature: ${signature}`);
            
        } catch (error) {
            console.error("Error minting tokens:", error);
            setMessage(`Error: ${error}`);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="p-5">
            <div className="flex justify-between">
                <Button onClick={() => {
                    router.push("/")
                }}>Go Back</Button>
                <div className="flex justify-center items-center content-center gap-1">
                    <ThemeSelect />
                    <WalletButton />
                </div>
            </div>
            <div className="grid justify-center gap-4">
                <h2 className="text-center text-5xl font-bold">Buy Tokens</h2>
                <p className="text-center">Users need to have Predict tokens to bet on markets.</p>
                <div className="border p-5">
                    <div>
                        <h1>Token Mint: {tokenMint.toBase58()}</h1>
                    </div>
                    <div className="m-10">
                        <label className="text-lg">Amount to mint: </label>
                        <Input
                            type="number"
                            value={amountOfTokenToBuy}
                            onChange={(e) => setAmountOfTokenToBuy(Number(e.target.value))}
                            disabled={isLoading}
                            min="1"
                        />
                    </div>
                    
                    <div className="flex justify-center">
                        <button 
                            onClick={getTokens}
                            disabled={!publicKey || isLoading || !MintOwner}
                            className="px-5 py-4 rounded-lg cursor-pointer bg-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "Minting..." : "Mint Tokens"}
                        </button>
                    </div>
                </div>
            </div>
            
            {message && (
                <div style={{ 
                    marginTop: "10px", 
                    padding: "10px", 
                    backgroundColor: message.includes("Error") ? "#ffebee" : "#e8f5e8",
                    color: message.includes("Error") ? "#c62828" : "#2e7d32",
                    borderRadius: "4px"
                }}>
                    {message}
                </div>
            )}
            
            {!publicKey && (
                <div className="text-center mt-4 p-4 bg-yellow-100 text-yellow-800 rounded">
                    Please connect your wallet to mint tokens
                </div>
            )}

            {!MintOwner && (
                <div className="text-center mt-4 p-4 bg-red-100 text-red-800 rounded">
                    Mint authority private key not configured
                </div>
            )}
        </div>
    )
}