//! DIAP Payment Channel Program
//! 
//! State channels for off-chain payments with on-chain settlement.
//! Adapted from Solidity DIAPPaymentChannel.sol

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

#[program]
pub mod diap_payment_channel {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        channel_fee_rate: u16,
    ) -> Result<()> {
        let payment_channel = &mut ctx.accounts.payment_channel;
        payment_channel.authority = ctx.accounts.authority.key();
        payment_channel.token_mint = ctx.accounts.token_mint.key();
        payment_channel.channel_fee_rate = channel_fee_rate;
        payment_channel.bump = ctx.bumps.payment_channel;

        Ok(())
    }

    pub fn open_payment_channel(
        ctx: Context<OpenPaymentChannel>,
        participant2: Pubkey,
        deposit: u64,
        channel_id: String,
    ) -> Result<()> {
        require!(deposit > 0, ErrorCode::DepositMustBeGreaterThanZero);
        require!(channel_id.len() > 0, ErrorCode::ChannelIDRequired);
        require!(!ctx.accounts.channel.is_initialized, ErrorCode::ChannelAlreadyExists);
        require!(participant2 != ctx.accounts.participant1.key(), ErrorCode::CannotOpenChannelWithSelf);

        let clock = Clock::get()?;
        
        // Initialize channel
        let channel = &mut ctx.accounts.channel;
        channel.participant1 = ctx.accounts.participant1.key();
        channel.participant2 = participant2;
        channel.balance1 = deposit;
        channel.balance2 = 0;
        channel.total_deposited = deposit;
        channel.nonce = 0;
        channel.is_active = true;
        channel.last_update = clock.unix_timestamp;
        channel.challenge_deadline = 0;
        channel.channel_id = channel_id.clone();
        channel.bump = ctx.bumps.channel;
        channel.is_initialized = true;

        // Transfer deposit from participant1 to channel vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.participant1_token_account.to_account_info(),
            to: ctx.accounts.channel_vault.to_account_info(),
            authority: ctx.accounts.participant1.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, deposit)?;

        emit!(PaymentChannelOpenedEvent {
            channel_id: channel_id.clone(),
            participant1: ctx.accounts.participant1.key(),
            participant2,
            total_deposit: deposit,
        });

        Ok(())
    }

    pub fn initiate_channel_close(
        ctx: Context<InitiateChannelClose>,
        final_balance1: u64,
        final_balance2: u64,
        nonce: u64,
    ) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        
        require!(channel.is_initialized, ErrorCode::ChannelNotFound);
        require!(channel.is_active, ErrorCode::ChannelNotActive);
        require!(
            ctx.accounts.signer.key() == channel.participant1 || 
            ctx.accounts.signer.key() == channel.participant2,
            ErrorCode::NotChannelParticipant
        );
        require!(nonce > channel.nonce, ErrorCode::NonceMustBeGreater);
        
        let total_final = final_balance1
            .checked_add(final_balance2)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(total_final <= channel.total_deposited, ErrorCode::InvalidBalanceDistribution);

        // Note: Signature verification would happen here in a full implementation
        // For this simplified version, we assume the balances are agreed upon

        channel.balance1 = final_balance1;
        channel.balance2 = final_balance2;
        channel.nonce = nonce;
        channel.challenge_deadline = Clock::get()?.unix_timestamp + (24 * 60 * 60); // 24 hours

        emit!(PaymentChannelClosedEvent {
            channel_id: channel.channel_id.clone(),
            final_balance1,
            final_balance2,
        });

        Ok(())
    }

    pub fn challenge_channel_close(
        ctx: Context<ChallengeChannelClose>,
        new_balance1: u64,
        new_balance2: u64,
        new_nonce: u64,
    ) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        
        require!(channel.is_initialized, ErrorCode::ChannelNotFound);
        require!(channel.is_active, ErrorCode::ChannelNotActive);
        require!(channel.challenge_deadline > 0, ErrorCode::NoActiveChallengePeriod);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < channel.challenge_deadline, ErrorCode::ChallengePeriodExpired);
        
        require!(
            ctx.accounts.signer.key() == channel.participant1 || 
            ctx.accounts.signer.key() == channel.participant2,
            ErrorCode::NotChannelParticipant
        );
        require!(new_nonce > channel.nonce, ErrorCode::NewNonceMustBeGreater);
        
        let total_new = new_balance1
            .checked_add(new_balance2)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(total_new <= channel.total_deposited, ErrorCode::InvalidBalanceDistribution);

        // Note: Signature verification would happen here in a full implementation

        channel.balance1 = new_balance1;
        channel.balance2 = new_balance2;
        channel.nonce = new_nonce;

        emit!(ChannelChallengedEvent {
            channel_id: channel.channel_id.clone(),
            new_nonce,
            new_balance1,
            new_balance2,
        });

        Ok(())
    }

    pub fn finalize_channel_close(ctx: Context<FinalizeChannelClose>) -> Result<()> {
        let channel = &mut ctx.accounts.channel;
        
        require!(channel.is_initialized, ErrorCode::ChannelNotFound);
        require!(channel.is_active, ErrorCode::ChannelNotActive);
        require!(channel.challenge_deadline > 0, ErrorCode::NoActiveChallengePeriod);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= channel.challenge_deadline, ErrorCode::ChallengePeriodNotEnded);

        // Calculate fee
        let fee = channel.total_deposited
            .checked_mul(ctx.accounts.payment_channel.channel_fee_rate as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathDivision)?;
        
        let total_to_distribute = channel.balance1
            .checked_add(channel.balance2)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(total_to_distribute + fee <= channel.total_deposited, ErrorCode::InsufficientFunds);

        // Get channel values before mutable borrow
        let balance1 = channel.balance1;
        let balance2 = channel.balance2;
        let channel_id = channel.channel_id.clone();
        let bump = channel.bump;

        // Distribute funds to participants
        if balance1 > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.channel_vault.to_account_info(),
                to: ctx.accounts.participant1_token_account.to_account_info(),
                authority: channel.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            
            let seeds = &[
                b"channel", 
                channel_id.as_bytes(),
                &[bump]
            ];
            let signer_seeds = &[&seeds[..]];
            
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, balance1)?;
        }

        if balance2 > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.channel_vault.to_account_info(),
                to: ctx.accounts.participant2_token_account.to_account_info(),
                authority: channel.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            
            let seeds = &[
                b"channel", 
                channel_id.as_bytes(),
                &[bump]
            ];
            let signer_seeds = &[&seeds[..]];
            
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
            token::transfer(cpi_ctx, balance2)?;
        }

        channel.is_active = false;

        Ok(())
    }

    pub fn set_channel_fee_rate(ctx: Context<UpdateChannelFeeRate>, rate: u16) -> Result<()> {
        require!(rate <= 100, ErrorCode::RateTooHigh);
        
        let payment_channel = &mut ctx.accounts.payment_channel;
        payment_channel.channel_fee_rate = rate;

        emit!(ChannelFeeRateUpdatedEvent {
            new_rate: rate,
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
        space = 8 + PaymentChannelProgram::LEN,
        seeds = [b"payment-channel-program", token_mint.key().as_ref()],
        bump
    )]
    pub payment_channel: Account<'info, PaymentChannelProgram>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(participant2: Pubkey, deposit: u64, channel_id: String)]
pub struct OpenPaymentChannel<'info> {
    #[account(
        init,
        payer = participant1,
        space = 8 + PaymentChannel::LEN,
        seeds = [b"channel", channel_id.as_bytes()],
        bump
    )]
    pub channel: Account<'info, PaymentChannel>,
    
    #[account(
        mut,
        seeds = [b"payment-channel-program", token_mint.key().as_ref()],
        bump = payment_channel.bump
    )]
    pub payment_channel: Account<'info, PaymentChannelProgram>,
    
    #[account(
        init_if_needed,
        payer = participant1,
        token::mint = token_mint,
        token::authority = participant1,
        seeds = [b"token-account", participant1.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub participant1_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init_if_needed,
        payer = participant1,
        token::mint = token_mint,
        token::authority = channel,
        seeds = [b"channel-vault", channel_id.as_bytes()],
        bump
    )]
    pub channel_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Participant1 address
    #[account(mut)]
    pub participant1: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(final_balance1: u64, final_balance2: u64, nonce: u64)]
