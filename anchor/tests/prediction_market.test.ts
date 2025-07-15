import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { PredictionMarket } from '../target/types/prediction_market'
import { 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  createAccount, 
  createMint, 
  getAssociatedTokenAddress, 
  mintTo,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token'

describe('prediction_market', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  
  const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>
  const payer = Keypair.generate();

  let usdcMint: PublicKey;
  let userUsdcAta: PublicKey;
  let marketSeed: anchor.BN;
  let marketPda: PublicKey;
  let marketBump: number;
  let mintYes: PublicKey;
  let mintNo: PublicKey;
  let vaultUsdc: PublicKey;
  let vaultYes: PublicKey;
  let vaultNo: PublicKey;
  let userAtaYes: PublicKey;
  let userAtaNo: PublicKey;

  // Expired market variables
  let expiredMarketSeed: anchor.BN;
  let expiredMarketPda: PublicKey;
  let expiredMintYes: PublicKey;
  let expiredMintNo: PublicKey;
  let expiredVaultUsdc: PublicKey;
  let expiredVaultYes: PublicKey;
  let expiredVaultNo: PublicKey;
  let expiredUserAtaYes: PublicKey;
  let expiredUserAtaNo: PublicKey;

  // Metaplex Token Metadata Program ID
  const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  beforeAll(async() => {

    const airdropSignature = await provider.connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropSignature, "confirmed");

    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );

    // Get user's USDC ATA
    userUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      payer.publicKey
    );

    // Create user's USDC account
    await createAccount(
      provider.connection,
      payer,
      usdcMint,
      payer.publicKey,
      // userUsdcAta
    );

    // Mint USDC to user
    await mintTo(
      provider.connection,
      payer,
      usdcMint,
      userUsdcAta,
      payer.publicKey,
      1000_000_000 // 1000 USDC
    );

    // Generate market seed
    marketSeed = new anchor.BN(Math.floor(Math.random() * 1000000));

    // Derive market PDA
    [marketPda, marketBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Derive mint PDAs
    [mintYes] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [mintNo] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Get vault addresses
    vaultUsdc = await getAssociatedTokenAddress(usdcMint, marketPda, true);
    vaultYes = await getAssociatedTokenAddress(mintYes, marketPda, true);
    vaultNo = await getAssociatedTokenAddress(mintNo, marketPda, true);

    // Get user token accounts
    userAtaYes = await getAssociatedTokenAddress(mintYes, payer.publicKey);
    userAtaNo = await getAssociatedTokenAddress(mintNo, payer.publicKey);
  })

  it('Initialize market', async () => {
    // Derive metadata PDAs
    const [metadataYes] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintYes.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const [metadataNo] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintNo.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const tx = await program.methods
      .initialize(
        marketSeed,
        "Will Bitcoin reach $100k?",
        "Bitcoin YES Token",
        "BTC-YES",
        "Bitcoin No Token",
        "BTC-NO",
        "https://raw.githubusercontent.com/NeelContractor/prediction_market/refs/heads/main/anchor/metadata/yes.json",
        "https://raw.githubusercontent.com/NeelContractor/prediction_market/refs/heads/main/anchor/metadata/no.json",
        100,
        new anchor.BN(endTime)
      )
      .accountsPartial({
        signer: payer.publicKey,
        mintYes,
        mintNo,
        mintUsdc: usdcMint,
        vaultYes,
        vaultNo,
        vaultUsdc,
        metadataYes,
        metadataNo,
        market: marketPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc()

    console.log("Initialize transaction signature:", tx);

    // Verify market was created
    const marketAccount = await program.account.market.fetch(marketPda);
    expect(marketAccount.marketName).toEqual("Will Bitcoin reach $100k?");
    expect(marketAccount.seed.toString()).toEqual(marketSeed.toString());
    expect(marketAccount.totalLiquidity.toString()).toEqual("0");
    expect(marketAccount.fee).toEqual(100);
    expect(marketAccount.locked).toEqual(false);
    expect(marketAccount.settled).toEqual(false);
  })

  it("Add liquidity", async () => {
    const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    const tx = await program.methods
      .addLiquidity(
        new anchor.BN(100_000_000), // 100 YES tokens
        new anchor.BN(100_000_000), // 100 NO tokens
        new anchor.BN(expiration)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes,
        mintNo,
        mintUsdc: usdcMint,
        vaultYes,
        vaultNo,
        vaultUsdc,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Add liquidity transaction signature:", tx);

    // Verify liquidity was added
    const marketAccount = await program.account.market.fetch(marketPda);
    expect(marketAccount.totalLiquidity.toString()).toEqual("200000000"); // 200 tokens total
  });

  it("Swap USDC for YES tokens", async () => {
    const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    const tx = await program.methods
      .swap(
        true,  // is_usdc_to_token
        new anchor.BN(10_000_000), // 10 USDC
        true,  // is_yes
        new anchor.BN(1), // min_out (very low for testing)
        new anchor.BN(expiration)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes,
        mintNo,
        mintUsdc: usdcMint,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc: userUsdcAta,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Swap transaction signature:", tx);

    // Verify tokens were received
    const userYesBalance = await provider.connection.getTokenAccountBalance(userAtaYes);
    expect(Number(userYesBalance.value.amount)).toBeGreaterThan(0);
    
    console.log("User YES token balance:", userYesBalance.value.uiAmount);
  });

  it("Swap USDC for NO tokens", async () => {
    const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now

    const tx = await program.methods
      .swap(
        true,  // is_usdc_to_token
        new anchor.BN(5_000_000), // 5 USDC
        false, // is_yes (buying NO tokens)
        new anchor.BN(1), // min_out (very low for testing)
        new anchor.BN(expiration)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes,
        mintNo,
        mintUsdc: usdcMint,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc: userUsdcAta,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Swap NO tokens transaction signature:", tx);

    // Verify tokens were received
    const userNoBalance = await provider.connection.getTokenAccountBalance(userAtaNo);
    expect(Number(userNoBalance.value.amount)).toBeGreaterThan(0);
    
    console.log("User NO token balance:", userNoBalance.value.uiAmount);
  });

  it("Swap YES tokens back to USDC", async () => {
    const expiration = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
    
    // Get current YES token balance
    const currentYesBalance = await provider.connection.getTokenAccountBalance(userAtaYes);
    const yesTokensToSwap = Math.floor(Number(currentYesBalance.value.amount) / 2); // Swap half

    const tx = await program.methods
      .swap(
        false, // is_usdc_to_token (selling tokens for USDC)
        new anchor.BN(yesTokensToSwap),
        true,  // is_yes
        new anchor.BN(1), // min_out (very low for testing)
        new anchor.BN(expiration)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes,
        mintNo,
        mintUsdc: usdcMint,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc: userUsdcAta,
        market: marketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Swap YES to USDC transaction signature:", tx);

    // Verify YES tokens were burned and USDC received
    const newYesBalance = await provider.connection.getTokenAccountBalance(userAtaYes);
    expect(Number(newYesBalance.value.amount)).toBeLessThan(Number(currentYesBalance.value.amount));
    
    console.log("User YES token balance after swap:", newYesBalance.value.uiAmount);
  });

  it("Lock market", async () => {
    const tx = await program.methods
      .lock()
      .accountsPartial({
        signer: payer.publicKey,
        market: marketPda,
      })
      .signers([payer])
      .rpc();

    console.log("Lock market transaction signature:", tx);

    // Verify market is locked
    const marketAccount = await program.account.market.fetch(marketPda);
    expect(marketAccount.locked).toEqual(true);
  });

  it("Unlock market", async () => {
    const tx = await program.methods
      .unlock()
      .accountsPartial({
        signer: payer.publicKey,
        market: marketPda,
      })
      .signers([payer])
      .rpc();

    console.log("Unlock market transaction signature:", tx);

    // Verify market is unlocked
    const marketAccount = await program.account.market.fetch(marketPda);
    expect(marketAccount.locked).toEqual(false);
  });

  it("Should fail to settle market before end time", async () => {
    try {
      await program.methods
        .settle(true) // Market resolves to YES
        .accountsPartial({
          admin: payer.publicKey,
          market: marketPda,
        })
        .signers([payer])
        .rpc();
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      console.log("Expected error - market not ended:", error);
      expect(error.error.errorCode.message).toContain("MarketNotEnded");
    }
  });

  it("Wait for market to end and settle", async () => {
    // Create a new market that's already expired
    expiredMarketSeed = new anchor.BN(Math.floor(Math.random() * 1000000));
    
    [expiredMarketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), expiredMarketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [expiredMintYes] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), expiredMarketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [expiredMintNo] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), expiredMarketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const [expiredMetadataYes] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        expiredMintYes.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const [expiredMetadataNo] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        expiredMintNo.toBuffer()
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    expiredVaultUsdc = await getAssociatedTokenAddress(usdcMint, expiredMarketPda, true);
    expiredVaultYes = await getAssociatedTokenAddress(expiredMintYes, expiredMarketPda, true);
    expiredVaultNo = await getAssociatedTokenAddress(expiredMintNo, expiredMarketPda, true);

    expiredUserAtaYes = await getAssociatedTokenAddress(expiredMintYes, payer.publicKey);
    expiredUserAtaNo = await getAssociatedTokenAddress(expiredMintNo, payer.publicKey);

    // Create market that ends in 1 second
    const endTime = Math.floor(Date.now() / 1000) + 1;

    const initTx = await program.methods
      .initialize(
        expiredMarketSeed,
        "Expired Market Test",
        "Expired YES Token",
        "EXP-YES",
        "Expired NO Token",
        "EXP-NO",
        "https://example.com/yes.json",
        "https://example.com/no.json",
        100,
        new anchor.BN(endTime)
      )
      .accountsPartial({
        signer: payer.publicKey,
        mintYes: expiredMintYes,
        mintNo: expiredMintNo,
        mintUsdc: usdcMint,
        vaultYes: expiredVaultYes,
        vaultNo: expiredVaultNo,
        vaultUsdc: expiredVaultUsdc,
        metadataYes: expiredMetadataYes,
        metadataNo: expiredMetadataNo,
        market: expiredMarketPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([payer])
      .rpc();

    console.log("Expired market initialized:", initTx);

    // Add some liquidity
    const liquidityTx = await program.methods
      .addLiquidity(
        new anchor.BN(50_000_000), // 50 YES tokens
        new anchor.BN(50_000_000), // 50 NO tokens
        new anchor.BN(Math.floor(Date.now() / 1000) + 300)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes: expiredMintYes,
        mintNo: expiredMintNo,
        mintUsdc: usdcMint,
        vaultYes: expiredVaultYes,
        vaultNo: expiredVaultNo,
        vaultUsdc: expiredVaultUsdc,
        market: expiredMarketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Expired market liquidity added:", liquidityTx);

    // Buy some YES tokens
    const buyTx = await program.methods
      .swap(
        true,  // is_usdc_to_token
        new anchor.BN(10_000_000), // 10 USDC
        true,  // is_yes
        new anchor.BN(1), // min_out
        new anchor.BN(Math.floor(Date.now() / 1000) + 300)
      )
      .accountsPartial({
        user: payer.publicKey,
        mintYes: expiredMintYes,
        mintNo: expiredMintNo,
        mintUsdc: usdcMint,
        vaultYes: expiredVaultYes,
        vaultNo: expiredVaultNo,
        vaultUsdc: expiredVaultUsdc,
        userAtaYes: expiredUserAtaYes,
        userAtaNo: expiredUserAtaNo,
        userAtaUsdc: userUsdcAta,
        market: expiredMarketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Bought YES tokens in expired market:", buyTx);

    // Wait for market to expire
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now settle the market (YES wins)
    const settleTx = await program.methods
      .settle(true) // Market resolves to YES
      .accountsPartial({
        admin: payer.publicKey,
        market: expiredMarketPda,
      })
      .signers([payer])
      .rpc();

    console.log("Settle market transaction signature:", settleTx);

    // Verify market is settled
    const settledMarketAccount = await program.account.market.fetch(expiredMarketPda);
    expect(settledMarketAccount.settled).toEqual(true);
  });

  it("Claim rewards from settled market", async () => {
    // Get user's YES token balance before claiming
    const userYesBalance = await provider.connection.getTokenAccountBalance(expiredUserAtaYes);
    expect(Number(userYesBalance.value.amount)).toBeGreaterThan(0);

    console.log("User YES token balance before claim:", userYesBalance.value.uiAmount);

    // Get vault USDC balance
    const vaultUsdcBalance = await provider.connection.getTokenAccountBalance(expiredVaultUsdc);
    console.log("Vault USDC balance:", vaultUsdcBalance.value.uiAmount);

    // Claim rewards for YES tokens
    const claimTx = await program.methods
      .claim(true) // claiming YES tokens
      .accountsPartial({
        user: payer.publicKey,
        mintYes: expiredMintYes,
        mintNo: expiredMintNo,
        mintUsdc: usdcMint,
        vaultYes: expiredVaultYes,
        vaultNo: expiredVaultNo,
        vaultUsdc: expiredVaultUsdc,
        userAtaYes: expiredUserAtaYes,
        userAtaNo: expiredUserAtaNo,
        userAtaUsdc: userUsdcAta,
        market: expiredMarketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    console.log("Claim rewards transaction signature:", claimTx);

    // Verify YES tokens were burned and USDC received
    const newYesBalance = await provider.connection.getTokenAccountBalance(expiredUserAtaYes);
    expect(Number(newYesBalance.value.amount)).toBe(0); // Should be 0 after claiming

    console.log("User YES token balance after claim:", newYesBalance.value.uiAmount);

    // Verify user received USDC
    const newUsdcBalance = await provider.connection.getTokenAccountBalance(userUsdcAta);
    console.log("User USDC balance after claim:", newUsdcBalance.value.uiAmount);
  });

  it("Should fail to claim from non-settled market", async () => {
    try {
      await program.methods
        .claim(true) // trying to claim from original market
        .accountsPartial({
          user: payer.publicKey,
          mintYes,
          mintNo,
          mintUsdc: usdcMint,
          vaultYes,
          vaultNo,
          vaultUsdc,
          userAtaYes,
          userAtaNo,
          userAtaUsdc: userUsdcAta,
          market: marketPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      console.log("Expected error - market not settled:", error);
      expect(error.error.errorCode.message).toContain("MarketNotSettled");
    }
  });

  it("Should fail to add liquidity to locked market", async () => {
    // Lock the market first
    await program.methods
      .lock()
      .accountsPartial({
        signer: payer.publicKey,
        market: marketPda,
      })
      .signers([payer])
      .rpc();

    try {
      await program.methods
        .addLiquidity(
          new anchor.BN(10_000_000),
          new anchor.BN(10_000_000),
          new anchor.BN(Math.floor(Date.now() / 1000) + 300)
        )
        .accountsPartial({
          user: payer.publicKey,
          mintYes,
          mintNo,
          mintUsdc: usdcMint,
          vaultYes,
          vaultNo,
          vaultUsdc,
          market: marketPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      console.log("Expected error - pool locked:", error.error.errorCode.message);
      expect(error.error.errorCode.message).toContain("PoolLocked");
    }
  });

  it("Should fail to swap in locked market", async () => {
    try {
      await program.methods
        .swap(
          true,
          new anchor.BN(1_000_000),
          true,
          new anchor.BN(1),
          new anchor.BN(Math.floor(Date.now() / 1000) + 300)
        )
        .accountsPartial({
          user: payer.publicKey,
          mintYes,
          mintNo,
          mintUsdc: usdcMint,
          vaultYes,
          vaultNo,
          vaultUsdc,
          userAtaYes,
          userAtaNo,
          userAtaUsdc: userUsdcAta,
          market: marketPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      console.log("Expected error - pool locked:", error.error.errorCode.message);
      expect(error.error.errorCode.message).toContain("PoolLocked");
    }
  });
})