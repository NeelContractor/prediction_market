#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use rust_decimal::{
    prelude::*,
    Decimal
};
use rust_decimal_macros::dec;
use anchor_spl::{
    associated_token::{create_idempotent, AssociatedToken}, 
    metadata::{create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3, Metadata}, 
    token_interface::{Mint, TokenAccount, TokenInterface, Burn, burn, TransferChecked, transfer_checked, MintTo, mint_to}
};

pub const PRECISION: u32 = 6;
pub const DEFAULT_B: u64 = 1_000_000_000;

declare_id!("FqzkXZdwYjurnUKetJCAvaUw5WAqbwzU6gZEwydeEfqS");

#[program]
pub mod prediction_market {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, seed: u64, name: String, token_yes_name: String, token_yes_symbol: String, token_no_name: String, token_no_symbol: String, token_yes_uri: String, token_no_uri: String, fee: u16, end_time: i64) -> Result<()> {
        ctx.accounts.market.set_inner(Market { 
            market_name: name, 
            seed: seed, 
            mint_yes: ctx.accounts.mint_yes.key(), 
            mint_no: ctx.accounts.mint_no.key(), 
            total_liquidity: 0, 
            fee, 
            locked: false, 
            end_time, 
            settled: false, 
            market_bump: ctx.bumps.market 
        });
        create_idempotent(CpiContext::new(
            ctx.accounts.token_program.to_account_info(), 
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.signer.to_account_info(),
                associated_token: ctx.accounts.vault_usdc.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.mint_usdc.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info()
            },
        ))?;
        create_idempotent(CpiContext::new(
            self.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: self.signer.to_account_info(),
                associated_token: self.vault_yes.to_account_info(),
                authority: self.market.to_account_info(),
                mint: self.mint_yes.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            },
        ))?;
        create_idempotent(CpiContext::new(
            self.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: self.signer.to_account_info(),
                associated_token: self.vault_no.to_account_info(),
                authority: self.market.to_account_info(),
                mint: self.mint_no.to_account_info(),
                system_program: self.system_program.to_account_info(),
                token_program: self.token_program.to_account_info(),
            },
        ))?;

        let token_yes_data = DataV2 {
            name: token_yes_name,
            symbol: token_yes_symbol,
            uri: token_yes_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        let token_no_data = DataV2 {
            name: token_no_name,
            symbol: token_no_symbol,
            uri: token_no_uri,
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None
        };

        let seeds = &[
            b"market",
            ctx.accounts.market.seed.to_le_bytes().as_ref(),
            &[ctx.accounts.market.market_bump]
        ];
        let signer_seeds = &[&seeds[..]];

        let metadat_yes_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(), 
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.signer.to_account_info(),
                update_authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.mint_yes.to_account_info(),
                metadata: ctx.accounts.metadata_yes.to_account_info(),
                mint_authority: ctx.accounts.market.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info()
            }, 
            signer_seeds,
        );

        create_metadata_accounts_v3(metadat_yes_ctx, token_yes_data, false, true, None)?;

        let metadata_no_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(), 
            CreateMetadataAccountsV3 {
                payer: ctx.accounts.signer.to_account_info(),
                update_authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.mint_no.to_account_info(),
                metadata: ctx.accounts.metadata_no.to_account_info(),
                mint_authority: ctx.accounts.market.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info()
            }, 
            signer_seeds
        );

        create_metadata_accounts_v3(metadata_no_ctx, token_no_data, false, true, None)?;

        Ok(())
    }

    pub fn add_liquidity(ctx: Context<Deposit>, max_yes: u64, max_no: u64, expiration: i64) -> Result<()> {
        assert_not_locked!(ctx.accounts.market.locked);
        assert_not_expired!(expiration);
        assert_non_zero!([max_yes, max_no]);

        mint_token(ctx, max_yes, true)?;
        mint_token(ctx, max_no, true)?;

        ctx.accounts.market.total_liquidity.checked_add(max_yes.checked_add(max_no).unwrap()).unwrap();
        Ok(())
    }
    pub fn swap(ctx: Context<Swap>, is_usdc_to_token: bool, amount: u64, is_yes: bool, min_out: u64, expiration: i64) -> Result<()> {
        assert_not_locked!(ctx.accounts.market.locked);
        assert_not_expired!(expiration);
        assert_non_zero!([amount_in, min_out]);

        let amount_out = calculate_lmsr_output(amount_in, ctx.accounts.vault_yes.amount, ctx.accounts.vault_no.amount, is_buying, is_yes)?;

        require!(amount_out >= min_out, MarketError::SlippageExceeded);

        if is_buying {
            ctx.accounts.de
        }
        Ok(())
    }
    pub fn settle(ctx: Context<SettleMarket>, is_resolved: bool) -> Result<()> {
        assert_not_locked!(ctx.accounts.market.locked);

        require!(!ctx.accounts.market.settled, MarketError::MarketAlreadySettled);
        require!(Clock::get()?.unix_timestamp > ctx.accounts.market.end_time, MarketError::MarketNotEnded);

        if is_resolved {
            ctx.accounts.market.settled = true;
        } else {
            ctx.accounts.market.settled = false;
        }
        Ok(())
    }
    pub fn claim(ctx: Context<ClaimReward>, is_yes: bool) -> Result<()> {
        assert_not_locked!(ctx.accounts.market.locked);

        require!(!ctx.accounts.market.settled, MarketError::MarketNotSettled);

        let (user_tokens, total_tokens) = if is_yes {
            (ctx.accounts.user_ata_yes.amount, ctx.accounts.mint_yes.supply)
        } else {
            (ctx.accounts.user_ata_no.amount, ctx.accounts.mint_no.supply)
        };

        require!(user_tokens > 0, MarketError::InsufficientBalance);

        let total_payout = ctx.accounts.vault_usdc.amount;

        let user_payout = (user_tokens as u128)
            .checked_mul(total_payout as u128)
            .unwrap()
            .checked_div(total_tokens as u128)
            .unwrap() as u64;

        let accounts = TransferChecked {
            from: ctx.accounts.vault_usdc.to_account_info(),
            mint: ctx.accounts.mint_usdc.to_account_info(),
            to: ctx.accounts.user_ata_usdc.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        };

        let seeds = &[
            b"market",
            ctx.accounts.market.seed.to_le_bytes().as_ref(),
            &[ctx.accounts.market.market_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            accounts,
            signer_seeds,
        );

        transfer_checked(ctx, user_payout, ctx.accounts.mint_usdc.decimals)?;

        let (mint, from) = match is_yes {
            true => (
                ctx.accounts.mint_yes.to_account_info(),
                ctx.accounts.user_ata_yes.to_account_info(),
            ),
            false => (
                ctx.accounts.mint_no.to_account_info(),
                ctx.accounts.user_ata_no.to_account_info(),
            ),
        };

        let cpi_accounts = Burn {
            mint,
            from,
            authority: ctx.accounts.user.to_account_info(),
        };

        let ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);

        burn(ctx, user_tokens)?;

        Ok(())
    }
    pub fn lock(ctx: Context<Update>, is_yes: bool) -> Result<()> {
        ctx.accounts.market.locked = true;
        Ok(())
    }
    pub fn unlock(ctx: Context<Update>, is_yes: bool) -> Result<()> {
        ctx.accounts.market.locked = false;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        seeds = [b"yes_mint", seed.to_le_bytes().as_ref()],
        bump,
        mint::token_program = token_program,
        mint::authority = market,
        mint::decimals = 6
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = signer,
        seeds = [b"no_mint", seed.to_le_bytes().as_ref()],
        bump,
        mint::token_program = token_program,
        mint::authority = market,
        mint::decimals = 6
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,
    pub mint_usdc: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: This account is not read or written in this instruction
    #[account(mut)]
    pub vault_yes: UncheckedAccount<'info>,
    /// CHECK: This account is not read or written in this instruction
    #[account(mut)]
    pub vault_no: UncheckedAccount<'info>,
    /// CHECK: This account is not read or written in this instruction
    #[account(mut)]
    pub vault_usdc: UncheckedAccount<'info>,
    ///CHECK: New Metaplex Account being created
    #[account(mut)]
    pub metadata_yes: UncheckedAccount<'info>,
    ///CHECK: New Metaplex Account being created
    #[account(mut)]
    pub metadata_no: UncheckedAccount<'info>,
    #[account(
        init,
        payer = signer,
        seeds = [b"market", seed.to_le_bytes().as_ref()],
        bump,
        space = 8 + Market::INIT_SPACE
    )]
    pub market: Box<Account<'info, Market>>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = market
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = market
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub mint_usdc: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint_yes,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub vault_yes: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub vault_no: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_usdc,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub vault_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        has_one = mint_yes,
        has_one = mint_no,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.market_bump
    )]
    pub market: Box<Account<'info, Market>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    user: Signer<'info>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = market
    )]
    mint_yes: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = market
    )]
    mint_no: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mint::token_program = token_program,
    )]
    mint_usdc: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint_yes,
        associated_token::authority = market,
    )]
    vault_yes: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = market,
    )]
    vault_no: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_usdc,
        associated_token::authority = market
    )]
    vault_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_yes,
        associated_token::authority = user,
    )]
    user_ata_yes: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint_no,
        associated_token::authority = user,
    )]
    user_ata_no: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_usdc,
        associated_token::authority = user,
    )]
    user_ata_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        has_one = mint_yes,
        has_one = mint_no,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.market_bump,
    )]
    pub market: Box<Account<'info, Market>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.market_bump
    )]
    pub market: Account<'info, Market>,
}
#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = user
    )]
    pub mint_yes: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        mint::token_program = token_program,
        mint::authority = user
    )]
    pub mint_no: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint_usdc: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = mint_yes,
        associated_token::authority = market,
    )]
    pub vault_yes: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = market,
    )]
    pub vault_no: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_usdc,
        associated_token::authority = market
    )]
    pub vault_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_yes,
        associated_token::authority = user,
    )]
    pub user_ata_yes: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_no,
        associated_token::authority = user,
    )]
    pub user_ata_no: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint_usdc,
        associated_token::authority = user,
    )]
    pub user_ata_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        has_one = mint_yes,
        has_one = mint_no,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.market_bump,
    )]
    pub market: Box<Account<'info, Market>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", market.seed.to_le_bytes().as_ref()],
        bump = market.market_bump
    )]
    pub market: Box<Account<'info, Market>>,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    #[max_len(32)]
    pub market_name: String,
    pub seed: u64,
    pub mint_yes: Pubkey,
    pub mint_no: Pubkey,
    pub total_liquidity: u64,
    pub fee: u16,
    pub locked: bool,
    pub end_time: i64,
    pub settled: bool,
    pub market_bump: u8
}

