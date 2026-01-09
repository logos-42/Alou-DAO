//! DIAP Governance Program
//! 
//! Decentralized governance and DAO management.
//! Adapted from Solidity DIAPGovernance.sol

use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

declare_id!("GovERnJJTiQx8JRhuXDn3WBxHbqPX3Tk7fTQWUwfF889");

#[program]
pub mod diap_governance {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        proposal_threshold: u64,
        voting_delay: i64,
        voting_period: i64,
        quorum_fraction: u16,
    ) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        governance.authority = ctx.accounts.authority.key();
        governance.token_mint = ctx.accounts.token_mint.key();
        governance.proposal_threshold = proposal_threshold;
        governance.voting_delay = voting_delay;
        governance.voting_period = voting_period;
        governance.quorum_fraction = quorum_fraction;
        governance.total_proposals = 0;
        governance.bump = ctx.bumps.governance;

        // Set initial permissions
        let admin = ctx.accounts.authority.key();
        governance.emergency_executors[0] = admin;
        governance.proposal_creators[0] = admin;
        governance.num_emergency_executors = 1;
        governance.num_proposal_creators = 1;

        Ok(())
    }

    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        proposal_type: u8,
        title: String,
        description: String,
        instructions: Vec<ProposalInstruction>,
    ) -> Result<u64> {
        require!(title.len() > 0, ErrorCode::TitleRequired);
        require!(description.len() > 0, ErrorCode::DescriptionRequired);
        require!(!instructions.is_empty(), ErrorCode::InstructionsRequired);
        require!(instructions.len() <= 10, ErrorCode::TooManyInstructions);

        let governance = &mut ctx.accounts.governance;
        let proposer = &ctx.accounts.proposer;

        // Check if proposer is authorized
        let is_authorized = is_authorized_proposer(&governance.proposal_creators[..governance.num_proposal_creators as usize], proposer.key())
            || is_verified_agent(ctx.accounts.agent_network.key(), proposer.key())?;
        
        require!(is_authorized, ErrorCode::NotAuthorizedToCreateProposals);

        let clock = Clock::get()?;
        let proposal_id = governance.total_proposals;

        let proposal = &mut ctx.accounts.proposal;
        proposal.proposal_id = proposal_id;
        proposal.proposer = proposer.key();
        proposal.proposal_type = proposal_type;
        proposal.title = title.clone();
        proposal.description = description.clone();
        proposal.instructions = instructions.clone();
        proposal.status = ProposalStatus::Pending as u8;
        proposal.for_votes = 0;
        proposal.against_votes = 0;
        proposal.abstain_votes = 0;
        proposal.start_time = clock.unix_timestamp + governance.voting_delay;
        proposal.end_time = proposal.start_time + governance.voting_period;
        proposal.executed = false;
        proposal.bump = ctx.bumps.proposal;

        governance.total_proposals = governance.total_proposals.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(ProposalCreatedEvent {
            proposal_id,
            proposal_type,
            proposer: proposer.key(),
            title: title.clone(),
        });

        Ok(proposal_id)
    }

    pub fn cast_vote(
        ctx: Context<CastVote>,
        vote_type: u8,
        weight: u64,
    ) -> Result<()> {
        require!(vote_type <= 2, ErrorCode::InvalidVoteType);

        let proposal = &mut ctx.accounts.proposal;
        let clock = Clock::get()?;

        require!(proposal.status == ProposalStatus::Pending as u8, ErrorCode::ProposalNotActive);
        require!(clock.unix_timestamp >= proposal.start_time, ErrorCode::VotingNotStarted);
        require!(clock.unix_timestamp <= proposal.end_time, ErrorCode::VotingEnded);

        // Check if voter has already voted
        let vote_record = &ctx.accounts.vote_record;
        require!(!vote_record.has_voted, ErrorCode::AlreadyVoted);

        // Calculate voting weight (simplified - in real implementation would check token balance and reputation)
        let actual_weight = weight;

        // Record vote
        let vote_record_mut = &mut ctx.accounts.vote_record;
        vote_record_mut.proposal_id = proposal.proposal_id;
        vote_record_mut.voter = ctx.accounts.voter.key();
        vote_record_mut.vote_type = vote_type;
        vote_record_mut.weight = actual_weight;
        vote_record_mut.has_voted = true;
        vote_record_mut.bump = ctx.bumps.vote_record;

        // Update proposal vote counts
        match vote_type {
            0 => proposal.for_votes = proposal.for_votes.checked_add(actual_weight).ok_or(ErrorCode::MathOverflow)?,
            1 => proposal.against_votes = proposal.against_votes.checked_add(actual_weight).ok_or(ErrorCode::MathOverflow)?,
            2 => proposal.abstain_votes = proposal.abstain_votes.checked_add(actual_weight).ok_or(ErrorCode::MathOverflow)?,
            _ => return Err(ErrorCode::InvalidVoteType.into()),
        }

        emit!(VoteCastEvent {
            proposal_id: proposal.proposal_id,
            voter: ctx.accounts.voter.key(),
            vote_type,
            weight: actual_weight,
        });

        Ok(())
    }

    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        let governance = &ctx.accounts.governance;
        let clock = Clock::get()?;

        require!(proposal.status == ProposalStatus::Pending as u8, ErrorCode::ProposalNotActive);
        require!(clock.unix_timestamp > proposal.end_time, ErrorCode::VotingNotEnded);
        require!(!proposal.executed, ErrorCode::ProposalAlreadyExecuted);

        // Check if quorum reached
        let total_votes = proposal.for_votes
            .checked_add(proposal.against_votes).ok_or(ErrorCode::MathOverflow)?
            .checked_add(proposal.abstain_votes).ok_or(ErrorCode::MathOverflow)?;
        
        let required_quorum = get_total_supply(ctx.accounts.token_mint.key())?
            .checked_mul(governance.quorum_fraction as u64).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathDivision)?;
        
        require!(total_votes >= required_quorum, ErrorCode::QuorumNotReached);

        // Check if proposal passed (simple majority)
        require!(proposal.for_votes > proposal.against_votes, ErrorCode::ProposalRejected);

        // Mark as executed
        proposal.executed = true;
        proposal.status = ProposalStatus::Executed as u8;

        emit!(ProposalExecutedEvent {
            proposal_id: proposal.proposal_id,
            proposal_type: proposal.proposal_type,
        });

        Ok(())
    }

    pub fn add_emergency_executor(ctx: Context<UpdatePermissions>, executor: Pubkey) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        require!((governance.num_emergency_executors as usize) < MAX_PERMISSIONS, ErrorCode::MaxPermissionsReached);

        let idx = governance.num_emergency_executors as usize;
        governance.emergency_executors[idx] = executor;
        governance.num_emergency_executors = governance.num_emergency_executors.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(EmergencyExecutorAddedEvent {
            executor,
        });

        Ok(())
    }

    pub fn add_proposal_creator(ctx: Context<UpdatePermissions>, creator: Pubkey) -> Result<()> {
        let governance = &mut ctx.accounts.governance;
        require!((governance.num_proposal_creators as usize) < MAX_PERMISSIONS, ErrorCode::MaxPermissionsReached);

        let idx = governance.num_proposal_creators as usize;
        governance.proposal_creators[idx] = creator;
        governance.num_proposal_creators = governance.num_proposal_creators.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(ProposalCreatorAddedEvent {
            creator,
        });

        Ok(())
    }

    pub fn execute_emergency_action(
        ctx: Context<ExecuteEmergencyAction>,
        action: String,
    ) -> Result<()> {
        let governance = &ctx.accounts.governance;
        
        // Check if executor is authorized
        let is_authorized = is_authorized_executor(
            &governance.emergency_executors[..governance.num_emergency_executors as usize],
            ctx.accounts.executor.key()
        );
        
        require!(is_authorized, ErrorCode::NotAuthorizedForEmergencyActions);

        emit!(EmergencyActionExecutedEvent {
            executor: ctx.accounts.executor.key(),
            action,
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
        space = 8 + Governance::LEN,
        seeds = [b"governance", token_mint.key().as_ref()],
        bump
    )]
    pub governance: Account<'info, Governance>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proposal_type: u8, title: String, description: String, instructions: Vec<ProposalInstruction>)]
pub struct CreateProposal<'info> {
    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::LEN,
        seeds = [b"proposal", governance.total_proposals.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        mut,
        seeds = [b"governance", token_mint.key().as_ref()],
        bump = governance.bump
    )]
    pub governance: Account<'info, Governance>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub proposer: Signer<'info>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vote_type: u8, weight: u64)]
