'use client'

import { getPredictionMarketProgram, getPredictionMarketProgramId } from '@project/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Cluster, ComputeBudgetProgram, Keypair, PublicKey, sendAndConfirmRawTransaction, sendAndConfirmTransaction, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { AccountLayout, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { BN } from 'bn.js'

export type MarketType = { manual: {} } | { oracle: {} };
export type ShareOutcome = { yes: {} } | { no: {} };
export type WinningOutcome = { undecided: {} } | { yes: {} } | { no: {} } | { canceled: {} };

interface CreateMarketArgs {
  question: string;
  endTimestamp: number;
  marketType: MarketType;
  resolutionSource: PublicKey;
  initialLiquidity: number;
  oracleThreshold?: number;
  creatorPubkey: PublicKey
}

interface BuySharesArgs {
  marketPubkey: PublicKey;
  outcome: ShareOutcome;
  maxCost: number;
  sharesDesired: number;
  userPubkey: PublicKey
}

interface SellSharesArgs {
  marketPubkey: PublicKey;
  outcome: ShareOutcome;
  sharesToSell: number;
  minPayout: number;
  userPubkey: PublicKey
}

interface ResolveMarketArgs {
  marketPubkey: PublicKey;
  manualOutcome?: WinningOutcome;
  resolverPubkey: PublicKey
}

interface RedeemWinningsArgs {
  marketPubkey: PublicKey;
  amount: number;
  userPubkey: PublicKey
}

interface EmergencyResolveMarketFnArgs {
  marketPubkey: PublicKey, 
  outcome: ShareOutcome, 
  resolverPubkey: PublicKey
}