pub struct InitiateChannelClose<'info> {
    #[account(
        mut,
        seeds = [b"channel", channel.channel_id.as_bytes()],
        bump = channel.bump
    )]
    pub channel: Account<'info, PaymentChannel>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(new_balance1: u64, new_balance2: u64, new_nonce: u64)]
pub struct ChallengeChannelClose<'info> {
    #[account(
        mut,
        seeds = [b"channel", channel.channel_id.as_bytes()],
        bump = channel.bump
    )]
    pub channel: Account<'info, PaymentChannel>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct FinalizeChannelClose<'info> {
    #[account(
        mut,
        seeds = [b"channel", channel.channel_id.as_bytes()],
        bump = channel.bump
    )]
    pub channel: Account<'info, PaymentChannel>,
    
    #[account(
        mut,
        constraint = channel_vault.key() == get_channel_vault_pda(&channel.channel_id)
    )]
    pub channel_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = payment_channel.token_mint,
        token::authority = channel.participant1
    )]
    pub participant1_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = payment_channel.token_mint,
        token::authority = channel.participant2
    )]
    pub participant2_token_account: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [b"payment-channel-program", payment_channel.token_mint.as_ref()],
        bump = payment_channel.bump
    )]
    pub payment_channel: Account<'info, PaymentChannelProgram>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateChannelFeeRate<'info> {
    #[account(
        mut,
        seeds = [b"payment-channel-program", token_mint.key().as_ref()],
        bump = payment_channel.bump,
        has_one = authority
    )]
    pub payment_channel: Account<'info, PaymentChannelProgram>,
    
    pub token_mint: Account<'info, Mint>,
    pub authority: Signer<'info>,
}