// #[macro_use]
// macro_rules! assert_non_zero {
//     ($array:expr) => {
//         if $array.contains(&0u64) {
//             return err!(MarketError::ZeroBalance)
//         }
//     };
// }

// #[macro_use]
// macro_rules! assert_not_locked {
//     ($lock:expr) => {
//         if $lock == true {
//             return err!(MarketError::PoolLocked)
//         }
//     };
// }

// #[macro_use]
// macro_rules! assert_not_expired {
//     ($expiration:expr) => {
//         if Clock::get()?.unix_timestamp > $expiration {
//             return err!(MarketError::OfferExpired);
//         }
//     };
// }
#[macro_use]
mod macros {
    #[macro_export]
    macro_rules! assert_not_locked {
        ($lock:expr) => {
            if $lock {
                return err!(MarketError::PoolLocked);
            }
        };
    }

    #[macro_export]
    macro_rules! assert_not_expired {
        ($expiration:expr) => {
            if Clock::get()?.unix_timestamp > $expiration {
                return err!(MarketError::OfferExpired);
            }
        };
    }

    #[macro_export]
    macro_rules! assert_non_zero {
        ($array:expr) => {
            if $array.contains(&0u64) {
                return err!(MarketError::ZeroBalance);
            }
        };
    }
}

pub fn mint_token(ctx: Context<'_, '_, '_, '_, Deposit<'_>>, amount: u64, is_yes: bool) -> Result<()> {
    let (to, mint) = match is_yes {
        true => (
            ctx.accounts.vault_yes.to_account_info(),
            ctx.accounts.mint_yes.to_account_info(),
        ),
        false => (
            ctx.accounts.vault_no.to_account_info(),
            ctx.accounts.mint_no.to_account_info(),
        ),
    };

    let cpi_account = MintTo {
        mint,
        to,
        authority: ctx.accounts.market.to_account_info(),
    };

    let seeds = &[
        &b"market"[..],
        &ctx.accounts.market.seed.to_le_bytes(),
        &[ctx.accounts.market.market_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_account,
        signer_seeds,
    );

    mint_to(ctx, amount)
}

#[derive(Debug)]
pub struct LMSRCalculator {
    pub b: Decimal,
    pub yes_shares: Decimal,
    pub no_shares: Decimal
}

impl LMSRCalculator {
    pub fn new(b: u64, yes_shares: u64, no_shares: u64) -> Self {
        Self {
            b: Decimal::from(b),
            yes_shares: Decimal::from(yes_shares),
            no_shares: Decimal::from(no_shares),
        }
    }

    pub fn calculate_cost_to_buy(&self, shares: u64, is_yes: bool) -> Result<u64> {
        let current_cost = self.calculate_cost()?;
        let shares_decimal = Decimal::from(shares);
        
        let new_yes_shares = if is_yes {
            self.yes_shares + shares_decimal
        } else {
            self.yes_shares
        };
        
        let new_no_shares = if !is_yes {
            self.no_shares + shares_decimal
        } else {
            self.no_shares
        };

        let new_cost = Self {
            b: self.b,
            yes_shares: new_yes_shares,
            no_shares: new_no_shares,
        }.calculate_cost()?;

        let cost_difference = new_cost - current_cost;
        Ok(cost_difference.round_dp(PRECISION).to_u64().ok_or(MarketError::MathOverflow)?)
    }

    pub fn calculate_cost(&self) -> Result<Decimal> {
        let yes_term = self.exp(self.yes_shares / self.b)?;
        let no_term = self.exp(self.no_shares / self.b)?;
        
        let sum = yes_term + no_term;
        let result = self.ln(sum)?;
        
        Ok(result * self.b)
    }

    pub fn calculate_price(&self, is_yes: bool) -> Result<Decimal> {
        let yes_term = self.exp(self.yes_shares / self.b)?;
        let no_term = self.exp(self.no_shares / self.b)?;
        
        let denominator = yes_term + no_term;
        let numerator = if is_yes { yes_term } else { no_term };
        
        Ok(numerator / denominator)
    }

    fn exp(&self, x: Decimal) -> Result<Decimal> {
        let mut sum = dec!(1.0);
        let mut term = dec!(1.0);
        
        for i in 1..=10 {
            term = term * x / Decimal::from(i);
            sum += term;
        }
        
        Ok(sum)
    }

    fn ln(&self, x: Decimal) -> Result<Decimal> {
        if x <= dec!(0.0) {
            return Err(MarketError::MathOverflow.into());
        }

        let mut guess = dec!(1.0);
        for _ in 0..10 {
            guess = guess + dec!(2.0) * (x - self.exp(guess)?) / (x + self.exp(guess)?);
        }
        
        Ok(guess)
    }
}

pub fn calculate_lmsr_output(
    input_amount: u64,
    yes_shares: u64,
    no_shares: u64,
    is_buying: bool,
    is_yes: bool,
) -> Result<u64> {
    let calculator = LMSRCalculator::new(DEFAULT_B, yes_shares, no_shares);
    
    // Apply fees (1%)
    let fees = Decimal::from(input_amount) * dec!(0.01);
    let input_after_fees = Decimal::from(input_amount) - fees;

    if is_buying {
        let price = calculator.calculate_price(is_yes)?;
        Ok((input_after_fees / price).round_dp(0).to_u64().ok_or(MarketError::MathOverflow)?)
    } else {
        calculator.calculate_cost_to_buy(input_after_fees.to_u64().unwrap(), is_yes)
    }
}

#[error_code]
pub enum MarketError {
    #[msg("fee percentage can only be between 0 and 100")]
    FeePercentErr,
    #[msg("DefaultError")]
    DefaultError,
    #[msg("Offer expired")]
    OfferExpired,
    #[msg("This pool is locked")]
    PoolLocked,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Overflow detected")]
    Overflow,
    #[msg("Underflow detected")]
    Underflow,
    #[msg("Invalid Token")]
    InvalidToken,
    #[msg("No liquidity in pool")]
    NoLiquidityInPool,
    #[msg("Bump error.")]
    BumpError,
    #[msg("Curve error.")]
    CurveError,
    #[msg("Fee is greater than 100%")]
    InvalidFee,
    #[msg("Invalid update authority")]
    InvalidAuthority,
    #[msg("No update authority set.")]
    NoAuthoritySet,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid precision")]
    InvalidPrecision,
    #[msg("Insufficient balance.")]
    InsufficientBalance,
    #[msg("Zero balance.")]
    ZeroBalance,
    #[msg("Market already settled")]
    MarketAlreadySettled,
    #[msg("Market not settled")]
    MarketNotSettled,
    #[msg("Not authorized to perform this")]
    Unauthorized,
    #[msg("Market is not expired")]
    MarketNotEnded,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
    #[msg("Invalid shares")]
    InvalidShares,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Invalid cost")]
    InvalidCost,
}