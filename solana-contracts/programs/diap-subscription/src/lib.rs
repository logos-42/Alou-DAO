//! DIAP Subscription Program
//! 
//! Subscription management with multi-token support.
//! Adapted from Solidity DIAPSubscription.sol

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("8yH6fF8e9r4q4q4q4q4q4q4q4q4q4q4q4q4q4q4q");

#[program]
pub mod diap_subscription {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        platform_wallet: Pubkey,
    ) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.authority = ctx.accounts.authority.key();
        subscription.platform_wallet = platform_wallet;
        subscription.next_plan_id = 1;
        subscription.next_subscription_id = 1;
        subscription.total_subscriptions = 0;
        subscription.total_revenue = 0;
        subscription.bump = ctx.bumps.subscription;

        Ok(())
    }

    pub fn create_plan(
        ctx: Context<CreatePlan>,
        name: String,
        display_name: String,
        price_usd: u64,
        duration_days: u64,
        supported_tokens: Vec<Pubkey>,
    ) -> Result<u64> {
        require!(duration_days > 0, ErrorCode::InvalidDuration);
        require!(price_usd > 0, ErrorCode::InvalidAmount);
        require!(!supported_tokens.is_empty(), ErrorCode::NoSupportedTokens);
        require!(supported_tokens.len() <= 10, ErrorCode::TooManySupportedTokens);

        let subscription = &mut ctx.accounts.subscription;
        let plan_id = subscription.next_plan_id;

        let plan = &mut ctx.accounts.plan;
        plan.plan_id = plan_id;
        plan.name = name.clone();
        plan.display_name = display_name.clone();
        plan.price_usd = price_usd;
        plan.duration_days = duration_days;
        plan.is_active = true;
        plan.supported_tokens = supported_tokens.clone();
        plan.bump = ctx.bumps.plan;

        subscription.next_plan_id = subscription.next_plan_id.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(PlanCreatedEvent {
            plan_id,
            name,
            price_usd,
            duration_days,
        });

        Ok(plan_id)
    }

    pub fn update_plan_status(
        ctx: Context<UpdatePlan>,
        is_active: bool,
    ) -> Result<()> {
        let plan = &mut ctx.accounts.plan;
        plan.is_active = is_active;

        emit!(PlanUpdatedEvent {
            plan_id: plan.plan_id,
            is_active,
        });

        Ok(())
    }

    pub fn set_token_price(
        ctx: Context<UpdateTokenPrice>,
        token_mint: Pubkey,
        price_usd: u64,
    ) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.token_prices.insert(token_mint, price_usd);

        emit!(TokenPriceUpdatedEvent {
            token_mint,
            price_usd,
        });

        Ok(())
    }

    pub fn create_subscription(
        ctx: Context<CreateSubscription>,
        plan_id: u64,
        token_mint: Pubkey,
        amount: u64,
    ) -> Result<u64> {
        require!(amount > 0, ErrorCode::InvalidAmount);

        let subscription = &mut ctx.accounts.subscription;
        let plan = &ctx.accounts.plan;
        let user = &ctx.accounts.user;

        require!(plan.is_active, ErrorCode::PlanNotActive);

        // Check if token is supported
        let is_supported = plan.supported_tokens.iter().any(|&t| t == token_mint);
        require!(is_supported, ErrorCode::TokenNotSupported);

        // Calculate required amount
        let token_price = subscription.token_prices.get(&token_mint).copied().unwrap_or(0);
        require!(token_price > 0, ErrorCode::TokenPriceNotSet);

        let required_amount = calculate_required_amount(plan.price_usd, token_price);
        require!(amount >= required_amount, ErrorCode::InsufficientPayment);

        let subscription_id = subscription.next_subscription_id;
        let clock = Clock::get()?;
        let started_at = clock.unix_timestamp;
        let expires_at = started_at + (plan.duration_days as i64 * 24 * 60 * 60);

        // Cancel previous active subscription if exists
        if let Ok(active_subscription) = &mut ctx.accounts.active_subscription {
            active_subscription.status = SubscriptionStatus::Cancelled as u8;
        }

        let new_subscription = &mut ctx.accounts.subscription_account;
        new_subscription.subscription_id = subscription_id;
        new_subscription.user = user.key();
        new_subscription.plan_id = plan_id;
        new_subscription.token_mint = token_mint;
        new_subscription.amount_paid = amount;
        new_subscription.started_at = started_at;
        new_subscription.expires_at = expires_at;
        new_subscription.status = SubscriptionStatus::Active as u8;
        new_subscription.bump = ctx.bumps.subscription_account;

        // Update active subscription
        let active_sub = &mut ctx.accounts.active_subscription_record;
        active_sub.user = user.key();
        active_sub.subscription_id = subscription_id;
        active_sub.bump = ctx.bumps.active_subscription_record;

        // Update stats
        subscription.next_subscription_id = subscription.next_subscription_id.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        subscription.total_subscriptions = subscription.total_subscriptions.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        subscription.total_revenue = subscription.total_revenue.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        // Transfer tokens to platform wallet
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.platform_token_account.to_account_info(),
            authority: user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(SubscriptionCreatedEvent {
            subscription_id,
            user: user.key(),
            plan_id,
            token_mint,
            amount,
            expires_at,
        });

        Ok(subscription_id)
    }

    pub fn renew_subscription(ctx: Context<RenewSubscription>) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        let subscription_account = &mut ctx.accounts.subscription_account;
        let plan = &ctx.accounts.plan;
        let user = &ctx.accounts.user;

        require!(subscription_account.user == user.key(), ErrorCode::SubscriptionNotFound);
        require!(subscription_account.status == SubscriptionStatus::Active as u8, ErrorCode::SubscriptionNotActive);

        // Calculate required amount
        let token_price = subscription.token_prices.get(&subscription_account.token_mint).copied().unwrap_or(0);
        require!(token_price > 0, ErrorCode::TokenPriceNotSet);

        let required_amount = calculate_required_amount(plan.price_usd, token_price);

        // Check balance and allowance (simplified - in real implementation would check token account)

        // Transfer tokens to platform wallet
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.platform_token_account.to_account_info(),
            authority: user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, required_amount)?;

        // Extend subscription
        let current_expires_at = subscription_account.expires_at;
        let clock = Clock::get()?;
        
        if current_expires_at < clock.unix_timestamp {
            // If expired, start from now
            subscription_account.started_at = clock.unix_timestamp;
            subscription_account.expires_at = clock.unix_timestamp + (plan.duration_days as i64 * 24 * 60 * 60);
        } else {
            // If not expired, extend from current expiration
            subscription_account.expires_at = current_expires_at + (plan.duration_days as i64 * 24 * 60 * 60);
        }

        subscription_account.amount_paid = subscription_account.amount_paid.checked_add(required_amount).ok_or(ErrorCode::MathOverflow)?;
        subscription.total_revenue = subscription.total_revenue.checked_add(required_amount).ok_or(ErrorCode::MathOverflow)?;

        emit!(SubscriptionRenewedEvent {
            subscription_id: subscription_account.subscription_id,
            user: user.key(),
            expires_at: subscription_account.expires_at,
        });

        Ok(())
    }

    pub fn cancel_subscription(ctx: Context<CancelSubscription>) -> Result<()> {
        let subscription_account = &mut ctx.accounts.subscription_account;
        let user = &ctx.accounts.user;

        require!(subscription_account.user == user.key(), ErrorCode::SubscriptionNotFound);
        require!(subscription_account.status == SubscriptionStatus::Active as u8, ErrorCode::SubscriptionNotActive);

        subscription_account.status = SubscriptionStatus::Cancelled as u8;

        emit!(SubscriptionCancelledEvent {
            subscription_id: subscription_account.subscription_id,
            user: user.key(),
        });

        Ok(())
    }

    pub fn expire_subscription(ctx: Context<ExpireSubscription>) -> Result<()> {
        let subscription_account = &mut ctx.accounts.subscription_account;
        let clock = Clock::get()?;

        require!(subscription_account.status == SubscriptionStatus::Active as u8, ErrorCode::SubscriptionNotActive);
        require!(subscription_account.expires_at <= clock.unix_timestamp, ErrorCode::SubscriptionNotExpired);

        subscription_account.status = SubscriptionStatus::Expired as u8;

        emit!(SubscriptionExpiredEvent {
            subscription_id: subscription_account.subscription_id,
            user: subscription_account.user,
        });

        Ok(())
    }

    pub fn set_platform_wallet(ctx: Context<UpdateConfig>, new_wallet: Pubkey) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.platform_wallet = new_wallet;

        emit!(PlatformWalletUpdatedEvent {
            new_wallet,
        });

        Ok(())
    }
}

