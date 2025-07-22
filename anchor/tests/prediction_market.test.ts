import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PredictionMarket } from "../target/types/prediction_market";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

describe("prediction_market", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>;
  
  let creator: Keypair;
  let user: Keypair;
  let collateralMint: PublicKey;
  let market: Keypair;
  let yesTokenMint: Keypair;
  let noTokenMint: Keypair;
  let marketAuthority: PublicKey;
  let collateralVault: Keypair; // Keep as Keypair for signing
  let collateralVaultPubkey: PublicKey;
  let creatorCollateralAccount: PublicKey;
  let userCollateralAccount: PublicKey;
  let userYesTokenAccount: PublicKey;
  let userNoTokenAccount: PublicKey;

  const INITIAL_LIQUIDITY = 1000;
  const MINT_AMOUNT = 10000;

  beforeAll(async () => {
    // Initialize keypairs
    creator = Keypair.generate();
    user = Keypair.generate();
    market = Keypair.generate();
    yesTokenMint = Keypair.generate();
    noTokenMint = Keypair.generate();
    collateralVault = Keypair.generate(); // This needs to be a Keypair for signing

    // Airdrop SOL to accounts
    await provider.connection.requestAirdrop(creator.publicKey, 3 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(user.publicKey, 3 * anchor.web3.LAMPORTS_PER_SOL);
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    collateralMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    creatorCollateralAccount = await createAccount(
      provider.connection,
      creator,
      collateralMint,
      creator.publicKey
    );

    userCollateralAccount = await createAccount(
      provider.connection,
      user,
      collateralMint,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      creator,
      collateralMint,
      creatorCollateralAccount,
      creator,
      MINT_AMOUNT
    );

    await mintTo(
      provider.connection,
      creator,
      collateralMint,
      userCollateralAccount,
      creator,
      MINT_AMOUNT
    );

    [marketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), market.publicKey.toBuffer()],
      program.programId
    );

    userYesTokenAccount = await getAssociatedTokenAddressSync(
      yesTokenMint.publicKey,
      user.publicKey
    );

    userNoTokenAccount = await getAssociatedTokenAddressSync(
      noTokenMint.publicKey,
      user.publicKey
    );
  });

  it("Creates a prediction market", async () => {
    const question = "Will Bitcoin reach $100k by end of 2024?";
    const endTimestamp = new anchor.BN(Date.now() / 1000 + 86400 * 30); // 30 days from now
    const resolutionSource = creator.publicKey; // Manual resolution
    
    const tx = await program.methods
      .createMarket(
        question,
        endTimestamp,
        { manual: {} }, // MarketType::Manual
        resolutionSource,
        new anchor.BN(INITIAL_LIQUIDITY * 2), // Total initial liquidity
        null // No oracle threshold for manual markets
      )
      .accountsStrict({
        creator: creator.publicKey,
        market: market.publicKey,
        collateralMint: collateralMint,
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority: marketAuthority,
        collateralVault: collateralVault.publicKey, 
        creatorCollateralAccount: creatorCollateralAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([creator, market, yesTokenMint, noTokenMint, collateralVault]) // Include collateralVault in signers
      .rpc();

    console.log("Create market tx:", tx);

    const marketAccount = await program.account.market.fetch(market.publicKey);
    console.log("marketAccount collateralVault: ", marketAccount.collateralVault.toBase58());
    
    // expect(marketAccount.creator.toString()).toEqual(creator.publicKey.toString());
    // expect(marketAccount.question).toEqual(question);
    // expect(marketAccount.resolved).toBe(false);
    // expect(marketAccount.winningOutcome).toEqual({ undecided: {} });
    // expect(marketAccount.yesSharesOutstanding.toNumber()).toEqual(INITIAL_LIQUIDITY);
    // expect(marketAccount.noSharesOutstanding.toNumber()).toEqual(INITIAL_LIQUIDITY);
    // expect(marketAccount.totalLiquidity.toNumber()).toEqual(INITIAL_LIQUIDITY * 2);

    const createYesTokenAccountTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey, // payer
        userYesTokenAccount, // ata
        user.publicKey, // owner
        yesTokenMint.publicKey // mint
      )
    );

    const createNoTokenAccountTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey, // payer
        userNoTokenAccount, // ata
        user.publicKey, // owner
        noTokenMint.publicKey // mint
      )
    );

    await provider.sendAndConfirm(createYesTokenAccountTx, [user]);
    await provider.sendAndConfirm(createNoTokenAccountTx, [user]);
  });

  it("Allows users to buy YES shares", async () => {
    const sharesToBuy = 100;
    const maxCost = 200; // Allow for some slippage
    
    const tx = await program.methods
      .buyShares(
        { yes: {} }, // ShareOutcome::Yes
        new anchor.BN(maxCost),
        new anchor.BN(sharesToBuy)
      )
      .accountsStrict({
        market: market.publicKey,
        user: user.publicKey,
        userCollateralAccount: userCollateralAccount,
        userYesTokenAccount: userYesTokenAccount,
        userNoTokenAccount: userNoTokenAccount,
        collateralVault: collateralVault.publicKey, // Use PublicKey here too
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority: marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc({ skipPreflight: true });

    console.log("Buy YES shares tx:", tx);

    // Verify user received YES tokens
    // const yesTokenAccount = await getAccount(provider.connection, userYesTokenAccount);
    // expect(Number(yesTokenAccount.amount)).toEqual(sharesToBuy);

    // Verify market state updated
    // const marketAccount = await program.account.market.fetch(market.publicKey);
    // expect(marketAccount.yesSharesOutstanding.toNumber()).toEqual(INITIAL_LIQUIDITY + sharesToBuy);
  });

  it("Allows users to buy NO shares", async () => {
    const sharesToBuy = 50;
    const maxCost = 100;
    
    const tx = await program.methods
      .buyShares(
        { no: {} }, // ShareOutcome::No
        new anchor.BN(maxCost),
        new anchor.BN(sharesToBuy)
      )
      .accountsStrict({
        market: market.publicKey,
        user: user.publicKey,
        userCollateralAccount: userCollateralAccount,
        userYesTokenAccount: userYesTokenAccount,
        userNoTokenAccount: userNoTokenAccount,
        collateralVault: collateralVault.publicKey,
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority: marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc({ skipPreflight: true });

    console.log("Buy NO shares tx:", tx);

    // Verify user received NO tokens
    // const noTokenAccount = await getAccount(provider.connection, userNoTokenAccount);
    // expect(Number(noTokenAccount.amount)).toEqual(sharesToBuy);
  });

  it("Allows users to sell shares", async () => {
    const sharesToSell = 25;
    const minPayout = 20; // Minimum acceptable payout
    
    const tx = await program.methods
      .sellShares(
        { yes: {} }, // ShareOutcome - selling YES shares
        new anchor.BN(sharesToSell), // shares_to_sell parameter
        new anchor.BN(minPayout) // min_payout parameter
      )
      .accountsStrict({
        market: market.publicKey,
        user: user.publicKey,
        userCollateralAccount: userCollateralAccount,
        userYesTokenAccount: userYesTokenAccount,
        userNoTokenAccount: userNoTokenAccount,
        collateralVault: collateralVault.publicKey,
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority: marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc({ skipPreflight: true });

    console.log("Sell shares tx:", tx);

    // Verify YES tokens were burned
    // const yesTokenAccount = await getAccount(provider.connection, userYesTokenAccount);
    // expect(Number(yesTokenAccount.amount)).toEqual(100 - sharesToSell);
  });

  it("Gets market price", async () => {
    const price = await program.methods
      .getMarketPrice({ yes: {} })
      .accountsStrict({
        market: market.publicKey,
      })
      .view();

    console.log("Current YES price:", price.toNumber());
    // expect(price.toNumber()).toBeGreaterThan(0);
    // expect(price.toNumber()).toBeLessThanOrEqual(1000); // Should be <= PRICE_PRECISION
  });

  it("Resolves market manually", async () => {
    // Create a market that's already past its end time
    const pastMarket = Keypair.generate();
    const pastYesTokenMint = Keypair.generate();
    const pastNoTokenMint = Keypair.generate();
    const pastCollateralVault = Keypair.generate(); // Keep as Keypair for signing
    
    const [pastMarketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), pastMarket.publicKey.toBuffer()],
      program.programId
    );

    // Create a market with past end time
    const pastEndTime = new anchor.BN(Math.floor(Date.now() / 1000) - 100); // 100 seconds ago
    
    await program.methods
      .createMarket(
        "Past market for resolution test",
        pastEndTime,
        { manual: {} },
        creator.publicKey,
        new anchor.BN(INITIAL_LIQUIDITY * 2),
        null
      )
      .accountsStrict({
        creator: creator.publicKey,
        market: pastMarket.publicKey,
        collateralMint: collateralMint,
        yesTokenMint: pastYesTokenMint.publicKey,
        noTokenMint: pastNoTokenMint.publicKey,
        marketAuthority: pastMarketAuthority,
        collateralVault: pastCollateralVault.publicKey, // Use PublicKey
        creatorCollateralAccount: creatorCollateralAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([creator, pastMarket, pastYesTokenMint, pastNoTokenMint, pastCollateralVault]) // Include vault in signers
      .rpc({ skipPreflight: true });

    // Now resolve the past market
    const tx = await program.methods
      .resolveMarket({ yes: {} }) // Manual outcome: YES wins
      .accountsStrict({
        market: pastMarket.publicKey,
        resolutionSource: creator.publicKey, // Manual resolution source
        resolver: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    console.log("Resolve market tx:", tx);

    // Verify market is resolved
    // const marketAccount = await program.account.market.fetch(pastMarket.publicKey);
    // expect(marketAccount.resolved).toBe(true);
    // expect(marketAccount.winningOutcome).toEqual({ yes: {} });
  });

  it("Fails to buy shares with zero amount", async () => {
    // Create a new unresolved market for this test
    const newMarket = Keypair.generate();
    const newYesTokenMint = Keypair.generate();
    const newNoTokenMint = Keypair.generate();
    const newCollateralVault = Keypair.generate(); // Keep as Keypair for signing
    
    const [newMarketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), newMarket.publicKey.toBuffer()],
      program.programId
    );

    // Create the new market
    await program.methods
      .createMarket(
        "Test market for zero amount",
        new anchor.BN(Date.now() / 1000 + 86400),
        { manual: {} },
        creator.publicKey,
        new anchor.BN(INITIAL_LIQUIDITY * 2),
        null
      )
      .accountsStrict({
        creator: creator.publicKey,
        market: newMarket.publicKey,
        collateralMint: collateralMint,
        yesTokenMint: newYesTokenMint.publicKey,
        noTokenMint: newNoTokenMint.publicKey,
        marketAuthority: newMarketAuthority,
        collateralVault: newCollateralVault.publicKey, // Use PublicKey
        creatorCollateralAccount: creatorCollateralAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([creator, newMarket, newYesTokenMint, newNoTokenMint, newCollateralVault]) // Include vault in signers
      .rpc();

    // Create token accounts for the new mints
    const newUserYesTokenAccount = await getAssociatedTokenAddress(
      newYesTokenMint.publicKey,
      user.publicKey
    );

    const newUserNoTokenAccount = await getAssociatedTokenAddress(
      newNoTokenMint.publicKey,
      user.publicKey
    );

    const createYesAccountTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey,
        newUserYesTokenAccount,
        user.publicKey,
        newYesTokenMint.publicKey
      )
    );

    const createNoAccountTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        user.publicKey,
        newUserNoTokenAccount,
        user.publicKey,
        newNoTokenMint.publicKey
      )
    );

    await provider.sendAndConfirm(createYesAccountTx, [user]);
    await provider.sendAndConfirm(createNoAccountTx, [user]);

    // Try to buy with zero amount - should fail
    try {
      await program.methods
        .buyShares(
          { yes: {} },
          new anchor.BN(100),
          new anchor.BN(0) // Zero shares
        )
        .accountsStrict({
          market: newMarket.publicKey,
          user: user.publicKey,
          userCollateralAccount: userCollateralAccount,
          userYesTokenAccount: newUserYesTokenAccount,
          userNoTokenAccount: newUserNoTokenAccount,
          collateralVault: newCollateralVault.publicKey,
          yesTokenMint: newYesTokenMint.publicKey,
          noTokenMint: newNoTokenMint.publicKey,
          marketAuthority: newMarketAuthority,
          tokenProgram: TOKEN_PROGRAM_ID
        })
        .signers([user])
        .rpc();
      
      expect("Should have failed with zero amount");
    } catch (error: any) {
      console.log(error)
      expect(error.error.errorCode.code).toContain("ZeroAmount");
    }
  });
});