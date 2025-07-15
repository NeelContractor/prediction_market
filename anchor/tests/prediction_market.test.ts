import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import { PredictionMarket } from '../target/types/prediction_market'
import { createAccount, createMint, getAssociatedTokenAddress, mintTo } from '@solana/spl-token'

describe('prediction_market', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  
  const program = anchor.workspace.PredictionMarket as Program<PredictionMarket>
  const payer = provider.wallet as anchor.Wallet

  let usdcMint: PublicKey;
  let userUsdcAta: PublicKey;
  let marketSeed: anchor.BN;
  let marketPda: PublicKey;
  let marketBump: number;

  beforeAll(async() => {
    usdcMint = await createMint(
      provider.connection,
      payer.payer,
      payer.publicKey,
      null,
      6
    );

    userUsdcAta = await getAssociatedTokenAddress(
      usdcMint,
      payer.publicKey
    );

    await createAccount(
      provider.connection,
      payer.payer,
      usdcMint,
      payer.publicKey,
      // userUsdcAta
    );

    await mintTo(
      provider.connection,
      payer.payer,
      usdcMint,
      userUsdcAta,
      payer.publicKey,
      1000_000_000
    );

    marketSeed = new anchor.BN(Math.floor(Math.random() * 1000000));

    [marketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
  })

  it('Initialize market', async () => {
    const [mintNo] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [mintYes] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketSeed.toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    const vaultUsdc = await getAssociatedTokenAddress(usdcMint, marketPda, true);
    const vaultYes = await getAssociatedTokenAddress(mintYes, marketPda, true);
    const vaultNo = await getAssociatedTokenAddress(mintNo, marketPda, true);

    const [metadataYes] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintYes.toBuffer()
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const [metadataNo] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").toBuffer(),
        mintNo.toBuffer()
      ],
      new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s")
    );

    const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    await program.methods
      .initialize(
        marketSeed,
        "Will Bitcoin reach $100k",
        "Bitcoin YES Token",
        "BTC-YES",
        "Bitcoin No Token",
        "BTC-NO",
        ""
      )
      .accounts({
        counter: counterKeypair.publicKey,
        payer: payer.publicKey,
      })
      .signers([counterKeypair])
      .rpc()

    const currentCount = await program.account.counter.fetch(counterKeypair.publicKey)

    expect(currentCount.count).toEqual(0)
  })

  it('Increment Counter', async () => {
    await program.methods.increment().accounts({ counter: counterKeypair.publicKey }).rpc()

    const currentCount = await program.account.counter.fetch(counterKeypair.publicKey)

    expect(currentCount.count).toEqual(1)
  })

  it('Increment Counter Again', async () => {
    await program.methods.increment().accounts({ counter: counterKeypair.publicKey }).rpc()

    const currentCount = await program.account.counter.fetch(counterKeypair.publicKey)

    expect(currentCount.count).toEqual(2)
  })

  it('Decrement Counter', async () => {
    await program.methods.decrement().accounts({ counter: counterKeypair.publicKey }).rpc()

    const currentCount = await program.account.counter.fetch(counterKeypair.publicKey)

    expect(currentCount.count).toEqual(1)
  })

  it('Set counter value', async () => {
    await program.methods.set(42).accounts({ counter: counterKeypair.publicKey }).rpc()

    const currentCount = await program.account.counter.fetch(counterKeypair.publicKey)

    expect(currentCount.count).toEqual(42)
  })

  it('Set close the counter account', async () => {
    await program.methods
      .close()
      .accounts({
        payer: payer.publicKey,
        counter: counterKeypair.publicKey,
      })
      .rpc()

    // The account should no longer exist, returning null.
    const userAccount = await program.account.counter.fetchNullable(counterKeypair.publicKey)
    expect(userAccount).toBeNull()
  })
})
