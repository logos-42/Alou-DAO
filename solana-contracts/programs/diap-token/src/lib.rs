//! DIAP Token Program
//! 
//! This program manages the DIAP token, an SPL Token with staking, 
//! burning, and reward distribution features.
//!
//! Adapted from Solidity DIAPToken.sol to Solana/Anchor.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};

declare_id!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

#[program]
pub mod diap_token {
    use super::*;

    /// Initialize the DIAP token mint
    pub fn initialize_token(
        ctx: Context<InitializeToken>,
        token_name: String,
        token_symbol: String,
        decimals: u8,
        max_supply: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.token_mint = ctx.accounts.token_mint.key();
        config.token_name = token_name;
        config.token_symbol = token_symbol;
        config.max_supply = max_supply;
        config.decimals = decimals;
        config.total_supply = 0;
        config.total_burned = 0;
        config.staking_reward_rate = 500; // 5% APY
        config.burn_rate = 25; // 0.25%
        config.emergency_paused = false;
        config.emergency_withdraw_enabled = false;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    /// Mint tokens (authority only)
    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let config = &ctx.accounts.config;

        require!(!config.emergency_paused, ErrorCode::ContractEmergencyPaused);
        require!(
            config.total_supply.checked_add(amount).ok_or(ErrorCode::MathOverflow)? <= config.max_supply,
            ErrorCode::ExceedsMaxSupply
        );

        // Mint tokens to recipient
        let seeds = &[
            b"config",
            config.token_mint.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = MintTo {
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::mint_to(cpi_ctx, amount)?;

        // Update total supply
        let config = &mut ctx.accounts.config;
        config.total_supply = config.total_supply.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        emit!(TokensMintedEvent {
            to: ctx.accounts.recipient.key(),
            amount,
            total_supply: config.total_supply,
        });

        Ok(())
    }

    /// Stake tokens
    pub fn stake(ctx: Context<Stake>, amount: u64, tier: u8) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(!config.emergency_paused, ErrorCode::ContractEmergencyPaused);
        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);
        require!(tier <= 3, ErrorCode::InvalidTier);

        let staking_tier = get_staking_tier(tier)?;
        require!(amount >= staking_tier.min_amount, ErrorCode::AmountBelowTierMinimum);

        let clock = Clock::get()?;
        let staking_info = &mut ctx.accounts.staking_info;

        if staking_info.amount > 0 {
            // Add to existing stake
            let existing_rewards = calculate_rewards(staking_info, config, clock.unix_timestamp)?;
            staking_info.pending_rewards = staking_info.pending_rewards.checked_add(existing_rewards).ok_or(ErrorCode::MathOverflow)?;
            staking_info.amount = staking_info.amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
            staking_info.last_claim_time = clock.unix_timestamp;
        } else {
            // New stake
            staking_info.authority = ctx.accounts.signer.key();
            staking_info.amount = amount;
            staking_info.start_time = clock.unix_timestamp;
            staking_info.lock_period = staking_tier.lock_period;
            staking_info.tier = tier;
            staking_info.last_claim_time = clock.unix_timestamp;
            staking_info.pending_rewards = 0;
        }

        // Transfer tokens to staking pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.staking_pool_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(StakedEvent {
            user: ctx.accounts.signer.key(),
            amount,
            tier,
            lock_period: staking_tier.lock_period,
        });

        Ok(())
    }

    /// Unstake tokens
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        let staking_info = &mut ctx.accounts.staking_info;
        let clock = Clock::get()?;

        require!(staking_info.amount > 0, ErrorCode::NoStakingFound);
        require!(
            clock.unix_timestamp >= staking_info.start_time + staking_info.lock_period,
            ErrorCode::LockPeriodNotEnded
        );

        let amount = staking_info.amount;
        let config = &ctx.accounts.config;
        let rewards = calculate_rewards(staking_info, config, clock.unix_timestamp)?;

        // Transfer staked tokens back
        let seeds = &[
            b"staking-pool",
            config.token_mint.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.staking_pool_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        // Distribute rewards if any
        if rewards > 0 {
            distribute_rewards(
                ctx.accounts.config.to_account_info(),
                ctx.accounts.user_token_account.to_account_info(),
                ctx.accounts.staking_pool_token_account.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                rewards,
                signer_seeds,
            )?;
        }

        // Clear staking info
        staking_info.amount = 0;
        staking_info.pending_rewards = 0;

        emit!(UnstakedEvent {
            user: ctx.accounts.signer.key(),
            amount,
            rewards,
        });

        Ok(())
    }

    /// Claim staking rewards
    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let staking_info = &mut ctx.accounts.staking_info;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        require!(staking_info.amount > 0, ErrorCode::NoStakingFound);

        let rewards = calculate_rewards(staking_info, config, clock.unix_timestamp)?;
        require!(rewards > 0, ErrorCode::NoRewardsToClaim);

        staking_info.last_claim_time = clock.unix_timestamp;
        staking_info.pending_rewards = 0;

        // Transfer rewards
        let seeds = &[
            b"staking-pool",
            config.token_mint.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        distribute_rewards(
            ctx.accounts.config.to_account_info(),
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.staking_pool_token_account.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            rewards,
            signer_seeds,
        )?;

        emit!(RewardsClaimedEvent {
            user: ctx.accounts.signer.key(),
            amount: rewards,
        });

        Ok(())
    }

    /// Burn tokens
    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64, reason: String) -> Result<()> {
        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);

        let config = &mut ctx.accounts.config;

        // Burn tokens
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.token_mint.to_account_info(),
                    from: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.signer.to_account_info(),
                },
            ),
            amount,
        )?;

        config.total_burned = config.total_burned.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
        config.total_supply = config.total_supply.checked_sub(amount).ok_or(ErrorCode::MathUnderflow)?;

        emit!(TokensBurnedEvent {
            from: ctx.accounts.signer.key(),
            amount,
            reason,
        });

        Ok(())
    }

    /// Update token configuration (authority only)
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_reward_rate: Option<u16>,
        new_burn_rate: Option<u16>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(rate) = new_reward_rate {
            config.staking_reward_rate = rate;
        }
        if let Some(rate) = new_burn_rate {
            require!(rate <= 100, ErrorCode::RateTooHigh);
            config.burn_rate = rate;
        }

        emit!(ConfigUpdatedEvent {
            reward_rate: config.staking_reward_rate,
            burn_rate: config.burn_rate,
        });

        Ok(())
    }

    /// Emergency pause
    pub fn emergency_pause(ctx: Context<EmergencyControl>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.emergency_paused = !config.emergency_paused;

        emit!(EmergencyPausedEvent {
            paused: config.emergency_paused,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Enable emergency withdraw
    pub fn enable_emergency_withdraw(ctx: Context<EmergencyControl>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.emergency_withdraw_enabled = true;

        emit!(EmergencyWithdrawEnabledEvent {
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Emergency withdraw (when enabled)
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>) -> Result<()> {
        let config = &ctx.accounts.config;
        require!(config.emergency_withdraw_enabled, ErrorCode::EmergencyWithdrawNotEnabled);

        let staking_info = &mut ctx.accounts.staking_info;
        require!(staking_info.amount > 0, ErrorCode::NoStakingFound);

        let amount = staking_info.amount;
        staking_info.amount = 0;
        staking_info.pending_rewards = 0;

        // Transfer staked tokens back
        let seeds = &[
            b"staking-pool",
            config.token_mint.as_ref(),
            &[config.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.staking_pool_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        emit!(EmergencyWithdrawEvent {
            user: ctx.accounts.signer.key(),
            amount,
        });

        Ok(())
    }

    /// Replenish staking pool (authority only)
    pub fn replenish_staking_pool(ctx: Context<ReplenishStakingPool>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);

        // Transfer tokens to staking pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.authority_token_account.to_account_info(),
            to: ctx.accounts.staking_pool_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(StakingPoolReplenishedEvent {
            from: ctx.accounts.authority.key(),
            amount,
        });

        Ok(())
    }
}

// ============ Accounts ============

#[derive(Accounts)]
pub struct InitializeToken<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + TokenConfig::LEN,
        seeds = [b"config", token_mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = config,
        mint::freeze_authority = config,
    )]
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint,
        has_one = authority
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        constraint = recipient_token_account.mint == config.token_mint
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    
    /// CHECK: Recipient address
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + StakingInfo::LEN,
        seeds = [b"staking-info", signer.key().as_ref()],
        bump
    )]
    pub staking_info: Account<'info, StakingInfo>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == config.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = staking_pool_token_account.key() == get_staking_pool_pda(&config.token_mint)
    )]
    pub staking_pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        seeds = [b"staking-info", signer.key().as_ref()],
        bump = staking_info.bump
    )]
    pub staking_info: Account<'info, StakingInfo>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == config.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = staking_pool_token_account.key() == get_staking_pool_pda(&config.token_mint)
    )]
    pub staking_pool_token_account: Account<'info, TokenAccount>,
    
    pub signer: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        seeds = [b"staking-info", signer.key().as_ref()],
        bump = staking_info.bump
    )]
    pub staking_info: Account<'info, StakingInfo>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == config.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = staking_pool_token_account.key() == get_staking_pool_pda(&config.token_mint)
    )]
    pub staking_pool_token_account: Account<'info, TokenAccount>,
    
    pub signer: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == config.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, TokenConfig>,
    
    pub token_mint: Account<'info, Mint>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyControl<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, TokenConfig>,
    
    pub token_mint: Account<'info, Mint>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        seeds = [b"staking-info", signer.key().as_ref()],
        bump = staking_info.bump
    )]
    pub staking_info: Account<'info, StakingInfo>,
    
    #[account(
        mut,
        constraint = user_token_account.mint == config.token_mint
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = staking_pool_token_account.key() == get_staking_pool_pda(&config.token_mint)
    )]
    pub staking_pool_token_account: Account<'info, TokenAccount>,
    
    pub signer: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReplenishStakingPool<'info> {
    #[account(
        mut,
        seeds = [b"config", token_mint.key().as_ref()],
        bump = config.bump,
        has_one = authority,
        has_one = token_mint
    )]
    pub config: Account<'info, TokenConfig>,
    
    #[account(
        mut,
        constraint = authority_token_account.mint == config.token_mint
    )]
    pub authority_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = staking_pool_token_account.key() == get_staking_pool_pda(&config.token_mint)
    )]
    pub staking_pool_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