export function usePredictionMarketProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getPredictionMarketProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getPredictionMarketProgram(provider, programId), [provider, programId])
  const { wallet, sendTransaction, signAllTransactions } = useWallet();

  const marketAccounts = useQuery({
    queryKey: ['market', 'all', { cluster }],
    queryFn: () => program.account.market.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  // below function just only be used by the creator only
  const createMarketFn = useMutation<string, Error, CreateMarketArgs>({
    mutationKey: ['market', 'create', { cluster }],
    mutationFn: async ({ question, endTimestamp, marketType, resolutionSource, initialLiquidity, oracleThreshold, creatorPubkey }) => {
      const marketKeypair = Keypair.generate();
      const yesTokenMint = Keypair.generate();
      const noTokenMint = Keypair.generate();
      const collateralVault = Keypair.generate();
      
      const [marketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("authority"), marketKeypair.publicKey.toBuffer()],
        program.programId
      );

      const collateralMint = new PublicKey("6jXXbS8KKEFtRRitstezJCk7NjQfuZ2fKTT33iB6Kniy"); // Predict token
      
      const creatorCollateralAccount = getAssociatedTokenAddressSync(
        collateralMint,
        creatorPubkey
      );

      return await program.methods
        .createMarket(
          question,
          new BN(endTimestamp),
          marketType,
          resolutionSource,
          new BN(initialLiquidity * 2), // Total initial liquidity
          oracleThreshold ? new BN(oracleThreshold) : null
        )
        .accountsStrict({ 
          creator: creatorPubkey,
          market: marketKeypair.publicKey,
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
        .signers([marketKeypair, yesTokenMint, noTokenMint, collateralVault])
        .rpc()
      },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await marketAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to create market:', error)
      toast.error('Failed to create market account');
    },
  })

  return {
    program,
    programId,
    marketAccounts,
    getProgramAccount,
    createMarketFn
  }
}

export function usePredictionMarketProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const { connection } = useConnection();
  const transactionToast = useTransactionToast()
  const { program, marketAccounts } = usePredictionMarketProgram();
  const { wallet } = useWallet();

  const buySharesFn = useMutation<string, Error, BuySharesArgs>({
    mutationKey: ['market', 'buy_shares', { cluster }],
    mutationFn: async ({ marketPubkey, outcome, maxCost, sharesDesired, userPubkey }) => {
      if (!wallet?.adapter) {
        throw new Error('Wallet not connected');
      }

      const marketAccount = await program.account.market.fetch(marketPubkey);
      
      // Get user's token accounts
      const userCollateralAccount = getAssociatedTokenAddressSync(
        marketAccount.collateralMint,
        userPubkey
      );
  
      const userYesTokenAccount = getAssociatedTokenAddressSync(
        marketAccount.yesTokenMint,
        userPubkey
      );
  
      const userNoTokenAccount = getAssociatedTokenAddressSync(
        marketAccount.noTokenMint,
        userPubkey
      );
  
      // The Rust program requires both YES and NO token accounts to exist
      // even though it only uses one based on the outcome
      const instructions = [];
      
      // Check and create YES token account if needed
      const yesTokenAccountInfo = await connection.getAccountInfo(userYesTokenAccount);
      if (!yesTokenAccountInfo) {
        const createYesTokenAccountIx = createAssociatedTokenAccountInstruction(
          userPubkey, // payer
          userYesTokenAccount, // associatedToken
          userPubkey, // owner
          marketAccount.yesTokenMint // mint
        );
        instructions.push(createYesTokenAccountIx);
      }
  
      // Check and create NO token account if needed
      const noTokenAccountInfo = await connection.getAccountInfo(userNoTokenAccount);
      if (!noTokenAccountInfo) {
        const createNoTokenAccountIx = createAssociatedTokenAccountInstruction(
          userPubkey, // payer
          userNoTokenAccount, // associatedToken
          userPubkey, // owner
          marketAccount.noTokenMint // mint
        );
        instructions.push(createNoTokenAccountIx);
      }
  
      // Create the buy shares instruction
      const buySharesIx = await program.methods
        .buyShares(
          outcome,
          new BN(maxCost),
          new BN(sharesDesired)
        )
        .accountsStrict({
          market: marketPubkey,
          user: userPubkey,
          userCollateralAccount: userCollateralAccount,
          userYesTokenAccount: userYesTokenAccount,
          userNoTokenAccount: userNoTokenAccount,
          collateralVault: marketAccount.collateralVault,
          yesTokenMint: marketAccount.yesTokenMint,
          noTokenMint: marketAccount.noTokenMint,
          marketAuthority: marketAccount.marketAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();
  
      instructions.push(buySharesIx);
  
      // Create transaction with proper recent blockhash
      const transaction = new Transaction().add(...instructions);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;
  
      // Use sendAndConfirmTransaction instead of sendAndConfirmRawTransaction
      // This requires the wallet to sign the transaction
      return await wallet?.adapter.sendTransaction(transaction, connection);
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await marketAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to buy shares:', error)
      toast.error('Failed to buy shares')
    },
  })
  
  const sellSharesFn = useMutation<string, Error, SellSharesArgs>({
    mutationKey: ['market', 'sell_shares', { cluster }],
    mutationFn: async ({ marketPubkey, outcome, sharesToSell, minPayout, userPubkey }) => {
      if (!wallet?.adapter) {
        throw new Error('Wallet not connected');
      }
  
      try {
        console.log('Sell Shares - Starting transaction:', {
          marketPubkey: marketPubkey.toString(),
          outcome,
          sharesToSell,
          minPayout,
          userPubkey: userPubkey.toString()
        });
  
        const marketAccount = await program.account.market.fetch(marketPubkey);
        console.log('Market account fetched:', marketAccount);
        
        // Get user's token accounts
        const userCollateralAccount = getAssociatedTokenAddressSync(
          marketAccount.collateralMint,
          userPubkey
        );
  
        const userYesTokenAccount = getAssociatedTokenAddressSync(
          marketAccount.yesTokenMint,
          userPubkey
        );
  
        const userNoTokenAccount = getAssociatedTokenAddressSync(
          marketAccount.noTokenMint,
          userPubkey
        );
  
        console.log('Token accounts:', {
          userCollateralAccount: userCollateralAccount.toString(),
          userYesTokenAccount: userYesTokenAccount.toString(),
          userNoTokenAccount: userNoTokenAccount.toString()
        });
  
        // Determine which outcome we're selling
        const isYesOutcome = 'yes' in outcome;
        const relevantTokenAccount = isYesOutcome ? userYesTokenAccount : userNoTokenAccount;
        
        // Check if user has the relevant token account and shares
        const tokenAccountInfo = await connection.getAccountInfo(relevantTokenAccount);
        if (!tokenAccountInfo) {
          throw new Error(`You don't have any ${isYesOutcome ? 'YES' : 'NO'} shares to sell`);
        }
  
        // Parse token account to check balance
        const tokenAccountData = AccountLayout.decode(tokenAccountInfo.data);
        const balance = Number(tokenAccountData.amount);
        
        if (balance < sharesToSell) {
          throw new Error(`Insufficient ${isYesOutcome ? 'YES' : 'NO'} shares. You have ${balance}, trying to sell ${sharesToSell}`);
        }
  
        const instructions = [];
        
        // Always ensure collateral account exists (for receiving payout)
        const collateralAccountInfo = await connection.getAccountInfo(userCollateralAccount);
        if (!collateralAccountInfo) {
          console.log('Creating collateral token account');
          const createCollateralAccountIx = createAssociatedTokenAccountInstruction(
            userPubkey, // payer
            userCollateralAccount, // associatedToken
            userPubkey, // owner
            marketAccount.collateralMint // mint
          );
          instructions.push(createCollateralAccountIx);
        }
  
        // Create both YES and NO token accounts if they don't exist
        // (The program expects both accounts to be present)
        const yesTokenAccountInfo = await connection.getAccountInfo(userYesTokenAccount);
        if (!yesTokenAccountInfo) {
          console.log('Creating YES token account');
          const createYesTokenAccountIx = createAssociatedTokenAccountInstruction(
            userPubkey, // payer
            userYesTokenAccount, // associatedToken
            userPubkey, // owner
            marketAccount.yesTokenMint // mint
          );
          instructions.push(createYesTokenAccountIx);
        }
  
        const noTokenAccountInfo = await connection.getAccountInfo(userNoTokenAccount);
        if (!noTokenAccountInfo) {
          console.log('Creating NO token account');
          const createNoTokenAccountIx = createAssociatedTokenAccountInstruction(
            userPubkey, // payer
            userNoTokenAccount, // associatedToken
            userPubkey, // owner
            marketAccount.noTokenMint // mint
          );
          instructions.push(createNoTokenAccountIx);
        }
  
        // Create the sell shares instruction
        console.log('Creating sell shares instruction');
        const sellSharesIx = await program.methods
          .sellShares(
            outcome,
            new BN(sharesToSell),
            new BN(minPayout)
          )
          .accountsStrict({
            market: marketPubkey,
            user: userPubkey,
            userCollateralAccount: userCollateralAccount,
            userYesTokenAccount: userYesTokenAccount,
            userNoTokenAccount: userNoTokenAccount,
            collateralVault: marketAccount.collateralVault,
            yesTokenMint: marketAccount.yesTokenMint,
            noTokenMint: marketAccount.noTokenMint,
            marketAuthority: marketAccount.marketAuthority,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();
  
        instructions.push(sellSharesIx);
  
        // Create transaction with compute budget (add more compute units for complex operations)
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 400_000,
        });
        
        const transaction = new Transaction()
          .add(computeBudgetIx)
          .add(...instructions);
        
        // Get fresh blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = userPubkey;
  
        console.log('Transaction created, simulating first...');
        console.log('Instructions count:', instructions.length + 1); // +1 for compute budget
  
        // Simulate transaction first to catch errors early
        try {
          const simulationResult = await connection.simulateTransaction(transaction);
          if (simulationResult.value.err) {
            console.log('Simulation error:', simulationResult.value.err);
            console.log('Simulation logs:', simulationResult.value.logs);
            throw new Error(`Transaction simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
          }
          console.log('Simulation successful, proceeding with transaction');
        } catch (simError) {
          console.error('Simulation failed:', simError);
          throw new Error(`Simulation failed: ${simError}`);
        }
  
        // Send transaction
        const signature = await wallet.adapter.sendTransaction(transaction, connection, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
  
        console.log('Transaction sent, signature:', signature);
  
        // Wait for confirmation with timeout
        const confirmationPromise = connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');
  
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
        });
  
        const confirmation = await Promise.race([confirmationPromise, timeoutPromise]) as any;
  
        if (confirmation.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
  
        console.log('Transaction confirmed');
        return signature;
  
      } catch (error: any) {
        console.error('Sell shares error:', error);
        
        // Better error messages based on common issues
        if (error.message?.includes('insufficient funds')) {
          throw new Error('Insufficient SOL for transaction fees');
        } else if (error.message?.includes('insufficient')) {
          throw new Error('Insufficient shares to sell');
        } else if (error.message?.includes('Account not found')) {
          throw new Error('Market or token account not found');
        } else if (error.message?.includes('custom program error: 0x0')) {
          throw new Error('Market has already been resolved');
        } else if (error.message?.includes('custom program error: 0x9')) {
          throw new Error('Amount cannot be zero');
        } else if (error.message?.includes('custom program error: 0xc')) {
          throw new Error('Slippage tolerance exceeded - try increasing min payout');
        } else if (error.message?.includes('custom program error')) {
          // Generic custom program error
          const match = error.message.match(/custom program error: (0x[0-9a-fA-F]+)/);
          const errorCode = match ? match[1] : 'unknown';
          throw new Error(`Program error (${errorCode}): ${error.message}`);
        } else if (error.message?.includes('Simulation failed')) {
          throw new Error(error.message);
        } else {
          throw new Error(`Failed to sell shares: ${error.message || 'Unknown error'}`);
        }
      }
    },
    onSuccess: async (signature) => {
      console.log('Sell shares successful:', signature);
      transactionToast(signature);
      await marketAccounts.refetch();
    },
    onError: (error) => {
      console.error('Sell shares mutation error:', error);
      toast.error(error.message || 'Failed to sell shares');
    },
  })

  // below function just only be used by the creator only
  const resolveMarketFn = useMutation<string, Error, ResolveMarketArgs>({
    mutationKey: ['market', 'resolve', { cluster }],
    mutationFn: async ({ marketPubkey, manualOutcome, resolverPubkey }) => {
      const marketAccount = await program.account.market.fetch(marketPubkey);

      return await program.methods
        .resolveMarket(manualOutcome || null)
        .accountsStrict({
          market: marketPubkey,
          resolutionSource: marketAccount.resolutionSource,
          resolver: resolverPubkey,
        })
        .rpc();
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await marketAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to resolve market:', error)
      toast.error('Failed to resolve market')
    },
  })

  const redeemWinningsFn = useMutation<string, Error, RedeemWinningsArgs>({
    mutationKey: ['market', 'redeem', { cluster }],
    mutationFn: async ({ marketPubkey, amount, userPubkey }) => {
      const marketAccount = await program.account.market.fetch(marketPubkey);
      
      // Get user's collateral account
      const userCollateralAccount = getAssociatedTokenAddressSync(
        marketAccount.collateralMint,
        userPubkey
      );

      // Determine which token account to use based on winning outcome
      let userWinningTokenAccount: PublicKey;
      let winningTokenMint: PublicKey;

      if (marketAccount.winningOutcome.yes) {
        userWinningTokenAccount = getAssociatedTokenAddressSync(
          marketAccount.yesTokenMint,
          userPubkey
        );
        winningTokenMint = marketAccount.yesTokenMint;
      } else if (marketAccount.winningOutcome.no) {
        userWinningTokenAccount = getAssociatedTokenAddressSync(
          marketAccount.noTokenMint,
          userPubkey
        );
        winningTokenMint = marketAccount.noTokenMint;
      } else if (marketAccount.winningOutcome.canceled) {
        // For canceled markets, user can redeem either token type
        userWinningTokenAccount = getAssociatedTokenAddressSync(
          marketAccount.yesTokenMint,
          userPubkey
        );
        winningTokenMint = marketAccount.yesTokenMint;
      } else {
        throw new Error('Market outcome is undecided');
      }

      return await program.methods
        .redeemWinnings(new BN(amount))
        .accountsStrict({
          market: marketPubkey,
          user: userPubkey,
          userCollateralAccount: userCollateralAccount,
          userWinningTokenAccount: userWinningTokenAccount,
          collateralVault: marketAccount.collateralVault,
          winningTokenMint: winningTokenMint,
          marketAuthority: marketAccount.marketAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await marketAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to redeem winnings:', error)
      toast.error('Failed to redeem winnings')
    },
  })

  // below function just only be used by the creator only
  const emergencyResolveMarketFn = useMutation<string, Error, EmergencyResolveMarketFnArgs>({
    mutationKey: ['market', 'emergency_resolve', { cluster }],
    mutationFn: async ({ marketPubkey, outcome, resolverPubkey }) => {
      return await program.methods
        .emergencyResolveMarket(outcome)
        .accountsStrict({
          market: marketPubkey,
          resolver: resolverPubkey
        })
        .rpc();
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await marketAccounts.refetch()
    },
    onError: (error) => {
      console.error('Failed to emergency resolve market:', error)
      toast.error('Failed to emergency resolve market')
    },
  })

  return {
    buySharesFn,
    sellSharesFn,
    resolveMarketFn,
    redeemWinningsFn,
    emergencyResolveMarketFn
  }
}
