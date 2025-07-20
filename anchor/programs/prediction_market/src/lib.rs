#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, transfer, Transfer};

pub const LIQUIDITY_PARAMETER: u64 = 1000;
pub const MIN_PRICE: u64 = 10;
pub const MAX_PRICE: u64 = 990;
pub const PRICE_PRECISION: u64 = 1000;

declare_id!("7AbkVe2udNXLaceG5BHGcVS1DSXJkTdE61bmz3rau3sd");

#[program]
pub mod prediction_market {

    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, question: String, end_timestamp: i64, market_type: MarketType, resolution_source: Pubkey, initial_liquidity: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.question = question;
        market.end_timestamp = end_timestamp;
        market.resolved = false;
        market.winning_outcome = WinningOutcome::Undecided;
        market.market_type = market_type;
        market.resolution_source = resolution_source;

        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.yes_token_mint = ctx.accounts.yes_token_mint.key();
        market.no_token_mint = ctx.accounts.no_token_mint.key();
        market.collateral_vault = ctx.accounts.market_authority.key();
        market.bump = ctx.bumps.market_authority;

        market.yes_shares_outstanding = initial_liquidity;
        market.no_shares_outstanding = initial_liquidity;
        market.total_liquidity = initial_liquidity * 2;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.creator_collateral_account.to_account_info(),
            to: ctx.accounts.collateral_vault.to_account_info(),
            authority: ctx.accounts.creator.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer(cpi_ctx, initial_liquidity * 2)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
    )]
    pub market: Account<'info, Market>,
    pub collateral_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        mint::decimals = collateral_mint.decimals,
        mint::authority = market_authority
    )]
    pub yes_token_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        mint::decimals = collateral_mint.decimals,
        mint::authority = market_authority
    )]
    pub no_token_mint: Account<'info, Mint>,
    ///CHECK: PDA authority 
    #[account(
        seeds = [b"authority", market.key().as_ref()],
        bump
    )]
    pub market_authority: AccountInfo<'info>,
    #[account(
        init,
        payer = creator,
        token::mint = collateral_mint,
        token::authority = market_authority
    )]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = collateral_mint
    )]
    pub creator_collateral_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,

}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    #[max_len(200)]
    pub question: String,
    pub collateral_mint: Pubkey,
    pub market_authority: Pubkey,
    pub collateral_vault: Pubkey,
    pub yes_token_mint: Pubkey,
    pub no_token_mint: Pubkey,
    pub end_timestamp: i64,
    pub resolution_source: Pubkey, 
    pub resolved: bool,
    pub winning_outcome: WinningOutcome,
    pub market_type: MarketType,
    pub yes_shares_outstanding: u64,
    pub no_shares_outstanding: u64,
    pub total_liquidity: u64,
    pub bump: u8
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum WinningOutcome {
    Undecided,
    Yes,
    No
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum MarketType {
    Oracle,
    Manual
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ShareOutcome {
    Yes,
    No
}

#[error_code]
pub enum MarketError {
    #[msg("Market has already been resolved.")]
    MarketResolved,
    #[msg("Market has not been resolved yet.")]
    MarketNotResolved,
    #[msg("Market has not resolved its end time yet.")]
    MarketNotEnd,
    #[msg("Market is already resolved.")]
    MarketAlreadyResolved,
    #[msg("Invalid oracle feed provided.")]
    InvalidOracleFeed,
    #[msg("Oracle price data is stale or invalid.")]
    OraclePriceStale,
    #[msg("Amount cannot be zero.")]
    ZeroAmount,
    #[msg("Invalid token mint for redemption.")]
    InvalidTokenMint,
    #[msg("Slippage tolerance exceeded.")]
    SlippageExceeded,
    #[msg("Math overflow occurred.")]
    MathOverflow,
    #[msg("Math underflow occurred.")]
    MathUnderflow,
    #[msg("No liquidity available.")]
    NoLiquidity,
    #[msg("Unauthorized resolver.")]
    UnauthorizedResolver,
    #[msg("Outcome reqired for manual resolution.")]
    OutcomeRequired,   
}