// ============ State ============

#[account]
pub struct TokenConfig {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub token_name: String,
    pub token_symbol: String,
    pub max_supply: u64,
    pub decimals: u8,
    pub total_supply: u64,
    pub total_burned: u64,
    pub staking_reward_rate: u16,
    pub burn_rate: u16,
    pub emergency_paused: bool,
    pub emergency_withdraw_enabled: bool,
    pub bump: u8,
}

impl TokenConfig {
    pub const LEN: usize = 32 + 32 + 50 + 10 + 8 + 1 + 8 + 8 + 2 + 2 + 1 + 1 + 1;
}

#[account]
pub struct StakingInfo {
    pub authority: Pubkey,
    pub amount: u64,
    pub start_time: i64,
    pub lock_period: i64,
    pub tier: u8,
    pub last_claim_time: i64,
    pub pending_rewards: u64,
    pub bump: u8,
}

impl StakingInfo {
    pub const LEN: usize = 32 + 8 + 8 + 8 + 1 + 8 + 8 + 1;
}

pub struct StakingTier {
    pub min_amount: u64,
    pub multiplier: u16,
    pub lock_period: i64,
}

// ============ Events ============

#[event]
pub struct TokensMintedEvent {
    pub to: Pubkey,
    pub amount: u64,
    pub total_supply: u64,
}

