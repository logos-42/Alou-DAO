//! DIAP Agent Network Program
//! 
//! This program manages agents in the DIAP decentralized network,
//! including agent registration, verification, messaging, and services.
//!
//! Adapted from Solidity DIAPAgentNetwork.sol to Solana/Anchor.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::token::{self, TokenAccount, Transfer, Mint, Token};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod diap_agent_network {
    use super::*;

    /// Initialize the agent network program
    pub fn initialize(
        ctx: Context<Initialize>,
        token_mint: Pubkey,
        registration_fee: u64,
        message_fee: u64,
        service_fee_rate: u16, // Basis points (100 = 1%)
        min_stake_amount: u64,
        reputation_threshold: u64,
        lock_period: i64,
        reward_rate: u16,
    ) -> Result<()> {
        let network = &mut ctx.accounts.network;
        network.authority = ctx.accounts.authority.key();
        network.token_mint = token_mint;
        network.registration_fee = registration_fee;
        network.message_fee = message_fee;
        network.service_fee_rate = service_fee_rate;
        network.min_stake_amount = min_stake_amount;
        network.reputation_threshold = reputation_threshold;
        network.lock_period = lock_period;
        network.reward_rate = reward_rate;
        network.total_agents = 0;
        network.total_messages = 0;
        network.total_services = 0;
        network.total_volume = 0;
        network.total_staked = 0;
        network.accumulated_fees = 0;
        network.bump = ctx.bumps.network;

        Ok(())
    }

    /// Register a new agent
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        identifier: String,
        public_key: String,
        staked_amount: u64,
    ) -> Result<()> {
        require!(staked_amount >= ctx.accounts.network.min_stake_amount, ErrorCode::InsufficientStake);
        require!(identifier.len() >= 10 && identifier.len() <= 100, ErrorCode::InvalidIdentifier);
        require!(!_is_identifier_used(&ctx.accounts.identifier_to_agent.identifiers, &identifier), ErrorCode::IdentifierAlreadyExists);

        let network = &ctx.accounts.network;
        let clock = Clock::get()?;
        let agent_key = ctx.accounts.agent.key();

        // Calculate total cost (stake + registration fee)
        let total_cost = staked_amount
            .checked_add(network.registration_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Transfer registration fee to network
        let cpi_accounts = Transfer {
            from: ctx.accounts.agent_token_account.to_account_info(),
            to: ctx.accounts.network_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, total_cost)?;

        // Initialize agent
        let agent = &mut ctx.accounts.agent;
        agent.authority = ctx.accounts.signer.key();
        agent.identifier = identifier.clone();
        agent.public_key = public_key;
        agent.staked_amount = staked_amount;
        agent.total_earnings = 0;
        agent.reputation = 1000;
        agent.registration_time = clock.unix_timestamp;
        agent.last_activity = clock.unix_timestamp;
        agent.total_services = 0;
        agent.is_active = true;
        agent.is_verified = false;
        agent.bump = ctx.bumps.agent;
        let agent_authority = agent.authority; // Store for later use

        // Update identifier mapping
        let idx = ctx.accounts.identifier_to_agent.idx;
        ctx.accounts.identifier_to_agent.identifiers[idx as usize] = identifier;
        ctx.accounts.identifier_to_agent.agents[idx as usize] = agent_key;
        ctx.accounts.identifier_to_agent.idx = idx.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        // Update network stats
        let network = &mut ctx.accounts.network;
        network.total_agents = network.total_agents.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        network.total_staked = network.total_staked.checked_add(staked_amount).ok_or(ErrorCode::MathOverflow)?;
        network.accumulated_fees = network.accumulated_fees.checked_add(network.registration_fee).ok_or(ErrorCode::MathOverflow)?;

        emit!(AgentRegisteredEvent {
            agent: agent_authority,
            identifier: agent.identifier.clone(),
            staked_amount,
        });

        Ok(())
    }

    /// Unstake an agent and return staked tokens
    pub fn unstake_agent(ctx: Context<UnstakeAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        let clock = Clock::get()?;

        require!(agent.is_active, ErrorCode::AgentNotRegistered);
        require!(
            clock.unix_timestamp >= agent.registration_time + ctx.accounts.network.lock_period,
            ErrorCode::LockPeriodNotEnded
        );

        let staked_amount = agent.staked_amount;
        agent.is_active = false;

        // Transfer staked tokens back to agent
        let network = &ctx.accounts.network;
        let cpi_accounts = Transfer {
            from: ctx.accounts.network_token_account.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: network.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let seeds = &[
            b"network",
            network.token_mint.as_ref(),
            &[network.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, staked_amount)?;

        // Update network stats
        let network = &mut ctx.accounts.network;
        network.total_agents = network.total_agents.checked_sub(1).ok_or(ErrorCode::MathUnderflow)?;
        network.total_staked = network.total_staked.checked_sub(staked_amount).ok_or(ErrorCode::MathUnderflow)?;

        emit!(AgentUnstakedEvent {
            agent: agent.authority,
            staked_amount,
        });

        Ok(())
    }

    /// Verify an agent (by authority)
    pub fn verify_agent(ctx: Context<VerifyAgent>, _proof: [u8; 8]) -> Result<()> {
        let agent = &mut ctx.accounts.agent;

        require!(agent.is_active, ErrorCode::AgentNotRegistered);
        require!(!agent.is_verified, ErrorCode::AgentAlreadyVerified);

        agent.is_verified = true;
        agent.reputation = agent.reputation.checked_add(1000).ok_or(ErrorCode::MathOverflow)?;

        emit!(AgentVerifiedEvent {
            agent: agent.authority,
            is_verified: true,
        });

        Ok(())
    }

    /// Send a message to another agent
    pub fn send_message(
        ctx: Context<SendMessage>,
        to_agent: Pubkey,
        message_cid: String,
    ) -> Result<()> {
        let agent = &ctx.accounts.agent;
        let network = &ctx.accounts.network;

        require!(agent.is_active, ErrorCode::AgentNotRegistered);
        require!(message_cid.len() > 0, ErrorCode::InvalidMessageCID);
        require!(agent.authority == ctx.accounts.signer.key(), ErrorCode::Unauthorized);

        let clock = Clock::get()?;
        let message_id = keccak::hashv(&[
            agent.authority.as_ref(),
            to_agent.as_ref(),
            message_cid.as_bytes(),
            &clock.unix_timestamp.to_le_bytes(),
        ]).to_bytes();

        // Transfer message fee
        let cpi_accounts = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.network_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, network.message_fee)?;

        // Create message record
        let message = &mut ctx.accounts.message;
        message.from_agent = agent.authority;
        message.to_agent = to_agent;
        message.message_cid = message_cid;
        message.timestamp = clock.unix_timestamp;
        message.is_verified = false;
        message.fee = network.message_fee;
        message.bump = ctx.bumps.message;

        // Update network stats
        let network = &mut ctx.accounts.network;
        network.total_messages = network.total_messages.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        network.total_volume = network.total_volume.checked_add(network.message_fee).ok_or(ErrorCode::MathOverflow)?;

        emit!(MessageSentEvent {
            message_id,
            from: agent.authority,
            to: to_agent,
            fee: network.message_fee,
        });

        Ok(())
    }

    /// Create a service
    pub fn create_service(
        ctx: Context<CreateService>,
        consumer: Pubkey,
        service_type: String,
        price: u64,
    ) -> Result<()> {
        let agent = &ctx.accounts.agent;
        let network = &mut ctx.accounts.network;

        require!(agent.is_verified, ErrorCode::AgentNotVerified);
        require!(price > 0, ErrorCode::InvalidPrice);
        require!(service_type.len() > 0, ErrorCode::ServiceTypeRequired);
        require!(agent.authority == ctx.accounts.signer.key(), ErrorCode::Unauthorized);
        require!(consumer != agent.authority, ErrorCode::CannotCreateServiceForSelf);

        let clock = Clock::get()?;

        let service = &mut ctx.accounts.service;
        service.provider = agent.authority;
        service.consumer = consumer;
        service.service_type = service_type;
        service.price = price;
        service.timestamp = clock.unix_timestamp;
        service.is_completed = false;
        service.result_cid = String::new();
        service.bump = ctx.bumps.service;

        network.total_services = network.total_services.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(ServiceCreatedEvent {
            service_id: service.key(),
            provider: agent.authority,
            consumer,
            price,
        });

        Ok(())
    }

    /// Complete a service
    pub fn complete_service(
        ctx: Context<CompleteService>,
        result_cid: String,
    ) -> Result<()> {
        let service = &mut ctx.accounts.service;
        let agent = &mut ctx.accounts.agent;
        let network = &mut ctx.accounts.network;

        require!(service.provider == agent.authority, ErrorCode::NotServiceProvider);
        require!(!service.is_completed, ErrorCode::ServiceAlreadyCompleted);
        require!(result_cid.len() > 0, ErrorCode::InvalidResultCID);
        require!(agent.authority == ctx.accounts.signer.key(), ErrorCode::Unauthorized);

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= service.timestamp + (30 * 24 * 60 * 60),
            ErrorCode::ServiceExpired
        );

        // Calculate reward (subtract service fee)
        let fee = service.price
            .checked_mul(network.service_fee_rate as u64)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathDivision)?;
        let reward = service.price.checked_sub(fee).ok_or(ErrorCode::MathUnderflow)?;

        // Update agent and service
        service.is_completed = true;
        service.result_cid = result_cid.clone();

        agent.total_earnings = agent.total_earnings.checked_add(reward).ok_or(ErrorCode::MathOverflow)?;
        agent.total_services = agent.total_services.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        agent.reputation = agent.reputation.checked_add(10).ok_or(ErrorCode::MathOverflow)?;

        network.total_volume = network.total_volume.checked_add(service.price).ok_or(ErrorCode::MathOverflow)?;

        // Transfer reward from network to provider
        let cpi_accounts = Transfer {
            from: ctx.accounts.network_token_account.to_account_info(),
            to: ctx.accounts.provider_token_account.to_account_info(),
            authority: network.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let seeds = &[
            b"network",
            network.token_mint.as_ref(),
            &[network.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, reward)?;

        emit!(ServiceCompletedEvent {
            service_id: service.key(),
            result_cid,
            reward,
        });

        Ok(())
    }

    /// Update network parameters (authority only)
    pub fn update_network_params(
        ctx: Context<UpdateNetworkParams>,
        registration_fee: Option<u64>,
        message_fee: Option<u64>,
        service_fee_rate: Option<u16>,
        min_stake_amount: Option<u64>,
        reward_rate: Option<u16>,
    ) -> Result<()> {
        let network = &mut ctx.accounts.network;

        if let Some(fee) = registration_fee {
            network.registration_fee = fee;
        }
        if let Some(fee) = message_fee {
            network.message_fee = fee;
        }
        if let Some(rate) = service_fee_rate {
            require!(rate <= 1000, ErrorCode::FeeRateTooHigh);
            network.service_fee_rate = rate;
        }
        if let Some(amount) = min_stake_amount {
            network.min_stake_amount = amount;
        }
        if let Some(rate) = reward_rate {
            network.reward_rate = rate;
        }

        Ok(())
    }

    /// Withdraw accumulated fees to treasury
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        let network = &mut ctx.accounts.network;

        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(network.accumulated_fees >= amount, ErrorCode::InsufficientFees);

        network.accumulated_fees = network.accumulated_fees.checked_sub(amount).ok_or(ErrorCode::MathUnderflow)?;

        // Transfer fees to treasury
        let cpi_accounts = Transfer {
            from: ctx.accounts.network_token_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: network.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let seeds = &[
            b"network",
            network.token_mint.as_ref(),
            &[network.bump],
        ];
        let signer_seeds = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
        token::transfer(cpi_ctx, amount)?;

        emit!(FeesWithdrawnEvent {
            to: ctx.accounts.treasury.key(),
            amount,
            timestamp: Clock::get()?.unix_timestamp,
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
        space = 8 + NetworkState::LEN,
        seeds = [b"network", token_mint.key().as_ref()],
        bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + Agent::LEN,
        seeds = [b"agent", signer.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        init,
        payer = signer,
        space = 8 + IdentifierMapping::LEN,
        seeds = [b"identifier-mapping"],
        bump
    )]
    pub identifier_to_agent: Account<'info, IdentifierMapping>,
    
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        init_if_needed,
        payer = signer,
        token::mint = token_mint,
        token::authority = signer,
        seeds = [b"token-account", signer.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = network_token_account.key() == get_network_token_account(&network.token_mint)
    )]
    pub network_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.authority.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        mut,
        token::mint = network.token_mint,
        token::authority = agent.authority
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = network_token_account.key() == get_network_token_account(&network.token_mint)
    )]
    pub network_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct VerifyAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.authority.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SendMessage<'info> {
    #[account(
        seeds = [b"agent", agent.authority.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        init,
        payer = signer,
        space = 8 + Message::LEN,
        seeds = [b"message", message_id.key().as_ref()],
        bump
    )]
    pub message: Account<'info, Message>,
    /// CHECK: This is the message ID PDA
    pub message_id: UncheckedAccount<'info>,
    
    #[account(
        mut,
        token::mint = network.token_mint,
        token::authority = signer
    )]
    pub sender_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = network_token_account.key() == get_network_token_account(&network.token_mint)
    )]
    pub network_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateService<'info> {
    #[account(
        seeds = [b"agent", agent.authority.as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        init,
        payer = signer,
        space = 8 + Service::LEN,
        seeds = [b"service", network.total_services.to_le_bytes().as_ref()],
        bump
    )]
    pub service: Account<'info, Service>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteService<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.authority.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, Agent>,
    
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump = network.bump
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        mut,
        seeds = [b"service", service.key().as_ref()],
        bump = service.bump
    )]
    pub service: Account<'info, Service>,
    
    #[account(
        mut,
        token::mint = network.token_mint,
        token::authority = agent.authority
    )]
    pub provider_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = network_token_account.key() == get_network_token_account(&network.token_mint)
    )]
    pub network_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateNetworkParams<'info> {
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump,
        has_one = authority
    )]
    pub network: Account<'info, NetworkState>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        mut,
        seeds = [b"network", network.token_mint.as_ref()],
        bump,
        has_one = authority
    )]
    pub network: Account<'info, NetworkState>,
    
    #[account(
        mut,
        token::mint = network.token_mint,
        token::authority = treasury
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = network_token_account.key() == get_network_token_account(&network.token_mint)
    )]
    pub network_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Treasury address
    pub treasury: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
}