// ============ Accounts ============

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + SubscriptionConfig::LEN,
        seeds = [b"subscription"],
        bump
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, display_name: String, price_usd: u64, duration_days: u64, supported_tokens: Vec<Pubkey>)]
pub struct CreatePlan<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + SubscriptionPlan::LEN,
        seeds = [b"plan", subscription.next_plan_id.to_le_bytes().as_ref()],
        bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    
    #[account(
        mut,
        seeds = [b"subscription"],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlan<'info> {
    #[account(
        mut,
        seeds = [b"plan", plan.plan_id.to_le_bytes().as_ref()],
        bump = plan.bump,
        has_one = authority
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTokenPrice<'info> {
    #[account(
        mut,
        seeds = [b"subscription"],
        bump = subscription.bump,
        has_one = authority
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(plan_id: u64, token_mint: Pubkey, amount: u64)]
pub struct CreateSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription"],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    #[account(
        seeds = [b"plan", plan_id.to_le_bytes().as_ref()],
        bump = plan.bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    
    #[account(
        init,
        payer = user,
        space = 8 + SubscriptionAccount::LEN,
        seeds = [b"subscription-account", subscription.next_subscription_id.to_le_bytes().as_ref()],
        bump
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    
    #[account(
        init,
        payer = user,
        space = 8 + ActiveSubscription::LEN,
        seeds = [b"active-subscription", user.key().as_ref()],
        bump
    )]
    pub active_subscription_record: Account<'info, ActiveSubscription>,
    
    #[account(
        mut,
        seeds = [b"active-subscription", user.key().as_ref()],
        bump
    )]
    pub active_subscription: Result<Account<'info, ActiveSubscription>>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = subscription.platform_wallet
    )]
    pub platform_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RenewSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription-account", subscription_account.subscription_id.to_le_bytes().as_ref()],
        bump = subscription_account.bump
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    
    #[account(
        seeds = [b"plan", subscription_account.plan_id.to_le_bytes().as_ref()],
        bump = plan.bump
    )]
    pub plan: Account<'info, SubscriptionPlan>,
    
    #[account(
        mut,
        seeds = [b"subscription"],
        bump = subscription.bump
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    #[account(
        mut,
        token::mint = subscription_account.token_mint,
        token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = subscription_account.token_mint,
        token::authority = subscription.platform_wallet
    )]
    pub platform_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription-account", subscription_account.subscription_id.to_le_bytes().as_ref()],
        bump = subscription_account.bump
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExpireSubscription<'info> {
    #[account(
        mut,
        seeds = [b"subscription-account", subscription_account.subscription_id.to_le_bytes().as_ref()],
        bump = subscription_account.bump
    )]
    pub subscription_account: Account<'info, SubscriptionAccount>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"subscription"],
        bump = subscription.bump,
        has_one = authority
    )]
    pub subscription: Account<'info, SubscriptionConfig>,
    
    pub authority: Signer<'info>,
}

