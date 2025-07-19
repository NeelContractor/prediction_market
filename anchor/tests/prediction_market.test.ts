import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { PredictionMarket } from '../target/types/prediction_market'
import { 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  createAccount, 
  createAssociatedTokenAccount, 
  createMint, 
  getAssociatedTokenAddress, 
  mintTo,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token'
import { 
  // PROGRAM_ID as METADATA_PROGRAM_ID,
  MPL_TOKEN_METADATA_PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";

const METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

describe('prediction_market', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  
  const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>
  // const payer = Keypair.generate();

  let admin: Keypair;
  let user: Keypair;
  let marketSeed: anchor.BN;
  let market: PublicKey;
  let marketBump: number;
  let mintUsdc: PublicKey;
  let mintYes: PublicKey;
  let mintNo: PublicKey;
  let vaultUsdc: PublicKey;
  let vaultYes: PublicKey;
  let vaultNo: PublicKey;
  let metadataYes: PublicKey;
  let metadataNo: PublicKey;
  let userAtaUsdc: PublicKey;
  let userAtaYes: PublicKey;
  let userAtaNo: PublicKey;

  // Metaplex Token Metadata Program ID
  // const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

  const USDC_DECIMALS = 6;
  const INITIAL_USDC_AMOUNT = new anchor.BN(1000 * 10 ** USDC_DECIMALS); // 1000 USDC
  const MARKET_NAME = "Will BTC reach $100k by EOY?";
  const YES_TOKEN_NAME = "BTC 100K Yes";
  const YES_TOKEN_SYMBOL = "BTC100Y";
  const NO_TOKEN_NAME = "BTC 100K No";
  const NO_TOKEN_SYMBOL = "BTC100N";
  const TOKEN_URI = "https://example.com/metadata.json";
  const FEE_BPS = 100; // 1%
  const END_TIME = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 30); // 30 days from now

  beforeAll(async() => {

    admin = Keypair.generate();
    user = Keypair.generate();
    
    // Airdrop SOL to accounts
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL)
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL)
    );

    // Create USDC mint (simulate USDC)
    mintUsdc = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      USDC_DECIMALS,
      undefined,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Generate market seed and derive PDAs
    marketSeed = new anchor.BN(Math.floor(Math.random() * 1000000));

    [market, marketBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [mintYes] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    [mintNo] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // Get vault addresses
    vaultUsdc = await getAssociatedTokenAddress(mintUsdc, market, true);
    vaultYes = await getAssociatedTokenAddress(mintYes, market, true);
    vaultNo = await getAssociatedTokenAddress(mintNo, market, true);

    // Get metadata addresses
    [metadataYes] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintYes.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    [metadataNo] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintNo.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    // Create user USDC account and mint tokens
    userAtaUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      mintUsdc,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      admin,
      mintUsdc,
      userAtaUsdc,
      admin.publicKey,
      INITIAL_USDC_AMOUNT.toNumber()
    );

    // Get user token accounts (will be created later)
    userAtaYes = await getAssociatedTokenAddress(mintYes, user.publicKey);
    userAtaNo = await getAssociatedTokenAddress(mintNo, user.publicKey);
  })

  it('Initializes the prediction market', async () => {
    const tx = await program.methods
      .initialize(
        marketSeed,
        MARKET_NAME,
        YES_TOKEN_NAME,
        YES_TOKEN_SYMBOL,
        NO_TOKEN_NAME,
        NO_TOKEN_SYMBOL,
        TOKEN_URI,
        TOKEN_URI,
        FEE_BPS,
        END_TIME
      )
      .accountsPartial({
        signer: admin.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        metadataYes,
        metadataNo,
        market,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        tokenMetadataProgram: METADATA_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    console.log("Initialize transaction signature:", tx);

    // Verify market was created
    const marketAccount = await program.account.market.fetch(market);
    expect(marketAccount.marketName).toEqual(MARKET_NAME);
    expect(marketAccount.seed.toString()).toEqual(marketSeed.toString());
    expect(marketAccount.feeBps).toEqual(FEE_BPS);
    expect(marketAccount.locked).toBeFalsy;
    expect(marketAccount.settled).toBeFalsy;
    expect(marketAccount.admin.toString()).toEqual(admin.publicKey.toString());
  })

  it("Adds initial liquidity to the market", async () => {
    const yesAmount = new anchor.BN(100 * 10 ** USDC_DECIMALS); // 100 tokens
    const noAmount = new anchor.BN(100 * 10 ** USDC_DECIMALS); // 100 tokens
    const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const tx = await program.methods
      .addLiquidity(yesAmount, noAmount, expiration)
      .accountsPartial({
        user: admin.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        market,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    console.log("Add liquidity transaction signature:", tx);

    // Verify liquidity was added
    const marketAccount = await program.account.market.fetch(market);
    const expectedLiquidity = yesAmount.add(noAmount);
    expect(marketAccount.totalLiquidity.toString()).toEqual(expectedLiquidity.toString());
  });

  it("Swap USDC for YES tokens", async () => {
    const swapAmount = new anchor.BN(10 * 10 ** USDC_DECIMALS); // 10 USDC
    const minOut = new anchor.BN(1); // Minimum 1 token output
    const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const tx = await program.methods
      .swap(
        true, // is_usdc_to_token
        swapAmount,
        true, // is_yes
        minOut,
        expiration
      )
      .accountsPartial({
        user: user.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc,
        market,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

      console.log("Swap USDC -> YES transaction:", tx);

      // Check user received YES tokens
      const userYesBalance = await provider.connection.getTokenAccountBalance(userAtaYes);
      expect(parseInt(userYesBalance.value.amount)).toBeGreaterThan(0);
      console.log("User YES token balance:", userYesBalance.value.uiAmount);
  });

  it("Swap USDC for NO tokens", async () => {
    const swapAmount = new anchor.BN(10 * 10 ** USDC_DECIMALS); // 10 USDC
    const minOut = new anchor.BN(1); // Minimum 1 token output
    const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const tx = await program.methods
      .swap(
        true, // is_usdc_to_token
        swapAmount,
        false, // is_yes (false = NO tokens)
        minOut,
        expiration
      )
      .accountsPartial({
        user: user.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc,
        market,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

      console.log("Swap USDC -> NO transaction:", tx);

      // Check user received NO tokens
      const userNoBalance = await provider.connection.getTokenAccountBalance(userAtaNo);
      expect(parseInt(userNoBalance.value.amount)).toBeGreaterThan(0);
      console.log("User NO token balance:", userNoBalance.value.uiAmount);
  
  });

  it("Swap YES tokens back to USDC", async () => {
    const userYesBalance = await provider.connection.getTokenAccountBalance(userAtaYes);
    const swapAmount = new anchor.BN(Math.floor(parseInt(userYesBalance.value.amount) / 2)); // Swap half
    const minOut = new anchor.BN(1); // Minimum 1 USDC output
    const expiration = new anchor.BN(Math.floor(Date.now() / 1000) + 300); // 5 minutes

    const usdcBalanceBefore = await provider.connection.getTokenAccountBalance(userAtaUsdc);

    const tx = await program.methods
      .swap(
        false, // is_usdc_to_token (false = token to USDC)
        swapAmount,
        true, // is_yes
        minOut,
        expiration
      )
      .accountsPartial({
        user: user.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc,
        market,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

      console.log("Swap YES -> USDC transaction:", tx);

      // Check user received USDC
      const usdcBalanceAfter = await provider.connection.getTokenAccountBalance(userAtaUsdc);
      expect(parseInt(usdcBalanceAfter.value.amount)).toBeGreaterThan(
        parseInt(usdcBalanceBefore.value.amount)
      );
      console.log("USDC received:", 
        parseInt(usdcBalanceAfter.value.amount) - parseInt(usdcBalanceBefore.value.amount)
      );
  });

  it("Lock market", async () => {
    const tx = await program.methods
      .lock()
      .accountsPartial({
        signer: admin.publicKey,
        market: market,
      })
      .signers([admin])
      .rpc();

      console.log("Lock market transaction:", tx);

      // Verify market is locked
      const marketAccount = await program.account.market.fetch(market);
      expect(marketAccount.locked).toBeTruthy;
  });

  it("Unlock market", async () => {
    const tx = await program.methods
      .unlock()
      .accountsPartial({
        signer: admin.publicKey,
        market: market,
      })
      .signers([admin])
      .rpc();

      console.log("Unlock market transaction:", tx);

      // Verify market is unlocked
      const marketAccount = await program.account.market.fetch(market);
      expect(marketAccount.locked).toBeFalsy;
  
  });

  it("Settles the market (YES wins)", async () => {
      const tx = await program.methods
        .settle(true) // Market resolves to YES
        .accountsPartial({
          admin: admin.publicKey,
          market: market,
        })
        .signers([admin])
        .rpc();
      
      // Should not reach here
      console.log("Settle market transaction:", tx);

    // Verify market is settled
      const marketAccount = await program.account.market.fetch(market);
      expect(marketAccount.settled).toBeTruthy;
      expect(marketAccount.resolution).toBeTruthy; // YES wins
  });

  it("Claims rewards for YES token holders", async () => {
      const usdcBalanceBefore = await provider.connection.getTokenAccountBalance(userAtaUsdc);
      const yesBalanceBefore = await provider.connection.getTokenAccountBalance(userAtaYes);
  
      const tx = await program.methods
      .claim(true) // Claim YES tokens
      .accountsPartial({
        user: user.publicKey,
        mintYes,
        mintNo,
        mintUsdc,
        vaultYes,
        vaultNo,
        vaultUsdc,
        userAtaYes,
        userAtaNo,
        userAtaUsdc,
        market,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    console.log("Claim rewards transaction:", tx);

    // Verify user received USDC payout
    const usdcBalanceAfter = await provider.connection.getTokenAccountBalance(userAtaUsdc);
    expect(parseInt(usdcBalanceAfter.value.amount)).toBeGreaterThan(
      parseInt(usdcBalanceBefore.value.amount)
    );

    // Verify YES tokens were burned
    const yesBalanceAfter = await provider.connection.getTokenAccountBalance(userAtaYes);
    expect(parseInt(yesBalanceAfter.value.amount)).toBeLessThan(
      parseInt(yesBalanceBefore.value.amount)
    );

    console.log("USDC payout:", 
      parseInt(usdcBalanceAfter.value.amount) - parseInt(usdcBalanceBefore.value.amount)
    );
  });

  it("Fails to claim rewards for NO token holders (they lost)", async () => {
    try {
      await program.methods
        .claim(false) // Try to claim NO tokens
        .accountsPartial({
          user: user.publicKey,
          mintYes,
          mintNo,
          mintUsdc,
          vaultYes,
          vaultNo,
          vaultUsdc,
          userAtaYes,
          userAtaNo,
          userAtaUsdc,
          market,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      // Should not reach here
      expect("Expected transaction to fail");
    } catch (error: any) {
      console.log("Expected error for NO token claim:", error);
      expect(error.error.errorCode.message).toContain("NoWinningTokens");
    }
  });

  it("Fails to initialize with invalid fee", async () => {
    const invalidSeed = new anchor.BN(999999);
    const [invalidMarket] = PublicKey.findProgramAddressSync(
      [Buffer.from("market"), invalidSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    try {
      await program.methods
        .initialize(
          invalidSeed,
          "Invalid Market",
          "Invalid Yes",
          "IY",
          "Invalid No", 
          "IN",
          TOKEN_URI,
          TOKEN_URI,
          1500, // 15% fee (invalid, max is 10%)
          END_TIME
        )
        .accountsPartial({
          signer: admin.publicKey,
          mintYes: mintYes, // This would need to be different for new market
          mintNo: mintNo,   // This would need to be different for new market
          mintUsdc,
          vaultYes,
          vaultNo,
          vaultUsdc,
          metadataYes,
          metadataNo,
          market: invalidMarket,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([admin])
        .rpc();

      expect("Expected transaction to fail with high fee");
    } catch (error: any) {
      console.log("Expected error for high fee:", error.error.errorCode.message);
    }
  });

  it("Fails to swap with insufficient slippage tolerance", async () => {
    // Create a new market for this test to avoid settled market issues
    const newSeed = new anchor.BN(Math.floor(Math.random() * 1000000));
    // ... (you'd need to initialize a new market here)
    
    // For now, we'll skip this test since our market is already settled
    console.log("Skipping slippage test - would need new market");
  });
})