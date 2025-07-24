"use client"
import { Connection, Keypair, sendAndConfirmTransaction, SystemProgram, Transaction } from "@solana/web3.js";
import { useState } from "react";
import bs58 from "bs58";
import { ThemeSelect } from "../theme-select";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";
import { createAssociatedTokenAccountInstruction, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createMintToInstruction, ExtensionType, getAssociatedTokenAddressSync, getMintLen, LENGTH_SIZE, TOKEN_PROGRAM_ID, TYPE_SIZE } from "@solana/spl-token";

const PRIVATE_KEY = "21sMk9DJqwE6WQdPRq2EMZfEpkPtsw47mpmXxEn69DT77FX9Gchp4MJU2VKwPTV3Rq9ieA7q9oDDXawX5rXcxqBU";

export default function MintTokens() {
    const [keypair, setKeypair] = useState<Keypair | null>(null);
    const bytes = bs58.decode(PRIVATE_KEY);
    const pair = Keypair.fromSecretKey(bytes);

    setKeypair(pair);
    const [tokenName, setTokenName] = useState<string>("");
    const [tokenSymbol, setTokenSymbol] = useState<string>("");
    const [tokenDecimal, setTokenDecimal] = useState<number>(9);
    const [tokenSupply, setTokenSupply] = useState<number>(1);
    const [tokenImage, setTokenImage] = useState<string>("");
    const [tokenDes, setTokenDes] = useState<string | null>(null);
    // const [mintAuth, setMintAuth] = useState<PublicKey | null>(null);
    // const [FreezeAuth, setFreezeAuth] = useState<PublicKey | null>(null);
    // const [updateAuth, setUpdateAuth] = useState<PublicKey | null>(null);
    const [link, setLink] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const connection = new Connection("https://api.devnet.solana.com");
    
    async function createToken() {
        if (!keypair) {
            setError("No keypair available. Please check your private key.");
            return;
        }

        if (!tokenName || !tokenSymbol || !tokenImage || !tokenDes) {
            setError("Please fill in all required fields.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const mintKeypair = Keypair.generate();
            console.log(`Mint generated keypair: ${mintKeypair.publicKey.toBase58()}`);

            const metadata = {
                mint: mintKeypair.publicKey,
                name: tokenName,
                symbol: tokenSymbol,
                uri: tokenImage,
                description: tokenDes,
                additionalMetadata: []
            };

            const mintLen = getMintLen([ExtensionType.MetadataPointer]);
            const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;

            console.log("Mint length:", mintLen);
            console.log("Metadata length:", metadataLen);
            
            const lamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);
            console.log("Required lamports:", lamports);

            // Create mint account and initialize
            const transaction = new Transaction().add(
                SystemProgram.createAccount({
                    fromPubkey: keypair.publicKey,
                    newAccountPubkey: mintKeypair.publicKey,
                    space: mintLen + metadataLen, // Fix: Include metadata space
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMetadataPointerInstruction(
                    mintKeypair.publicKey, 
                    keypair.publicKey, 
                    mintKeypair.publicKey, 
                    TOKEN_PROGRAM_ID
                ),
                createInitializeMintInstruction(
                    mintKeypair.publicKey, 
                    tokenDecimal, 
                    keypair.publicKey, 
                    keypair.publicKey, 
                    TOKEN_PROGRAM_ID
                ),
                createInitializeInstruction({
                    programId: TOKEN_PROGRAM_ID,
                    mint: mintKeypair.publicKey,
                    metadata: mintKeypair.publicKey,
                    name: metadata.name,
                    symbol: metadata.symbol,
                    uri: metadata.uri,
                    mintAuthority: keypair.publicKey,
                    updateAuthority: keypair.publicKey,
                })
            );

            transaction.feePayer = keypair.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.partialSign(mintKeypair);

            await sendAndConfirmTransaction(connection, transaction, [keypair]);
            console.log(`Token Mint created at ${mintKeypair.publicKey.toBase58()}`);

            // Create associated token account
            const associatedToken = getAssociatedTokenAddressSync(
                mintKeypair.publicKey,
                keypair.publicKey,
                false,
                TOKEN_PROGRAM_ID,
            );

            console.log(`ATA: ${associatedToken.toBase58()}`);

            const transaction2 = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    keypair.publicKey,
                    associatedToken,
                    keypair.publicKey,
                    mintKeypair.publicKey,
                    TOKEN_PROGRAM_ID,
                )
            );

            await sendAndConfirmTransaction(connection, transaction2, [keypair]);

            // Mint tokens - Fix: Calculate amount correctly
            const mintAmount = tokenSupply * Math.pow(10, tokenDecimal);
            const transaction3 = new Transaction().add(
                createMintToInstruction(
                    mintKeypair.publicKey, 
                    associatedToken, 
                    keypair.publicKey, 
                    mintAmount, 
                    [], 
                    TOKEN_PROGRAM_ID
                )
            );

            await sendAndConfirmTransaction(connection, transaction3, [keypair]);
            
            setLink(`Mint: ${mintKeypair.publicKey.toBase58()}, ATA: ${associatedToken.toBase58()}`);
            console.log("Token creation completed successfully!");
            
        } catch (err) {
            console.error("Error creating token:", err);
            setError(err instanceof Error ? err.message : "Failed to create token");
        } finally {
            setIsLoading(false);
        }
    }


    return (
        <div className="mx-20 py-20">
            <div className="flex justify-end gap-2">
                <ThemeSelect />
            </div>
            <div className="grid justify-center mb-5 gap-4 border rounded-lg mx-48 shadow-[4px_4px_3px_rgb(211,211,211,1)] p-5"> 
                <div className="grid justify-center pb-5">
                    <h1 className="font-extrabold text-4xl font-sans text-center">Solana Token Launchpad</h1>
                    <p className="text-center text-xs">Easily create your own Solana SPL-Token in few steps without coding.</p>
                </div>
                
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-center">
                        {error}
                    </div>
                )}
                
                <div className="grid grid-cols-2 grid-rows-4 gap-3">
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Name:</p>
                        <input 
                            type="text" 
                            value={tokenName}
                            onChange={(e) => setTokenName(e.target.value)} 
                            className="border rounded-md outline-none p-2 w-80 text-xs" 
                            placeholder="Enter the name of the Token" 
                        />
                    </div>
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Symbol:</p>
                        <input 
                            type="text" 
                            value={tokenSymbol}
                            onChange={(e) => setTokenSymbol(e.target.value)} 
                            className="border rounded-md outline-none p-2 w-80 text-xs" 
                            placeholder="Enter the symbol of the Token" 
                        />
                    </div>
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Decimals:</p>
                        <input 
                            type="number" 
                            value={tokenDecimal}
                            onChange={(e) => setTokenDecimal(Number(e.target.value))} 
                            className="border rounded-md outline-none p-2 w-80 text-xs" 
                            placeholder="Enter the decimals of the Token"
                            min="0"
                            max="9"
                        />
                    </div>
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Supply:</p>
                        <input 
                            type="number" 
                            value={tokenSupply}
                            onChange={(e) => setTokenSupply(Number(e.target.value))} 
                            className="border rounded-md outline-none p-2 w-80 text-xs" 
                            placeholder="Enter the supply of the Token"
                            min="1"
                        />
                    </div>
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Image URL:</p>
                        <input 
                            type="url" 
                            value={tokenImage}
                            onChange={(e) => setTokenImage(e.target.value)} 
                            className="border rounded-md outline-none p-2 w-80 text-xs" 
                            placeholder="Enter the image URL of the Token" 
                        />
                    </div>
                    <div>
                        <p className="text-sm"><span className="text-red-600">*</span>Description:</p>
                        <textarea 
                            value={tokenDes || ""}
                            onChange={(e) => setTokenDes(e.target.value)} 
                            className="border rounded-md outline-none p-2 w-80 h-16 text-xs" 
                            placeholder="Enter the description of the Token" 
                        />
                    </div>
                </div>
                <div>
                    <div className="flex justify-center pt-5">
                        <button 
                            onClick={createToken} 
                            disabled={isLoading || !keypair}
                            className="p-5 rounded-full text-xl font-extrabold border bg-green-600 border-green-800 hover:bg-green-900 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "Creating Token..." : "Create Token"}
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex justify-center">
                {link ? (
                    <p className="text-xl font-semibold break-all text-center">{link}</p>
                ) : (
                    <p className="text-gray-400 text-sm">No token created yet.</p>
                )}
            </div>
        </div>
    )
}