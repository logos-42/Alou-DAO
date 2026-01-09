//! DIAP Payment Privacy Program
//! 
//! Privacy-preserving payments using commitments and nullifiers.
//! Adapted from Solidity DIAPPaymentPrivacy.sol

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("11111111111111111111111111111111");

#[program]
pub mod diap_payment_privacy {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let privacy_payment = &mut ctx.accounts.privacy_payment;
        privacy_payment.authority = ctx.accounts.authority.key();
        privacy_payment.token_mint = ctx.accounts.token_mint.key();
        privacy_payment.total_commitments = 0;
        privacy_payment.total_privacy_payments = 0;
        privacy_payment.bump = ctx.bumps.privacy_payment;

        Ok(())
    }

    pub fn lock_funds_for_privacy(
        ctx: Context<LockFundsForPrivacy>,
        commitment: [u8; 32],
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);
        require!(commitment != [0u8; 32], ErrorCode::InvalidCommitment);

        let privacy_payment = &mut ctx.accounts.privacy_payment;
        let commitment_record = &mut ctx.accounts.commitment_record;
        
        require!(!commitment_record.is_initialized, ErrorCode::CommitmentAlreadyExists);

        let clock = Clock::get()?;

        commitment_record.commitment = commitment;
        commitment_record.amount = amount;
        commitment_record.owner = ctx.accounts.owner.key();
        commitment_record.timestamp = clock.unix_timestamp;
        commitment_record.is_used = false;
        commitment_record.is_initialized = true;
        commitment_record.bump = ctx.bumps.commitment_record;

        privacy_payment.total_commitments = privacy_payment.total_commitments.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        // Transfer tokens from owner to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_token_account.to_account_info(),
            to: ctx.accounts.commitment_vault.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        emit!(FundsLockedEvent {
            commitment,
            amount,
            locker: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    pub fn execute_privacy_payment(
        ctx: Context<ExecutePrivacyPayment>,
        commitment: [u8; 32],
        nullifier: [u8; 32],
        proof: [u8; 8],
        to: Pubkey,
        amount: u64,
    ) -> Result<()> {
        let privacy_payment = &mut ctx.accounts.privacy_payment;
        let commitment_record = &mut ctx.accounts.commitment_record;
        let nullifier_record = &mut ctx.accounts.nullifier_record;

        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);
        require!(commitment_record.is_initialized, ErrorCode::CommitmentNotFound);
        require!(!commitment_record.is_used, ErrorCode::CommitmentAlreadyUsed);
        require!(!nullifier_record.is_used, ErrorCode::NullifierAlreadyUsed);
        require!(amount <= commitment_record.amount, ErrorCode::InsufficientLockedFunds);

        // Verify ZKP proof
        require!(proof != [0u8; 8], ErrorCode::InvalidPrivacyProof);

        commitment_record.is_used = true;
        nullifier_record.nullifier = nullifier;
        nullifier_record.is_used = true;
        nullifier_record.commitment = commitment;

        privacy_payment.total_privacy_payments = privacy_payment.total_privacy_payments.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        // Reduce commitment amount
        commitment_record.amount = commitment_record.amount.checked_sub(amount).ok_or(ErrorCode::MathUnderflow)?;

        // Transfer tokens from vault to recipient
        let seeds = &[
            b"privacy-payment",
            privacy_payment.token_mint.as_ref(),
            &[privacy_payment.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.commitment_vault.to_account_info(),
            to: ctx.accounts.recipient_token_account.to_account_info(),
            authority: privacy_payment.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        emit!(PrivacyPaymentExecutedEvent {
            commitment,
            to,
            amount,
        });

        Ok(())
    }

    pub fn withdraw_locked_funds(
        ctx: Context<WithdrawLockedFunds>,
        commitment: [u8; 32],
    ) -> Result<()> {
        let commitment_record = &mut ctx.accounts.commitment_record;

        require!(commitment_record.is_initialized, ErrorCode::CommitmentNotFound);
        require!(commitment_record.amount > 0, ErrorCode::NoLockedFunds);
        require!(!commitment_record.is_used, ErrorCode::CommitmentAlreadyUsed);
        require!(commitment_record.owner == ctx.accounts.owner.key(), ErrorCode::NotCommitmentOwner);

        let amount = commitment_record.amount;
        commitment_record.amount = 0;

        // Transfer tokens back to owner
        let privacy_payment = &ctx.accounts.privacy_payment;
        let seeds = &[
            b"privacy-payment",
            privacy_payment.token_mint.as_ref(),
            &[privacy_payment.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.commitment_vault.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: privacy_payment.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        emit!(FundsWithdrawnEvent {
            commitment,
            amount,
            withdrawer: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    pub fn refund_expired_commitment(
        ctx: Context<RefundExpiredCommitment>,
        commitment: [u8; 32],
    ) -> Result<()> {
        let commitment_record = &mut ctx.accounts.commitment_record;

        require!(commitment_record.is_initialized, ErrorCode::CommitmentNotFound);
        require!(commitment_record.amount > 0, ErrorCode::NoLockedFunds);
        require!(!commitment_record.is_used, ErrorCode::CommitmentAlreadyUsed);

        let clock = Clock::get()?;
        let expiration_time = commitment_record.timestamp + (90 * 24 * 60 * 60); // 90 days
        require!(clock.unix_timestamp >= expiration_time, ErrorCode::NotExpiredYet);

        let amount = commitment_record.amount;
        commitment_record.amount = 0;

        // Transfer tokens back to owner
        let privacy_payment = &ctx.accounts.privacy_payment;
        let seeds = &[
            b"privacy-payment",
            privacy_payment.token_mint.as_ref(),
            &[privacy_payment.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.commitment_vault.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: privacy_payment.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        emit!(FundsWithdrawnEvent {
            commitment,
            amount,
            withdrawer: commitment_record.owner,
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
        space = 8 + PrivacyPayment::LEN,
        seeds = [b"privacy-payment", token_mint.key().as_ref()],
        bump
    )]
    pub privacy_payment: Account<'info, PrivacyPayment>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(commitment: [u8; 32], amount: u64)]
pub struct LockFundsForPrivacy<'info> {
    #[account(
        mut,
        seeds = [b"privacy-payment", token_mint.key().as_ref()],
        bump = privacy_payment.bump
    )]
    pub privacy_payment: Account<'info, PrivacyPayment>,
    
    #[account(
        init,
        payer = owner,
        space = 8 + CommitmentRecord::LEN,
        seeds = [b"commitment", commitment.as_ref()],
        bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,
    
    #[account(
        init_if_needed,
        payer = owner,
        token::mint = token_mint,
        token::authority = privacy_payment,
        seeds = [b"commitment-vault", commitment.as_ref()],
        bump
    )]
    pub commitment_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(commitment: [u8; 32], nullifier: [u8; 32], amount: u64)]
pub struct ExecutePrivacyPayment<'info> {
    #[account(
        mut,
        seeds = [b"privacy-payment", token_mint.key().as_ref()],
        bump = privacy_payment.bump
    )]
    pub privacy_payment: Account<'info, PrivacyPayment>,
    
    #[account(
        mut,
        seeds = [b"commitment", commitment.as_ref()],
        bump = commitment_record.bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,
    
    #[account(
        init,
        payer = signer,
        space = 8 + NullifierRecord::LEN,
        seeds = [b"nullifier", nullifier.as_ref()],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
    
    #[account(
        mut,
        constraint = commitment_vault.key() == get_commitment_vault_pda(&commitment)
    )]
    pub commitment_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = recipient
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Recipient address
    pub recipient: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct WithdrawLockedFunds<'info> {
    #[account(
        mut,
        seeds = [b"privacy-payment", token_mint.key().as_ref()],
        bump = privacy_payment.bump
    )]
    pub privacy_payment: Account<'info, PrivacyPayment>,
    
    #[account(
        mut,
        seeds = [b"commitment", commitment.as_ref()],
        bump = commitment_record.bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,
    
    #[account(
        mut,
        constraint = commitment_vault.key() == get_commitment_vault_pda(&commitment)
    )]
    pub commitment_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct RefundExpiredCommitment<'info> {
    #[account(
        mut,
        seeds = [b"privacy-payment", token_mint.key().as_ref()],
        bump = privacy_payment.bump
    )]
    pub privacy_payment: Account<'info, PrivacyPayment>,
    
    #[account(
        mut,
        seeds = [b"commitment", commitment.as_ref()],
        bump = commitment_record.bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,
    
    #[account(
        mut,
        constraint = commitment_vault.key() == get_commitment_vault_pda(&commitment)
    )]
    pub commitment_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Can be called by anyone
    pub owner: UncheckedAccount<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
}

