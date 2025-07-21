import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { PredictionMarket } from '../target/types/prediction_market'
import { 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  createAccount, 
  createAssociatedTokenAccount, 
  createMint, 
  getAccount, 
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
  const creator = provider.wallet as anchor.Wallet;

  const market = Keypair.generate();
  const collateralMint = Keypair.generate();
  const yesTokenMint = Keypair.generate();
  const noTokenMint = Keypair.generate();
  let marketAuthority: PublicKey;
  let collateralVault: Keypair;
  let creatorCollateralAccount: PublicKey;

  const user = Keypair.generate();
  let userCollateralAccount: PublicKey;
  let userYesTokenAccount: PublicKey;
  let userNoTokenAccount: PublicKey;

  beforeAll(async() => {
    await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);

    [marketAuthority] = await PublicKey.findProgramAddressSync(
      [Buffer.from("authority"), market.publicKey.toBuffer()],
      program.programId
    );

    await createMint(provider.connection, creator.payer, creator.publicKey, null, 6, collateralMint);

    creatorCollateralAccount = await createAccount(provider.connection, creator.payer, collateralMint.publicKey, creator.publicKey);
    await mintTo(provider.connection, creator.payer, collateralMint.publicKey, creatorCollateralAccount, creator.publicKey, 2000 * 1_000_000); // Mint 2000 collateral

    userCollateralAccount = await createAccount(provider.connection, user, collateralMint.publicKey, user.publicKey);
    await mintTo(provider.connection, creator.payer, collateralMint.publicKey, userCollateralAccount, creator.publicKey, 500 * 1_000_000); // Mint 500 collateral for user

    userYesTokenAccount = await createAccount(provider.connection, user, yesTokenMint.publicKey, user.publicKey, undefined, undefined, TOKEN_PROGRAM_ID);
    userNoTokenAccount = await createAccount(provider.connection, user, noTokenMint.publicKey, user.publicKey, undefined, undefined, TOKEN_PROGRAM_ID);

    collateralVault = Keypair.generate();
  })

  it('Create a new Market', async () => {
    const question = "Will SOL price be > $200 by EOY 2025?"
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 3600);
    const initialLiquidtity = new anchor.BN(100 * 1_000_000);
    const marketType = { manual: {} };
    const resolutionSource = creator.publicKey; // creator is the resolver

    const tx = await program.methods
      .createMarket(question, endTimestamp, marketType, resolutionSource, initialLiquidtity)
      .accountsPartial({
        creator: creator.publicKey,
        market: market.publicKey,
        collateralMint: collateralMint.publicKey,
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority: marketAuthority,
        collateralVault: collateralVault.publicKey,
        creatorCollateralAccount: creatorCollateralAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY
      })
      .signers([market, yesTokenMint, noTokenMint, collateralVault])
      .rpc();

      console.log("create Market tx: ", tx);
      const marketAcc = await program.account.market.fetch(market.publicKey);
      expect(marketAcc.creator.toString()).toEqual(creator.publicKey.toString());
      expect(marketAcc.question).toEqual(question);
      expect(marketAcc.yesSharesOutstanding.toNumber()).toEqual(initialLiquidtity.toNumber());
      expect(marketAcc.noSharesOutstanding.toNumber()).toEqual(initialLiquidtity.toNumber());
  })

  it("Nuy yes shares", async () => {
    const sharesDesired = new anchor.BN(50 * 1_000_000);
    const maxCost = new anchor.BN(100 * 1_000_000);
    const outcome = { yes: {} };

    // const marketBefore = await program.account.market.fetch(market.publicKey);

    const tx = await program.methods
      .buyShares(outcome, maxCost, sharesDesired)
      .accountsStrict({
        market: market.publicKey,
        user: user.publicKey,
        userCollateralAccount,
        userYesTokenAccount,
        userNoTokenAccount,
        collateralVault: collateralVault.publicKey,
        yesTokenMint: yesTokenMint.publicKey,
        noTokenMint: noTokenMint.publicKey,
        marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .signers([user])
      .rpc();
      console.log("Buy yes shares tx: ", tx);

      // const marketAfter = await program.account.market.fetch(market.publicKey);
      // const expectedYesShares = marketBefore.yesSharesOutstanding.add(sharesDesired);
      // expect(marketAfter.yesSharesOutstanding.toNumber()).toEqual(expectedYesShares.toNumber());
  })

  it("Resolves the market to yes", async () => {
    const winningOutcome = { yes: {} };

    const tx = await program.methods
      .resolveMarket(winningOutcome)
      .accountsStrict({
        market: market.publicKey,
        resolutionSource: creator.publicKey,
        resolver: creator.publicKey
      })
      .signers([creator.payer])
      .rpc();

      console.log("Resolve the market tx: ", tx);
  })

  it("Redeems winnings for collateral", async () => {
    const winningTokenBefore = await getAccount(provider.connection, userYesTokenAccount);
    const amountToRedeem = winningTokenBefore.amount;

    const tx = await program.methods
      .redeemWinnings(new anchor.BN(amountToRedeem))
      .accountsStrict({
        market: market.publicKey,
        user: user.publicKey,
        userCollateralAccount: userCollateralAccount,
        userWinningTokenAccount: userYesTokenAccount,
        collateralVault: collateralVault.publicKey,
        winningTokenMint: yesTokenMint.publicKey,
        marketAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

      console.log("Redeem winning tx: ", tx);
  })

})