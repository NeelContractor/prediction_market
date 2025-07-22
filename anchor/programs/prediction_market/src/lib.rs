#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount, transfer, Transfer, burn, mint_to, Burn, MintTo};
use pyth_sdk_solana::{state::SolanaPriceAccount, PriceFeed};

pub const LIQUIDITY_PARAMETER: u64 = 1000;
pub const MIN_PRICE: u64 = 10;
pub const MAX_PRICE: u64 = 990;
pub const PRICE_PRECISION: u64 = 1000;
pub const EMERGENCY_PERIOD: i64 = 86400 * 7; // 7 days
pub const ORACLE_GRACE_PERIOD: i64 = 86400 * 3; // 3 days


declare_id!("9rHEF2zsthD6hz6Rt1kNDZAWtoNnSM1rBFYBu5fqSKFQ");

#[program]
pub mod prediction_market {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, question: String, end_timestamp: i64, market_type: MarketType, resolution_source: Pubkey, initial_liquidity: u64, oracle_threashold: Option<i64>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        market.creator = ctx.accounts.creator.key();
        market.question = question;
        market.end_timestamp = end_timestamp;
        market.resolved = false;
        market.winning_outcome = WinningOutcome::Undecided;
        market.market_type = market_type.clone();
        market.resolution_source = resolution_source;
        market.oracle_threshold = oracle_threashold;

        market.collateral_mint = ctx.accounts.collateral_mint.key();
        market.yes_token_mint = ctx.accounts.yes_token_mint.key();
        market.no_token_mint = ctx.accounts.no_token_mint.key();
        market.collateral_vault = ctx.accounts.market_authority.key();
        market.market_authority = ctx.accounts.market_authority.key();
        market.bump = ctx.bumps.market_authority;

        market.yes_shares_outstanding = initial_liquidity;
        market.no_shares_outstanding = initial_liquidity;
        market.total_liquidity = initial_liquidity * 2;

        if market_type == MarketType::Oracle {
            require!(oracle_threashold.is_some(), MarketError::OracleThresholdRequired);
        }

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

    pub fn buy_shares(ctx: Context<BuyShares>, outcome: ShareOutcome, max_cost: u64, shares_desired: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, MarketError::MarketResolved);
        require!(shares_desired > 0, MarketError::ZeroAmount);

        let actual_cost = calculate_buy_cost(market, &outcome, shares_desired)?;
        require!(actual_cost <= max_cost, MarketError::SlippageExceeded);

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_collateral_account.to_account_info(),
            to: ctx.accounts.collateral_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        transfer(cpi_ctx, actual_cost)?;

        let market_key = market.key();
        let authority_seeds = &[
            b"authority",
            market_key.as_ref(),
            &[market.bump]
        ];
        let signer_seeds = &[&authority_seeds[..]];

        match outcome {
            ShareOutcome::Yes => {
                market.yes_shares_outstanding = market.yes_shares_outstanding
                    .checked_add(shares_desired)
                    .ok_or(MarketError::MathOverflow)?;

                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_accounts = MintTo {
                    mint: ctx.accounts.yes_token_mint.to_account_info(),
                    to: ctx.accounts.user_yes_token_account.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info()
                };
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
                mint_to(cpi_ctx, shares_desired)?;
            },
            ShareOutcome::No => {
                market.no_shares_outstanding = market.no_shares_outstanding
                    .checked_add(shares_desired)
                    .ok_or(MarketError::MathOverflow)?;

                let cpi_program = ctx.accounts.token_program.to_account_info();
                let cpi_accounts = MintTo {
                    mint: ctx.accounts.no_token_mint.to_account_info(),
                    to: ctx.accounts.user_no_token_account.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info()
                };
                let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
                mint_to(cpi_ctx, shares_desired)?;
            }
        }

        market.total_liquidity = market.total_liquidity
            .checked_add(actual_cost)
            .ok_or(MarketError::MathOverflow)?;

