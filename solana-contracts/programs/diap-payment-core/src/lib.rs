//! DIAP Payment Core Program
//! 
//! Core payment functionality including basic payments and escrow services.
//! Adapted from Solidity DIAPPaymentCore.sol

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVk7jmkAuCWx3nNSeXDVoEk1");

#[program]
pub mod diap_payment_core {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        payment_fee_rate: u16,
    ) -> Result<()> {
        let payment_core = &mut ctx.accounts.payment_core;
        payment_core.authority = ctx.accounts.authority.key();
        payment_core.token_mint = ctx.accounts.token_mint.key();
        payment_core.payment_fee_rate = payment_fee_rate;
        payment_core.total_payments = 0;
        payment_core.total_services = 0;
        payment_core.total_volume = 0;
        payment_core.bump = ctx.bumps.payment_core;

        Ok(())
    }

    pub fn create_payment(
        ctx: Context<CreatePayment>,
        payment_id: String,
        amount: u64,
        description: String,
        metadata: String,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::AmountMustBeGreaterThanZero);
        require!(payment_id.len() > 0, ErrorCode::PaymentIDRequired);

        let payment = &mut ctx.accounts.payment;
        require!(!payment.is_initialized, ErrorCode::PaymentIDAlreadyExists);

        let from = &ctx.accounts.from;
        let to = &ctx.accounts.to;
        
        // Ensure both are active agents (simplified - in real implementation, would check agent network)
        // This is a placeholder for the actual agent network check
        // In real implementation, you would call the diap-agent-network program to verify
        // that these are valid, active agent accounts
        
        // Initialize payment
        payment.from = from.key();
        payment.to = to.key();
        payment.amount = amount;
        payment.payment_id = payment_id.clone();
        payment.description = description;
        payment.metadata = metadata;
        payment.timestamp = Clock::get()?.unix_timestamp;
        payment.status = PaymentStatus::Pending as u8;
        payment.bump = ctx.bumps.payment;
        payment.is_initialized = true;

        // Update core stats
        let core = &mut ctx.accounts.payment_core;
        core.total_payments = core.total_payments.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(PaymentCreatedEvent {
            payment_id: payment_id.clone(),
            from: from.key(),
            to: to.key(),
            amount,
        });

        Ok(())
    }

    pub fn confirm_payment(ctx: Context<ConfirmPayment>) -> Result<()> {
        let payment = &mut ctx.accounts.payment;
        
        require!(payment.is_initialized, ErrorCode::PaymentNotFound);
        require!(payment.status == PaymentStatus::Pending as u8, ErrorCode::PaymentNotPending);
        
        // In real implementation, would check that the confirm is from the recipient
        // and that the payment is not expired (e.g., 24 hours has not passed)
        
        // Calculate fee and total
        let core = &ctx.accounts.payment_core;
        let fee = payment.amount
            .checked_mul(core.payment_fee_rate as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathDivision)?;
        
        // For this simplified version, the payment is just updated to confirmed
        // In a real implementation, the token transfer would happen here
        payment.status = PaymentStatus::Confirmed as u8;

        core.total_volume = core.total_volume.checked_add(payment.amount).ok_or(ErrorCode::MathOverflow)?;

        emit!(PaymentConfirmedEvent {
            payment_id: payment.payment_id.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn cancel_payment(ctx: Context<CancelPayment>) -> Result<()> {
        let payment = &mut ctx.accounts.payment;
        
        require!(payment.is_initialized, ErrorCode::PaymentNotFound);
        require!(payment.status == PaymentStatus::Pending as u8, ErrorCode::PaymentNotPending);
        
        // In real implementation, would check that the cancel is from the sender
        
        payment.status = PaymentStatus::Cancelled as u8;

        emit!(PaymentCancelledEvent {
            payment_id: payment.payment_id.clone(),
            reason: "Cancelled by sender",
        });

        Ok(())
    }

    pub fn create_service_order(
        ctx: Context<CreateServiceOrder>,
        price: u64,
        service_type_cid: String,
    ) -> Result<()> {
        require!(price > 0, ErrorCode::InvalidPrice);
        require!(service_type_cid.len() > 0, ErrorCode::ServiceTypeCIDRequired);

        let service = &mut ctx.accounts.service;
        require!(!service.is_initialized, ErrorCode::ServiceAlreadyExists);

        let provider = &ctx.accounts.provider;
        let consumer = &ctx.accounts.consumer;
        
        // In real implementation, would verify both are active agents
        
        let clock = Clock::get()?;
        let fee = price
            .checked_mul(ctx.accounts.payment_core.payment_fee_rate as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathDivision)?;
        let escrow_amount = price.checked_add(fee).ok_or(ErrorCode::MathOverflow)?;

        service.provider = provider.key();
        service.consumer = consumer.key();
        service.price = price;
        service.escrowed_amount = escrow_amount;
        service.timestamp = clock.unix_timestamp;
        service.completion_time = 0;
        service.status = ServiceStatus::Escrowed as u8;
        service.service_type_cid = service_type_cid;
        service.result_cid = String::new();
        service.bump = ctx.bumps.service;
        service.is_initialized = true;

        let core = &mut ctx.accounts.payment_core;
        core.total_services = core.total_services.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(ServiceCreatedEvent {
            service_id: service.key(),
            provider: provider.key(),
            consumer: consumer.key(),
            price,
        });

        Ok(())
    }

    pub fn complete_service_order(
        ctx: Context<CompleteServiceOrder>,
        result_cid: String,
    ) -> Result<()> {
        let service = &mut ctx.accounts.service;
        
        require!(service.is_initialized, ErrorCode::ServiceNotFound);
        require!(service.status == ServiceStatus::Escrowed as u8, ErrorCode::ServiceNotEscrowed);
        require!(result_cid.len() > 0, ErrorCode::InvalidResultCID);
        
        // In real implementation, would check that the completion is from the provider
        // and that the service is not expired (e.g., 30 days has not passed)
        
        let clock = Clock::get()?;
        service.status = ServiceStatus::Completed as u8;
        service.completion_time = clock.unix_timestamp;
        service.result_cid = result_cid;

        let core = &mut ctx.accounts.payment_core;
        core.total_volume = core.total_volume.checked_add(service.price).ok_or(ErrorCode::MathOverflow)?;

        emit!(ServiceCompletedEvent {
            service_id: service.key(),
            provider: service.provider,
            amount: service.price,
        });

        Ok(())
    }

    pub fn cancel_service_order(ctx: Context<CancelServiceOrder>) -> Result<()> {
        let service = &mut ctx.accounts.service;
        
        require!(service.is_initialized, ErrorCode::ServiceNotFound);
        require!(service.status == ServiceStatus::Escrowed as u8, ErrorCode::ServiceNotEscrowed);
        
        // In real implementation, would check that the cancel is from the consumer
        // and that the cancellation period (e.g., 24 hours) has not passed
        
        service.status = ServiceStatus::Cancelled as u8;
        
        let refund_amount = service.escrowed_amount;
        
        emit!(ServiceCancelledEvent {
            service_id: service.key(),
            refund_amount,
        });

        Ok(())
    }

    pub fn update_fee_rate(ctx: Context<UpdateFeeRate>, new_rate: u16) -> Result<()> {
        require!(new_rate <= 100, ErrorCode::RateTooHigh);
        
        let core = &mut ctx.accounts.payment_core;
        core.payment_fee_rate = new_rate;

        emit!(FeeRateUpdatedEvent {
            new_rate,
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
        space = 8 + PaymentCore::LEN,
        seeds = [b"payment-core", token_mint.key().as_ref()],
        bump
    )]
    pub payment_core: Account<'info, PaymentCore>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(payment_id: String)]
pub struct CreatePayment<'info> {
    #[account(
        init,
        payer = from,
        space = 8 + Payment::LEN,
        seeds = [b"payment", payment_id.as_bytes()],
        bump
    )]
    pub payment: Account<'info, Payment>,
    
    #[account(
        mut,
        seeds = [b"payment-core", token_mint.key().as_ref()],
        bump = payment_core.bump
    )]
    pub payment_core: Account<'info, PaymentCore>,
    
    /// CHECK: Sender address (should be an active agent in real implementation)
    pub from: UncheckedAccount<'info>,
    
    /// CHECK: Recipient address (should be an active agent in real implementation)
    pub to: UncheckedAccount<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub from_signer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfirmPayment<'info> {
    #[account(
        mut,
        seeds = [b"payment", payment.payment_id.as_bytes()],
        bump = payment.bump
    )]
    pub payment: Account<'info, Payment>,
    
    #[account(
        mut,
        seeds = [b"payment-core", token_mint.key().as_ref()],
        bump = payment_core.bump
    )]
    pub payment_core: Account<'info, PaymentCore>,
    
    pub token_mint: Account<'info, Mint>,
    
    /// CHECK: Should be the recipient of the payment
    pub recipient: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelPayment<'info> {
    #[account(
        mut,
        seeds = [b"payment", payment.payment_id.as_bytes()],
        bump = payment.bump
    )]
    pub payment: Account<'info, Payment>,
    
    /// CHECK: Should be the sender of the payment
    pub sender: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateServiceOrder<'info> {
    #[account(
        init,
        payer = consumer,
        space = 8 + Service::LEN,
        seeds = [b"service", payment_core.total_services.to_le_bytes().as_ref()],
        bump
    )]
    pub service: Account<'info, Service>,
    
    #[account(
        mut,
        seeds = [b"payment-core", token_mint.key().as_ref()],
        bump = payment_core.bump
    )]
    pub payment_core: Account<'info, PaymentCore>,
    
    /// CHECK: Provider address (should be an active agent in real implementation)
    pub provider: UncheckedAccount<'info>,
    
    /// CHECK: Consumer address (should be an active agent in real implementation)
    #[account(mut)]
    pub consumer: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteServiceOrder<'info> {
    #[account(
        mut,
        seeds = [b"service", @service.key().as_ref()],
        bump = service.bump
    )]
    pub service: Account<'info, Service>,
    
    /// CHECK: Should be the provider of the service
    pub provider: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelServiceOrder<'info> {
    #[account(
        mut,
        seeds = [b"service", @service.key().as_ref()],
        bump = service.bump
    )]
    pub service: Account<'info, Service>,
    
    /// CHECK: Should be the consumer of the service
    pub consumer: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateFeeRate<'info> {
    #[account(
        mut,
        seeds = [b"payment-core", token_mint.key().as_ref()],
        bump = payment_core.bump,
        has_one = authority
    )]
    pub payment_core: Account<'info, PaymentCore>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub authority: Signer<'info>,
}