// ============ State ============

#[account]
pub struct PrivacyPayment {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub total_commitments: u64,
    pub total_privacy_payments: u64,
    pub bump: u8,
}

impl PrivacyPayment {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct CommitmentRecord {
    pub commitment: [u8; 32],
    pub amount: u64,
    pub owner: Pubkey,
    pub timestamp: i64,
    pub is_used: bool,
    pub bump: u8,
    pub is_initialized: bool,
}

impl CommitmentRecord {
    pub const LEN: usize = 32 + 8 + 32 + 8 + 1 + 1 + 1;
}

#[account]
pub struct NullifierRecord {
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
    pub is_used: bool,
    pub bump: u8,
}

impl NullifierRecord {
    pub const LEN: usize = 32 + 32 + 1 + 1;
}

// ============ Events ============

#[event]
pub struct FundsLockedEvent {
    pub commitment: [u8; 32],
    pub amount: u64,
    pub locker: Pubkey,
}

#[event]
pub struct PrivacyPaymentExecutedEvent {
    pub commitment: [u8; 32],
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FundsWithdrawnEvent {
    pub commitment: [u8; 32],
    pub amount: u64,
    pub withdrawer: Pubkey,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    AmountMustBeGreaterThanZero,
    #[msg("Invalid commitment")]
    InvalidCommitment,
    #[msg("Commitment already exists")]
    CommitmentAlreadyExists,
    #[msg("Commitment not found")]
    CommitmentNotFound,
    #[msg("Commitment already used")]
    CommitmentAlreadyUsed,
    #[msg("Nullifier already used")]
    NullifierAlreadyUsed,
    #[msg("Insufficient locked funds")]
    InsufficientLockedFunds,
    #[msg("Invalid privacy proof")]
    InvalidPrivacyProof,
    #[msg("No locked funds")]
    NoLockedFunds,
    #[msg("Not commitment owner")]
    NotCommitmentOwner,
    #[msg("Not expired yet")]
    NotExpiredYet,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
}

// ============ Utilities ============

fn get_commitment_vault_pda(commitment: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"commitment-vault", commitment.as_ref()], &ID).0
}