        Ok(())
    }

    pub fn sell_shares(ctx: Context<SellShares>, outcome: ShareOutcome, shares_to_sell: u64, min_payout: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, MarketError::MarketResolved);
        require!(shares_to_sell > 0, MarketError::ZeroAmount);

        let payout = calculate_sell_payout(market, &outcome, shares_to_sell)?;
        require!(payout >= min_payout, MarketError::SlippageExceeded);

        let burn_accounts = Burn {
            mint: match outcome {
                ShareOutcome::Yes => ctx.accounts.yes_token_mint.to_account_info(),
                ShareOutcome::No => ctx.accounts.no_token_mint.to_account_info(),
            },
            from: match outcome {
                ShareOutcome::Yes => ctx.accounts.user_yes_token_account.to_account_info(),
                ShareOutcome::No => ctx.accounts.user_no_token_account.to_account_info(),
            },
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let burn_ctx = CpiContext::new(cpi_program, burn_accounts);
        burn(burn_ctx, shares_to_sell)?;

        match outcome {
            ShareOutcome::Yes => {
                market.yes_shares_outstanding = market.yes_shares_outstanding
                    .checked_sub(shares_to_sell)
                    .ok_or(MarketError::MathUnderflow)?;
            },
            ShareOutcome::No => {
                market.no_shares_outstanding = market.no_shares_outstanding
                    .checked_sub(shares_to_sell)
                    .ok_or(MarketError::MathUnderflow)?;
            },
        }

        market.total_liquidity = market.total_liquidity
            .checked_sub(payout)
            .ok_or(MarketError::MathUnderflow)?;

        let market_key = market.key();
        let authority_seeds = &[
            b"authority",
            market_key.as_ref(),
            &[market.bump]
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let transfer_accounts = Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.user_collateral_account.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info()
        };
        let transfer_ctx = CpiContext::new_with_signer(cpi_program, transfer_accounts, signer_seeds);
        transfer(transfer_ctx, payout)?;

        Ok(())
    }

    pub fn resolve_market(ctx: Context<ResolveMarket>, manual_outcome: Option<WinningOutcome>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, MarketError::MarketAlreadyResolved);

        let clock = Clock::get()?.unix_timestamp;
        require!(clock > market.end_timestamp, MarketError::MarketNotEnd);

        match market.market_type {
            MarketType::Oracle => {
                let price_feed: PriceFeed   = SolanaPriceAccount::account_info_to_feed(&ctx.accounts.resolution_source)
                    .map_err(|_| error!(MarketError::InvalidOracleFeed))?;

                let current_price = price_feed.get_price_unchecked();
                require!(current_price.price > 0, MarketError::OraclePriceStale);
            },
            MarketType::Manual => {
                require!(ctx.accounts.resolver.key() == market.creator, MarketError::UnauthorizedResolver);
                require!(manual_outcome.is_some(), MarketError::OutcomeRequired);
                market.winning_outcome = manual_outcome.unwrap();
            }
        }

        market.resolved = true;
        Ok(())
    }

    pub fn redeem_winnings(ctx: Context<RedeemWinnings>, amount: u64) -> Result<()> {
        let market = &ctx.accounts.market;
        require!(market.resolved, MarketError::MarketNotResolved);
        require!(amount > 0, MarketError::ZeroAmount);

        match market.winning_outcome {
            WinningOutcome::Yes => {
                require!(ctx.accounts.user_winning_token_account.mint == market.yes_token_mint, MarketError::InvalidTokenMint);
            },
            WinningOutcome::No => {
                require!(ctx.accounts.user_winning_token_account.mint == market.no_token_mint, MarketError::InvalidTokenMint);
            },
            WinningOutcome::Canceled => {
                // For canceled markets, allow redemption of both YES and NO tokens
                // at proportional rate based on original liquidity
                let is_yes_token = ctx.accounts.user_winning_token_account.mint == market.yes_token_mint;
                let is_no_token = ctx.accounts.user_winning_token_account.mint == market.no_token_mint;
                require!(is_yes_token || is_no_token, MarketError::InvalidTokenMint);
                
                // Calculate proportional refund
                let total_original_shares = market.yes_shares_outstanding + market.no_shares_outstanding;
                let refund_amount = (amount * market.total_liquidity) / total_original_shares;
                
                let cpi_program = ctx.accounts.token_program.to_account_info();
                let burn_accounts = Burn {
                    mint: ctx.accounts.winning_token_mint.to_account_info(),
                    from: ctx.accounts.user_winning_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info()
                };
                let burn_ctx = CpiContext::new(cpi_program.clone(), burn_accounts);
                burn(burn_ctx, amount)?;

                let market_key = market.key();
                let authority_seeds = &[
                    b"authority",
                    market_key.as_ref(),
                    &[market.bump]
                ];
                let signer_seeds = &[&authority_seeds[..]];

                let transfer_accounts = Transfer {
                    from: ctx.accounts.collateral_vault.to_account_info(),
                    to: ctx.accounts.user_collateral_account.to_account_info(),
                    authority: ctx.accounts.market_authority.to_account_info(),
                };
                let transfer_ctx = CpiContext::new_with_signer(cpi_program, transfer_accounts, signer_seeds);
                transfer(transfer_ctx, refund_amount)?;
                
                return Ok(());
            },
            WinningOutcome::Undecided => return err!(MarketError::MarketNotResolved),
        }

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let burn_accounts = Burn {
            mint: ctx.accounts.winning_token_mint.to_account_info(),
            from: ctx.accounts.user_winning_token_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info()
        };
        let burn_ctx = CpiContext::new(cpi_program.clone(), burn_accounts);
        burn(burn_ctx, amount)?;

        let market_key = market.key();
        let authority_seeds = &[
            b"authority",
            market_key.as_ref(),
            &[market.bump]
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let transfer_accounts = Transfer {
            from: ctx.accounts.collateral_vault.to_account_info(),
            to: ctx.accounts.user_collateral_account.to_account_info(),
            authority: ctx.accounts.market_authority.to_account_info(),
        };
        let transfer_ctx = CpiContext::new_with_signer(cpi_program, transfer_accounts, signer_seeds);
        transfer(transfer_ctx, amount)?;
        
        Ok(())
    }

    pub fn emergency_resolve_market(ctx: Context<EmergencyResolveMarket>, outcome: WinningOutcome) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(!market.resolved, MarketError::MarketAlreadyResolved);
        require!(outcome != WinningOutcome::Undecided, MarketError::InvalidOutcome);

        let clock = Clock::get()?.unix_timestamp;
        require!(clock > market.end_timestamp + EMERGENCY_PERIOD, MarketError::EmergencyPeriodNotReached);

        require!(ctx.accounts.resolver.key() == market.creator, MarketError::UnauthorizedResolver);

        market.winning_outcome = outcome;
        market.resolved = true;
        Ok(())
    }

    pub fn get_market_price(ctx: Context<GetMarketPrice>, outcome: ShareOutcome) -> Result<u64> {
        let market = &ctx.accounts.market;
        calculate_price(market, &outcome)
    }
}