// ============ State ============

#[account]
pub struct PaymentCore {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub payment_fee_rate: u16,
    pub total_payments: u64,
    pub total_services: u64,
    pub total_volume: u64,
    pub bump: u8,
}

impl PaymentCore {
    pub const LEN: usize = 32 + 32 + 2 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Payment {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub payment_id: String,
    pub description: String,
    pub metadata: String,
    pub timestamp: i64,
    pub status: u8,
    pub bump: u8,
    pub is_initialized: bool,
}

impl Payment {
    pub const LEN: usize = 32 + 32 + 8 + 100 + 200 + 200 + 8 + 1 + 1 + 1;
}

#[account]
pub struct Service {
    pub provider: Pubkey,
    pub consumer: Pubkey,
    pub price: u64,
    pub escrowed_amount: u64,
    pub timestamp: i64,
    pub completion_time: i64,
    pub status: u8,
    pub service_type_cid: String,
    pub result_cid: String,
    pub bump: u8,
    pub is_initialized: bool,
}

impl Service {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 8 + 1 + 200 + 200 + 1 + 1;
}

// ============ Events ============

#[event]
pub struct PaymentCreatedEvent {
    #[index]
    pub payment_id: String,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct PaymentConfirmedEvent {
    #[index]
    pub payment_id: String,
    pub timestamp: i64,
}

#[event]
pub struct PaymentCancelledEvent {
    #[index]
    pub payment_id: String,
    pub reason: String,
}

#[event]
pub struct ServiceCreatedEvent {
    #[index]
    pub service_id: Pubkey,
    pub provider: Pubkey,
    pub consumer: Pubkey,
    pub price: u64,
}

#[event]
pub struct ServiceCompletedEvent {
    #[index]
    pub service_id: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ServiceCancelledEvent {
    #[index]
    pub service_id: Pubkey,
    pub refund_amount: u64,
}

#[event]
pub struct FeeRateUpdatedEvent {
    pub new_rate: u16,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    AmountMustBeGreaterThanZero,
    #[msg("Payment ID required")]
    PaymentIDRequired,
    #[msg("Payment ID already exists")]
    PaymentIDAlreadyExists,
    #[msg("Payment not found")]
    PaymentNotFound,
    #[msg("Payment not pending")]
    PaymentNotPending,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Service type CID required")]
    ServiceTypeCIDRequired,
    #[msg("Service not found")]
    ServiceNotFound,
    #[msg("Service not escrowed")]
    ServiceNotEscrowed,
    #[msg("Invalid result CID")]
    InvalidResultCID,
    #[msg("Service expired")]
    ServiceExpired,
    #[msg("Service already exists")]
    ServiceAlreadyExists,
    #[msg("Rate too high")]
    RateTooHigh,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math division error")]
    MathDivision,
}

// ============ Enums ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PaymentStatus {
    Pending = 0,
    Confirmed = 1,
    Failed = 2,
    Cancelled = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ServiceStatus {
    Created = 0,
    Escrowed = 1,
    Active = 2,
    Completed = 3,
    Cancelled = 4,
}