pub struct CastVote<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::LEN,
        seeds = [b"vote", proposal.proposal_id.to_le_bytes().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    
    #[account(mut)]
    pub voter: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,
    
    #[account(
        seeds = [b"governance", token_mint.key().as_ref()],
        bump = governance.bump
    )]
    pub governance: Account<'info, Governance>,
    
    pub token_mint: Account<'info, Mint>,
}

#[derive(Accounts)]
pub struct UpdatePermissions<'info> {
    #[account(
        mut,
        seeds = [b"governance", token_mint.key().as_ref()],
        bump = governance.bump,
        has_one = authority
    )]
    pub governance: Account<'info, Governance>,
    
    pub token_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteEmergencyAction<'info> {
    #[account(
        seeds = [b"governance", token_mint.key().as_ref()],
        bump = governance.bump
    )]
    pub governance: Account<'info, Governance>,
    
    pub token_mint: Account<'info, Mint>,
    
    pub executor: Signer<'info>,
}

// ============ State ============

const MAX_PERMISSIONS: usize = 10;

#[account]
pub struct Governance {
    pub authority: Pubkey,
    pub token_mint: Pubkey,
    pub proposal_threshold: u64,
    pub voting_delay: i64,
    pub voting_period: i64,
    pub quorum_fraction: u16,
    pub total_proposals: u64,
    pub emergency_executors: [Pubkey; MAX_PERMISSIONS],
    pub num_emergency_executors: u8,
    pub proposal_creators: [Pubkey; MAX_PERMISSIONS],
    pub num_proposal_creators: u8,
    pub bump: u8,
}