// ============ State ============

#[account]
pub struct PaymentChannelProgram {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub channel_fee_rate: u16,
    pub bump: u8,
}

impl PaymentChannelProgram {
    pub const LEN: usize = 32 + 32 + 2 + 1;
}

#[account]
pub struct PaymentChannel {
    pub participant1: Pubkey,
    pub participant2: Pubkey,
    pub balance1: u64,
    pub balance2: u64,
    pub total_deposited: u64,
    pub nonce: u64,
    pub is_active: bool,
    pub last_update: i64,
    pub challenge_deadline: i64,
    pub channel_id: String,
    pub bump: u8,
    pub is_initialized: bool,
}

impl PaymentChannel {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 100 + 1 + 1;
}

// ============ Events ============

#[event]
pub struct PaymentChannelOpenedEvent {
    #[index]
    pub channel_id: String,
    pub participant1: Pubkey,
    pub participant2: Pubkey,
    pub total_deposit: u64,
}

#[event]
pub struct PaymentChannelClosedEvent {
    #[index]
    pub channel_id: String,
    pub final_balance1: u64,
    pub final_balance2: u64,
}

#[event]
pub struct ChannelChallengedEvent {
    #[index]
    pub channel_id: String,
    pub new_nonce: u64,
    pub new_balance1: u64,
    pub new_balance2: u64,
}

#[event]
pub struct ChannelFeeRateUpdatedEvent {
    pub new_rate: u16,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Deposit must be greater than zero")]
    DepositMustBeGreaterThanZero,
    #[msg("Channel ID required")]
    ChannelIDRequired,
    #[msg("Channel already exists")]
    ChannelAlreadyExists,
    #[msg("Cannot open channel with self")]
    CannotOpenChannelWithSelf,
    #[msg("Invalid participant address")]
    InvalidParticipantAddress,
    #[msg("Channel not found")]
    ChannelNotFound,
    #[msg("Channel not active")]
    ChannelNotActive,
    #[msg("Not channel participant")]
    NotChannelParticipant,
    #[msg("Nonce must be greater than current nonce")]
    NonceMustBeGreater,
    #[msg("Invalid balance distribution")]
    InvalidBalanceDistribution,
    #[msg("No active challenge period")]
    NoActiveChallengePeriod,
    #[msg("Challenge period expired")]
    ChallengePeriodExpired,
    #[msg("New nonce must be greater than current nonce")]
    NewNonceMustBeGreater,
    #[msg("Challenge period not ended")]
    ChallengePeriodNotEnded,
    #[msg("Insufficient funds")]
    InsufficientFunds,
    #[msg("Rate too high")]
    RateTooHigh,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math division error")]
    MathDivision,
}

// ============ Utilities ============

fn get_channel_vault_pda(channel_id: &str) -> Pubkey {
    Pubkey::find_program_address(&[b"channel-vault", channel_id.as_bytes()], &ID).0
}