fn calculate_price(market: &Market, outcome: &ShareOutcome) -> Result<u64> {
    let total_shares = market.yes_shares_outstanding
        .checked_add(market.no_shares_outstanding)
        .ok_or(MarketError::MathOverflow)?;

    require!(total_shares > 0, MarketError::MathOverflow);

    let price = match outcome {
        ShareOutcome::Yes => {
            //Yes price = no_shares / (yes_shares + no_shares)
            (market.no_shares_outstanding * PRICE_PRECISION) / total_shares
        },
        ShareOutcome::No => {
            //No price = yes_shares / (yes_shares + no_shares)
            (market.yes_shares_outstanding * PRICE_PRECISION) / total_shares
        }
    };

    let bounded_price = price.max(MIN_PRICE).min(MAX_PRICE);
    Ok(bounded_price)
}

fn calculate_buy_cost(market: &Market, outcome: &ShareOutcome, shares: u64) -> Result<u64> {
    let current_price = calculate_price(market, outcome)?;
    let price_impact = shares * PRICE_PRECISION / LIQUIDITY_PARAMETER;
    let adjusted_price = current_price + price_impact;

    let cost = (shares * adjusted_price) / PRICE_PRECISION;
    Ok(cost)
}

fn calculate_sell_payout(market: &Market, outcome: &ShareOutcome, shares: u64) -> Result<u64> {
    let current_price = calculate_price(market, outcome)?;
    let price_impact = shares * PRICE_PRECISION / LIQUIDITY_PARAMETER;
    let adjusted_price = current_price.saturating_sub(price_impact);

    let payout = (shares * adjusted_price) / PRICE_PRECISION;
    Ok(payout)
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

#[derive(Accounts)] 
pub struct BuyShares<'info> {
    #[account(mut)]
    pub market:Account<'info, Market>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        token::mint = market.collateral_mint
    )]
    pub user_collateral_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = market.yes_token_mint
    )]
    pub user_yes_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = market.no_token_mint
    )]
    pub user_no_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.collateral_vault
    )]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = market.yes_token_mint
    )]
    pub yes_token_mint: Account<'info, Mint>,
    #[account(
        mut,
        address = market.no_token_mint
    )]
    pub no_token_mint: Account<'info, Mint>,
    ///CHECK: PDA authority
    #[account(
        seeds = [b"authority", market.key().as_ref()],
        bump = market.bump
    )]
    pub market_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>
}

