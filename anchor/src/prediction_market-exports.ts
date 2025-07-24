// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import PredictionMarketIDL from '../target/idl/prediction_market.json'
import type { PredictionMarket } from '../target/types/prediction_market'

// Re-export the generated IDL and type
export { PredictionMarket, PredictionMarketIDL }

// The programId is imported from the program IDL.
export const PREDICTION_MARKET_PROGRAM_ID = new PublicKey(PredictionMarketIDL.address)

// This is a helper function to get the Counter Anchor program.
export function getPredictionMarketProgram(provider: AnchorProvider, address?: PublicKey): Program<PredictionMarket> {
  return new Program({ ...PredictionMarketIDL, address: address ? address.toBase58() : PredictionMarketIDL.address } as PredictionMarket, provider)
}

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getPredictionMarketProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Counter program on devnet and testnet.
      return new PublicKey('9rHEF2zsthD6hz6Rt1kNDZAWtoNnSM1rBFYBu5fqSKFQ')
    case 'mainnet-beta':
    default:
      return PREDICTION_MARKET_PROGRAM_ID
  }
}