// ============ State ============

#[account]
pub struct SubscriptionConfig {
    pub authority: Pubkey,
    pub platform_wallet: Pubkey,
    pub next_plan_id: u64,
    pub next_subscription_id: u64,
    pub total_subscriptions: u64,
    pub total_revenue: u64,
    pub token_prices: std::collections::BTreeMap<Pubkey, u64>,
    pub bump: u8,
}

impl SubscriptionConfig {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 1000 + 1; // Simplified BTreeMap size
}

#[account]
pub struct SubscriptionPlan {
    pub plan_id: u64,
    pub name: String,
    pub display_name: String,
    pub price_usd: u64,
    pub duration_days: u64,
    pub is_active: bool,
    pub supported_tokens: Vec<Pubkey>,
    pub authority: Pubkey,
    pub bump: u8,
}

impl SubscriptionPlan {
    pub const LEN: usize = 8 + 50 + 100 + 8 + 8 + 1 + 4 + 10 * 32 + 32 + 1;
}

#[account]
pub struct SubscriptionAccount {
    pub subscription_id: u64,
    pub user: Pubkey,
    pub plan_id: u64,
    pub token_mint: Pubkey,
    pub amount_paid: u64,
    pub started_at: i64,
    pub expires_at: i64,
    pub status: u8,
    pub bump: u8,
}