impl Governance {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 8 + 2 + 8 + (10 * 32) + 1 + (10 * 32) + 1 + 1;
}

#[account]
pub struct Proposal {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub proposal_type: u8,
    pub title: String,
    pub description: String,
    pub instructions: Vec<ProposalInstruction>,
    pub status: u8,
    pub for_votes: u64,
    pub against_votes: u64,
    pub abstain_votes: u64,
    pub start_time: i64,
    pub end_time: i64,
    pub executed: bool,
    pub bump: u8,
}

impl Proposal {
    pub const LEN: usize = 8 + 32 + 1 + 100 + 500 + (4 + 10 * ProposalInstruction::LEN) + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct VoteRecord {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub vote_type: u8,
    pub weight: u64,
    pub has_voted: bool,
    pub bump: u8,
}

impl VoteRecord {
    pub const LEN: usize = 8 + 32 + 1 + 8 + 1 + 1;
}

// ============ Data Structures ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposalInstruction {
    pub program_id: Pubkey,
    pub accounts: Vec<AccountMeta>,
    pub data: Vec<u8>,
}

impl ProposalInstruction {
    pub const LEN: usize = 32 + 4 + 10 * 100 + 4 + 200; // Simplified
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AccountMeta {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

// ============ Events ============

#[event]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposal_type: u8,
    pub proposer: Pubkey,
    pub title: String,
}

#[event]
pub struct VoteCastEvent {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub vote_type: u8,
    pub weight: u64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub proposal_type: u8,
}

#[event]
pub struct EmergencyActionExecutedEvent {
    pub executor: Pubkey,
    pub action: String,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyExecutorAddedEvent {
    pub executor: Pubkey,
}

#[event]
pub struct ProposalCreatorAddedEvent {
    pub creator: Pubkey,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Title required")]
    TitleRequired,
    #[msg("Description required")]
    DescriptionRequired,
    #[msg("Instructions required")]
    InstructionsRequired,
    #[msg("Too many instructions")]
    TooManyInstructions,
    #[msg("Not authorized to create proposals")]
    NotAuthorizedToCreateProposals,
    #[msg("Not authorized for emergency actions")]
    NotAuthorizedForEmergencyActions,
    #[msg("Invalid vote type")]
    InvalidVoteType,
    #[msg("Proposal not active")]
    ProposalNotActive,
    #[msg("Voting not started")]
    VotingNotStarted,
    #[msg("Voting ended")]
    VotingEnded,
    #[msg("Already voted")]
    AlreadyVoted,
    #[msg("Voting not ended")]
    VotingNotEnded,
    #[msg("Proposal already executed")]
    ProposalAlreadyExecuted,
    #[msg("Quorum not reached")]
    QuorumNotReached,
    #[msg("Proposal rejected")]
    ProposalRejected,
    #[msg("Max permissions reached")]
    MaxPermissionsReached,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Math division error")]
    MathDivision,
}

// ============ Enums ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProposalType {
    NetworkUpgrade = 0,
    ParameterChange = 1,
    TreasuryManagement = 2,
    AgentPolicy = 3,
    TokenEconomics = 4,
    EmergencyAction = 5,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ProposalStatus {
    Pending = 0,
    Active = 1,
    Succeeded = 2,
    Defeated = 3,
    Executed = 4,
    Cancelled = 5,
}

// ============ Utilities ============

fn is_authorized_proposer(authorized_list: &[Pubkey], proposer: Pubkey) -> bool {
    authorized_list.iter().any(|&p| p == proposer)
}

fn is_authorized_executor(authorized_list: &[Pubkey], executor: Pubkey) -> bool {
    authorized_list.iter().any(|&p| p == executor)
}

fn is_verified_agent(_agent_network: Pubkey, _agent: Pubkey) -> Result<bool> {
    // Simplified - in real implementation would call agent network
    Ok(true)
}

fn get_total_supply(_token_mint: Pubkey) -> Result<u64> {
    // Simplified - in real implementation would get from token program
    Ok(1_000_000_000) // 1B tokens
}