#[event]
pub struct StakedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub tier: u8,
    pub lock_period: i64,
}

#[event]
pub struct UnstakedEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub rewards: u64,
}

#[event]
pub struct RewardsClaimedEvent {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TokensBurnedEvent {
    pub from: Pubkey,
    pub amount: u64,
    pub reason: String,
}

#[event]
pub struct ConfigUpdatedEvent {
    pub reward_rate: u16,
    pub burn_rate: u16,
}

#[event]
pub struct EmergencyPausedEvent {
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawEnabledEvent {
    pub timestamp: i64,
}

#[event]
pub struct EmergencyWithdrawEvent {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StakingPoolReplenishedEvent {
    pub from: Pubkey,
    pub amount: u64,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Contract is emergency paused")]
    ContractEmergencyPaused,
    #[msg("Amount must be greater than zero")]
    AmountMustBeGreaterThanZero,
    #[msg("Invalid tier")]
    InvalidTier,
    #[msg("Amount below tier minimum")]
    AmountBelowTierMinimum,
    #[msg("No staking found")]
    NoStakingFound,
    #[msg("Lock period not ended")]
    LockPeriodNotEnded,
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
    #[msg("Exceeds max supply")]
    ExceedsMaxSupply,
    #[msg("Rate too high")]
    RateTooHigh,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
    #[msg("Math division error")]
    MathDivision,
    #[msg("Emergency withdraw not enabled")]
    EmergencyWithdrawNotEnabled,
}

// ============ Utilities ============

fn get_staking_tier(tier: u8) -> Result<StakingTier> {
    match tier {
        0 => Ok(StakingTier {
            min_amount: 1_000 * 10u64.pow(9), // 1000 tokens
            multiplier: 10000, // 1x
            lock_period: 30 * 24 * 60 * 60, // 30 days
        }),
        1 => Ok(StakingTier {
            min_amount: 10_000 * 10u64.pow(9), // 10000 tokens
            multiplier: 15000, // 1.5x
            lock_period: 90 * 24 * 60 * 60, // 90 days
        }),
        2 => Ok(StakingTier {
            min_amount: 50_000 * 10u64.pow(9), // 50000 tokens
            multiplier: 20000, // 2x
            lock_period: 180 * 24 * 60 * 60, // 180 days
        }),
        3 => Ok(StakingTier {
            min_amount: 100_000 * 10u64.pow(9), // 100000 tokens
            multiplier: 30000, // 3x
            lock_period: 365 * 24 * 60 * 60, // 365 days
        }),
        _ => Err(ErrorCode::InvalidTier.into()),
    }
}

fn calculate_rewards(
    staking_info: &StakingInfo,
    config: &TokenConfig,
    current_time: i64,
) -> Result<u64> {
    let time_elapsed = current_time.checked_sub(staking_info.last_claim_time).ok_or(ErrorCode::MathUnderflow)?;
    
    if time_elapsed <= 0 {
        return Ok(staking_info.pending_rewards);
    }

    let tier = get_staking_tier(staking_info.tier)?;
    
    // Base rewards: amount * rate * time / (365 days * 10000)
    let base_rewards = staking_info.amount
        .checked_mul(config.staking_reward_rate as u64)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(time_elapsed as u64)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(365 * 24 * 60 * 60 * 10000)
        .ok_or(ErrorCode::MathDivision)?;
    
    // Apply tier multiplier
    let tier_rewards = base_rewards
        .checked_mul(tier.multiplier as u64)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10000)
        .ok_or(ErrorCode::MathDivision)?;
    
    Ok(staking_info.pending_rewards.checked_add(tier_rewards).ok_or(ErrorCode::MathOverflow)?)
}

fn distribute_rewards<'info>(
    config: AccountInfo<'info>,
    recipient_token_account: AccountInfo<'info>,
    staking_pool_token_account: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: staking_pool_token_account,
        to: recipient_token_account,
        authority: config,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)?;
    
    Ok(())
}

fn get_staking_pool_pda(token_mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"staking-pool", token_mint.as_ref()], &ID).0
}