impl SubscriptionAccount {
    pub const LEN: usize = 8 + 32 + 8 + 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct ActiveSubscription {
    pub user: Pubkey,
    pub subscription_id: u64,
    pub bump: u8,
}

impl ActiveSubscription {
    pub const LEN: usize = 32 + 8 + 1;
}

// ============ Events ============

#[event]
pub struct PlanCreatedEvent {
    pub plan_id: u64,
    pub name: String,
    pub price_usd: u64,
    pub duration_days: u64,
}

#[event]
pub struct PlanUpdatedEvent {
    pub plan_id: u64,
    pub is_active: bool,
}

#[event]
pub struct TokenPriceUpdatedEvent {
    pub token_mint: Pubkey,
    pub price_usd: u64,
}

#[event]
pub struct SubscriptionCreatedEvent {
    pub subscription_id: u64,
    pub user: Pubkey,
    pub plan_id: u64,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
}

#[event]
pub struct SubscriptionRenewedEvent {
    pub subscription_id: u64,
    pub user: Pubkey,
    pub expires_at: i64,
}

#[event]
pub struct SubscriptionCancelledEvent {
    pub subscription_id: u64,
    pub user: Pubkey,
}

#[event]
pub struct SubscriptionExpiredEvent {
    pub subscription_id: u64,
    pub user: Pubkey,
}

#[event]
pub struct PlatformWalletUpdatedEvent {
    pub new_wallet: Pubkey,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid plan")]
    InvalidPlan,
    #[msg("Plan not active")]
    PlanNotActive,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Subscription not found")]
    SubscriptionNotFound,
    #[msg("Subscription not active")]
    SubscriptionNotActive,
    #[msg("Subscription not expired")]
    SubscriptionNotExpired,
    #[msg("Token not supported")]
    TokenNotSupported,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("No supported tokens")]
    NoSupportedTokens,
    #[msg("Too many supported tokens")]
    TooManySupportedTokens,
    #[msg("Token price not set")]
    TokenPriceNotSet,
    #[msg("Insufficient payment")]
    InsufficientPayment,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
    #[msg("Math division error")]
    MathDivision,
}

// ============ Enums ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum SubscriptionStatus {
    Active = 0,
    Expired = 1,
    Cancelled = 2,
}

// ============ Utilities ============

fn calculate_required_amount(price_usd: u64, token_price: u64) -> u64 {
    // Simplified calculation: (price_usd * 1e6) / (token_price * 1e6) * 1e9
    if token_price == 0 {
        return 0;
    }
    (price_usd * 1_000_000_000) / token_price
}

// Use a more specific type for the BTreeMap
type TokenPriceMap = std::collections::BTreeMap<Pubkey, u64>;