#[derive(Accounts)]
pub struct SellShares<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, token::mint = market.collateral_mint)]
    pub user_collateral_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_yes_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_no_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = market.collateral_vault)]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(mut, address = market.yes_token_mint)]
    pub yes_token_mint: Account<'info, Mint>,
    #[account(mut, address = market.no_token_mint)]
    pub no_token_mint: Account<'info, Mint>,
    ///CHECK: PDA authority
    #[account(
        seeds = [b"authority", market.key().as_ref()],
        bump = market.bump
    )]
    pub market_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    ///CHECK: Resolution source (oracle feed or admin)
    #[account(address = market.resolution_source)]
    pub resolution_source: AccountInfo<'info>,
    pub resolver: Signer<'info>,
}

#[derive(Accounts)]
pub struct RedeemWinnings<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub user: Signer<'info>,
    #[account(mut, token::mint = market.collateral_mint)]
    pub user_collateral_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_winning_token_account: Account<'info, TokenAccount>,
    #[account(mut, address = market.collateral_vault)]
    pub collateral_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub winning_token_mint: Account<'info, Mint>,
    ///CHECK: PDA authority
    #[account(
        seeds = [b"authority", market.key().as_ref()],
        bump = market.bump
    )]
    pub market_authority: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GetMarketPrice<'info> {
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
pub struct EmergencyResolveMarket<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    pub resolver: Signer<'info>,
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
    pub bump: u8,
    pub oracle_threshold: Option<i64>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum WinningOutcome {
    Undecided,
    Yes,
    No,
    Canceled // for situations like match canceled due to rain
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
    #[msg("Oracle data not available, grace period no passed.")]
    OracleNotAvailable,
    #[msg("Emergency resolution period not reached.")]
    EmergencyPeriodNotReached,
    #[msg("Amount cannot be zero.")]
    ZeroAmount,
    #[msg("Invalid token mint for redemption.")]
    InvalidTokenMint,
    #[msg("Invalid outcome provided.")]
    InvalidOutcome,
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
    #[msg("Outcome threshold reqired for oracle markets.")]
    OracleThresholdRequired,   
}