// ============ State ============

#[account]
pub struct NetworkState {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub registration_fee: u64,
    pub message_fee: u64,
    pub service_fee_rate: u16,
    pub min_stake_amount: u64,
    pub reputation_threshold: u64,
    pub lock_period: i64,
    pub reward_rate: u16,
    pub total_agents: u64,
    pub total_messages: u64,
    pub total_services: u64,
    pub total_volume: u64,
    pub total_staked: u64,
    pub accumulated_fees: u64,
    pub bump: u8,
}

impl NetworkState {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 2 + 8 + 8 + 8 + 2 + 8 + 8 + 8 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Agent {
    pub authority: Pubkey,
    pub identifier: String,
    pub public_key: String,
    pub staked_amount: u64,
    pub total_earnings: u64,
    pub reputation: u64,
    pub registration_time: i64,
    pub last_activity: i64,
    pub total_services: u32,
    pub is_active: bool,
    pub is_verified: bool,
    pub bump: u8,
}

impl Agent {
    pub const LEN: usize = 32 + 100 + 100 + 8 + 8 + 8 + 8 + 8 + 4 + 1 + 1 + 1;
}

#[account]
pub struct Message {
    pub from_agent: Pubkey,
    pub to_agent: Pubkey,
    pub message_cid: String,
    pub timestamp: i64,
    pub is_verified: bool,
    pub fee: u64,
    pub bump: u8,
}

impl Message {
    pub const LEN: usize = 32 + 32 + 200 + 8 + 1 + 8 + 1;
}

#[account]
pub struct Service {
    pub provider: Pubkey,
    pub consumer: Pubkey,
    pub service_type: String,
    pub price: u64,
    pub timestamp: i64,
    pub is_completed: bool,
    pub result_cid: String,
    pub bump: u8,
}

impl Service {
    pub const LEN: usize = 32 + 32 + 100 + 8 + 8 + 1 + 200 + 1;
}

#[account]
pub struct IdentifierMapping {
    pub idx: u32,
    pub identifiers: [String; 100],
    pub agents: [Pubkey; 100],
    pub bump: u8,
}

impl IdentifierMapping {
    pub const LEN: usize = 4 + (100 * 100) + (100 * 32) + 1;
}

// ============ Events ============

#[event]
pub struct AgentRegisteredEvent {
    pub agent: Pubkey,
    pub identifier: String,
    pub staked_amount: u64,
}

#[event]
pub struct AgentUnstakedEvent {
    pub agent: Pubkey,
    pub staked_amount: u64,
}

#[event]
pub struct AgentVerifiedEvent {
    pub agent: Pubkey,
    pub is_verified: bool,
}

#[event]
pub struct MessageSentEvent {
    #[index]
    pub message_id: [u8; 32],
    pub from: Pubkey,
    pub to: Pubkey,
    pub fee: u64,
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
    pub result_cid: String,
    pub reward: u64,
}

#[event]
pub struct FeesWithdrawnEvent {
    pub to: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Agent is not registered")]
    AgentNotRegistered,
    #[msg("Agent is already verified")]
    AgentAlreadyVerified,
    #[msg("Agent is not verified")]
    AgentNotVerified,
    #[msg("Insufficient stake amount")]
    InsufficientStake,
    #[msg("Invalid identifier format")]
    InvalidIdentifier,
    #[msg("Identifier already exists")]
    IdentifierAlreadyExists,
    #[msg("Invalid message CID")]
    InvalidMessageCID,
    #[msg("Lock period not ended")]
    LockPeriodNotEnded,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Service type required")]
    ServiceTypeRequired,
    #[msg("Cannot create service for self")]
    CannotCreateServiceForSelf,
    #[msg("Service already completed")]
    ServiceAlreadyCompleted,
    #[msg("Invalid result CID")]
    InvalidResultCID,
    #[msg("Service expired")]
    ServiceExpired,
    #[msg("Not service provider")]
    NotServiceProvider,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Fee rate too high")]
    FeeRateTooHigh,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient fees")]
    InsufficientFees,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math underflow")]
    MathUnderflow,
    #[msg("Math division error")]
    MathDivision,
}

// ============ Utilities ============

fn _is_identifier_used(identifiers: &[String; 100], identifier: &str) -> bool {
    identifiers.iter().any(|id| id == identifier)
}

fn get_network_token_account(token_mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"network-token", token_mint.as_ref()], &ID).0
}
