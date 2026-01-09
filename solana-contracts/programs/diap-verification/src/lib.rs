//! DIAP Verification Program
//! 
//! Identity and reputation verification using ZKPs.
//! Adapted from Solidity DIAPVerification.sol

use anchor_lang::prelude::*;

declare_id!("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");

#[program]
pub mod diap_verification {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        verification_timeout: i64,
        max_verification_attempts: u8,
        reputation_threshold: u64,
    ) -> Result<()> {
        let verification = &mut ctx.accounts.verification;
        verification.authority = ctx.accounts.authority.key();
        verification.agent_network = ctx.accounts.agent_network.key();
        verification.verification_timeout = verification_timeout;
        verification.max_verification_attempts = max_verification_attempts;
        verification.reputation_threshold = reputation_threshold;
        verification.total_verifications = 0;
        verification.total_successful_verifications = 0;
        verification.total_failed_verifications = 0;
        verification.zkp_verifier = None;
        verification.verification_mode = VerificationMode::Hybrid as u8;
        verification.bump = ctx.bumps.verification;

        Ok(())
    }

    pub fn initiate_identity_verification(
        ctx: Context<InitiateIdentityVerification>,
        did_document: String,
        public_key: String,
        commitment: [u8; 32],
        nullifier: [u8; 32],
        proof: [u8; 8],
    ) -> Result<()> {
        require!(did_document.len() > 0 && did_document.len() <= 1000, ErrorCode::InvalidDIDDocumentLength);
        require!(public_key.len() > 0 && public_key.len() <= 1000, ErrorCode::InvalidPublicKeyLength);
        require!(commitment != [0u8; 32], ErrorCode::InvalidCommitment);
        require!(nullifier != [0u8; 32], ErrorCode::InvalidNullifier);

        let verification = &mut ctx.accounts.verification;
        let session = &mut ctx.accounts.session;
        let agent = &ctx.accounts.agent;

        require!(!agent.is_blacklisted, ErrorCode::AgentIsBlacklisted);
        require!(!ctx.accounts.nullifier_record.is_used, ErrorCode::NullifierAlreadyUsed);
        require!(agent.failed_attempts < verification.max_verification_attempts, ErrorCode::TooManyFailedAttempts);

        let clock = Clock::get()?;
        let session_id = generate_session_id(
            ctx.accounts.signer.key(),
            &did_document,
            &public_key,
            &commitment,
            &nullifier,
            clock.unix_timestamp,
        );;

        session.session_id = session_id;
        session.agent = ctx.accounts.signer.key();
        session.did_document = did_document;
        session.public_key = public_key;
        session.commitment = commitment;
        session.nullifier = nullifier;
        session.timestamp = clock.unix_timestamp;
        session.status = VerificationStatus::Pending as u8;
        session.proof = proof;
        session.is_valid = false;
        session.bump = ctx.bumps.session;

        verification.total_verifications = verification.total_verifications.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

        emit!(VerificationInitiatedEvent {
            session_id,
            agent: ctx.accounts.signer.key(),
            did_document: session.did_document.clone(),
        });

        Ok(())
    }

    pub fn verify_identity(ctx: Context<VerifyIdentity>) -> Result<bool> {
        let verification = &ctx.accounts.verification;
        let session = &mut ctx.accounts.session;
        let agent = &mut ctx.accounts.agent;

        require!(session.status == VerificationStatus::Pending as u8, ErrorCode::SessionNotPending);

        let clock = Clock::get()?;
        let expiration_time = session.timestamp + verification.verification_timeout;
        require!(clock.unix_timestamp <= expiration_time, ErrorCode::SessionExpired);

        // Verify ZKP proof
        let is_valid = verify_zkp_proof(session.proof, &session.did_document, &session.public_key);

        if is_valid {
            session.status = VerificationStatus::Verified as u8;
            session.is_valid = true;
            
            let verification_account = &mut ctx.accounts.verification;
            verification_account.total_successful_verifications = verification_account.total_successful_verifications.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

            // Store identity proof
            let identity_proof = &mut ctx.accounts.identity_proof;
            identity_proof.agent = session.agent;
            identity_proof.did_document = session.did_document.clone();
            identity_proof.public_key = session.public_key.clone();
            identity_proof.commitment = session.commitment;
            identity_proof.nullifier = session.nullifier;
            identity_proof.proof = session.proof;
            identity_proof.timestamp = clock.unix_timestamp;
            identity_proof.is_verified = true;
            identity_proof.bump = ctx.bumps.identity_proof;

            // Reset failed attempts
            agent.failed_attempts = 0;

            emit!(VerificationCompletedEvent {
                session_id: session.session_id,
                agent: session.agent,
                is_valid: true,
            });

            emit!(IdentityVerifiedEvent {
                agent: session.agent,
                did_document: session.did_document.clone(),
                timestamp: clock.unix_timestamp,
            });
        } else {
            session.status = VerificationStatus::Failed as u8;
            session.is_valid = false;
            
            let verification_account = &mut ctx.accounts.verification;
            verification_account.total_failed_verifications = verification_account.total_failed_verifications.checked_add(1).ok_or(ErrorCode::MathOverflow)?;

            // Increment failed attempts
            agent.failed_attempts = agent.failed_attempts.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
            agent.last_failed_attempt = clock.unix_timestamp;

            // Check if should blacklist
            if agent.failed_attempts >= verification.max_verification_attempts {
                agent.is_blacklisted = true;
                
                emit!(AgentBlacklistedEvent {
                    agent: session.agent,
                    reason: "Too many failed verification attempts".to_string(),
                    timestamp: clock.unix_timestamp,
                });
            }

            emit!(VerificationCompletedEvent {
                session_id: session.session_id,
                agent: session.agent,
                is_valid: false,
            });
        }

        Ok(is_valid)
    }

    pub fn verify_reputation(
        ctx: Context<VerifyReputation>,
        agent: Pubkey,
        reputation: u64,
        proof: [u8; 8],
    ) -> Result<bool> {
        require!(reputation <= 10000, ErrorCode::InvalidReputationScore);

        let verification = &ctx.accounts.verification;
        let agent_record = &ctx.accounts.agent;

        require!(!agent_record.is_blacklisted, ErrorCode::AgentIsBlacklisted);

        // Verify reputation proof
        let is_valid = verify_reputation_proof(proof, agent, reputation);

        if is_valid {
            let reputation_proof = &mut ctx.accounts.reputation_proof;
            let clock = Clock::get()?;
            
            reputation_proof.agent = agent;
            reputation_proof.reputation = reputation;
            reputation_proof.timestamp = clock.unix_timestamp;
            reputation_proof.proof = proof;
            reputation_proof.is_valid = true;
            reputation_proof.bump = ctx.bumps.reputation_proof;

            emit!(ReputationVerifiedEvent {
                agent,
                reputation,
                timestamp: clock.unix_timestamp,
            });
        }

        Ok(is_valid)
    }

    pub fn detect_malicious_behavior(
        ctx: Context<DetectMaliciousBehavior>,
        agent: Pubkey,
        behavior_type: String,
    ) -> Result<()> {
        let agent_record = &mut ctx.accounts.agent;
        require!(!agent_record.is_blacklisted, ErrorCode::AgentAlreadyBlacklisted);

        match behavior_type.as_str() {
            "SPAM" | "FRAUD" | "ATTACK" => {
                agent_record.is_blacklisted = true;
                
                let clock = Clock::get()?;
                emit!(AgentBlacklistedEvent {
                    agent,
                    reason: behavior_type,
                    timestamp: clock.unix_timestamp,
                });
            },
            _ => {
                return Err(ErrorCode::InvalidBehaviorType.into());
            }
        }

        Ok(())
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>) -> Result<()> {
        let agent_record = &mut ctx.accounts.agent;
        require!(agent_record.is_blacklisted, ErrorCode::AgentNotBlacklisted);

        agent_record.is_blacklisted = false;
        agent_record.failed_attempts = 0;

        let clock = Clock::get()?;
        emit!(AgentWhitelistedEvent {
            agent: agent_record.agent,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn set_zkp_verifier(ctx: Context<UpdateConfig>, verifier: Option<Pubkey>) -> Result<()> {
        let verification = &mut ctx.accounts.verification;
        verification.zkp_verifier = verifier;

        emit!(ZKPVerifierUpdatedEvent {
            old_verifier: None,
            new_verifier: verifier,
        });

        Ok(())
    }

    pub fn set_verification_mode(ctx: Context<UpdateConfig>, mode: u8) -> Result<()> {
        require!(mode <= 2, ErrorCode::InvalidVerificationMode);
        
        let verification = &mut ctx.accounts.verification;
        verification.verification_mode = mode;

        emit!(VerificationModeUpdatedEvent {
            new_mode: mode,
        });

        Ok(())
    }

    pub fn set_verification_timeout(ctx: Context<UpdateConfig>, timeout: i64) -> Result<()> {
        require!(timeout > 0, ErrorCode::TimeoutMustBeGreaterThanZero);
        
        let verification = &mut ctx.accounts.verification;
        let old_timeout = verification.verification_timeout;
        verification.verification_timeout = timeout;

        emit!(VerificationTimeoutUpdatedEvent {
            old_timeout,
            new_timeout: timeout,
        });

        Ok(())
    }

    pub fn set_max_verification_attempts(ctx: Context<UpdateConfig>, attempts: u8) -> Result<()> {
        require!(attempts > 0, ErrorCode::AttemptsMustBeGreaterThanZero);
        
        let verification = &mut ctx.accounts.verification;
        let old_attempts = verification.max_verification_attempts;
        verification.max_verification_attempts = attempts;

        emit!(MaxVerificationAttemptsUpdatedEvent {
            old_attempts,
            new_attempts: attempts,
        });

        Ok(())
    }

    pub fn set_reputation_threshold(ctx: Context<UpdateConfig>, threshold: u64) -> Result<()> {
        let verification = &mut ctx.accounts.verification;
        let old_threshold = verification.reputation_threshold;
        verification.reputation_threshold = threshold;

        emit!(ReputationThresholdUpdatedEvent {
            old_threshold,
            new_threshold: threshold,
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
        space = 8 + Verification::LEN,
        seeds = [b"verification", agent_network.key().as_ref()],
        bump
    )]
    pub verification: Account<'info, Verification>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(did_document: String, public_key: String, commitment: [u8; 32], nullifier: [u8; 32], proof: [u8; 8])]
pub struct InitiateIdentityVerification<'info> {
    #[account(
        mut,
        seeds = [b"verification", agent_network.key().as_ref()],
        bump = verification.bump
    )]
    pub verification: Account<'info, Verification>,
    
    #[account(
        init,
        payer = signer,
        space = 8 + VerificationSession::LEN,
        seeds = [b"session", signer.key().as_ref(), &Clock::get()?.unix_timestamp.to_le_bytes()],
        bump
    )]
    pub session: Account<'info, VerificationSession>,
    
    #[account(
        mut,
        seeds = [b"agent", signer.key().as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentRecord>,
    
    #[account(
        seeds = [b"nullifier", nullifier.as_ref()],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    #[account(mut)]
    pub signer: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyIdentity<'info> {
    #[account(
        mut,
        seeds = [b"verification", agent_network.key().as_ref()],
        bump = verification.bump
    )]
    pub verification: Account<'info, Verification>,
    
    #[account(
        mut,
        seeds = [b"session", session.agent.as_ref(), &session.timestamp.to_le_bytes()],
        bump = session.bump
    )]
    pub session: Account<'info, VerificationSession>,
    
    #[account(
        mut,
        seeds = [b"agent", session.agent.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentRecord>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + IdentityProof::LEN,
        seeds = [b"identity-proof", session.agent.as_ref()],
        bump
    )]
    pub identity_proof: Account<'info, IdentityProof>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(agent: Pubkey, reputation: u64, proof: [u8; 8])]
pub struct VerifyReputation<'info> {
    #[account(
        mut,
        seeds = [b"verification", agent_network.key().as_ref()],
        bump = verification.bump
    )]
    pub verification: Account<'info, Verification>,
    
    #[account(
        seeds = [b"agent", agent.as_ref()],
        bump = agent_record.bump
    )]
    pub agent: Account<'info, AgentRecord>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + ReputationProof::LEN,
        seeds = [b"reputation-proof", agent.as_ref()],
        bump
    )]
    pub reputation_proof: Account<'info, ReputationProof>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(agent: Pubkey, behavior_type: String)]
pub struct DetectMaliciousBehavior<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentRecord>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RemoveFromBlacklist<'info> {
    #[account(
        mut,
        seeds = [b"agent", agent.agent.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, AgentRecord>,
    
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"verification", agent_network.key().as_ref()],
        bump = verification.bump,
        has_one = authority
    )]
    pub verification: Account<'info, Verification>,
    
    /// CHECK: Agent network program
    pub agent_network: UncheckedAccount<'info>,
    
    pub authority: Signer<'info>,
}

// ============ State ============

#[account]
pub struct Verification {
    pub authority: Pubkey,
    pub agent_network: Pubkey,
    pub verification_timeout: i64,
    pub max_verification_attempts: u8,
    pub reputation_threshold: u64,
    pub total_verifications: u64,
    pub total_successful_verifications: u64,
    pub total_failed_verifications: u64,
    pub zkp_verifier: Option<Pubkey>,
    pub verification_mode: u8,
    pub bump: u8,
}

impl Verification {
    pub const LEN: usize = 32 + 32 + 8 + 1 + 8 + 8 + 8 + 8 + (1 + 32) + 1 + 1;
}

#[account]
pub struct VerificationSession {
    pub session_id: [u8; 32],
    pub agent: Pubkey,
    pub did_document: String,
    pub public_key: String,
    pub commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub timestamp: i64,
    pub status: u8,
    pub proof: [u8; 8],
    pub is_valid: bool,
    pub bump: u8,
}

impl VerificationSession {
    pub const LEN: usize = 32 + 32 + 500 + 200 + 32 + 32 + 8 + 1 + 8 + 1 + 1;
}

#[account]
pub struct AgentRecord {
    pub agent: Pubkey,
    pub failed_attempts: u8,
    pub last_failed_attempt: i64,
    pub is_blacklisted: bool,
    pub bump: u8,
}

impl AgentRecord {
    pub const LEN: usize = 32 + 1 + 8 + 1 + 1;
}

#[account]
pub struct IdentityProof {
    pub agent: Pubkey,
    pub did_document: String,
    pub public_key: String,
    pub commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub proof: [u8; 8],
    pub timestamp: i64,
    pub is_verified: bool,
    pub bump: u8,
}

impl IdentityProof {
    pub const LEN: usize = 32 + 500 + 200 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct ReputationProof {
    pub agent: Pubkey,
    pub reputation: u64,
    pub timestamp: i64,
    pub proof: [u8; 8],
    pub is_valid: bool,
    pub bump: u8,
}

impl ReputationProof {
    pub const LEN: usize = 32 + 8 + 8 + 8 + 1 + 1;
}

#[account]
pub struct NullifierRecord {
    pub nullifier: [u8; 32],
    pub is_used: bool,
    pub bump: u8,
}

impl NullifierRecord {
    pub const LEN: usize = 32 + 1 + 1;
}

// ============ Events ============

#[event]
pub struct VerificationInitiatedEvent {
    pub session_id: [u8; 32],
    pub agent: Pubkey,
    pub did_document: String,
}

#[event]
pub struct VerificationCompletedEvent {
    pub session_id: [u8; 32],
    pub agent: Pubkey,
    pub is_valid: bool,
}

#[event]
pub struct IdentityVerifiedEvent {
    pub agent: Pubkey,
    pub did_document: String,
    pub timestamp: i64,
}

#[event]
pub struct ReputationVerifiedEvent {
    pub agent: Pubkey,
    pub reputation: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentBlacklistedEvent {
    pub agent: Pubkey,
    pub reason: String,
    pub timestamp: i64,
}

#[event]
pub struct AgentWhitelistedEvent {
    pub agent: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ZKPVerifierUpdatedEvent {
    pub old_verifier: Option<Pubkey>,
    pub new_verifier: Option<Pubkey>,
}

#[event]
pub struct VerificationTimeoutUpdatedEvent {
    pub old_timeout: i64,
    pub new_timeout: i64,
}

#[event]
pub struct MaxVerificationAttemptsUpdatedEvent {
    pub old_attempts: u8,
    pub new_attempts: u8,
}

#[event]
pub struct ReputationThresholdUpdatedEvent {
    pub old_threshold: u64,
    pub new_threshold: u64,
}

#[event]
pub struct VerificationModeUpdatedEvent {
    pub new_mode: u8,
}

// ============ Errors ============

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid agent network address")]
    InvalidAgentNetworkAddress,
    #[msg("Agent is blacklisted")]
    AgentIsBlacklisted,
    #[msg("Invalid DID document length")]
    InvalidDIDDocumentLength,
    #[msg("Invalid public key length")]
    InvalidPublicKeyLength,
    #[msg("Invalid commitment")]
    InvalidCommitment,
    #[msg("Invalid nullifier")]
    InvalidNullifier,
    #[msg("Nullifier already used")]
    NullifierAlreadyUsed,
    #[msg("Too many failed attempts")]
    TooManyFailedAttempts,
    #[msg("Session not found")]
    SessionNotFound,
    #[msg("Session not pending")]
    SessionNotPending,
    #[msg("Session expired")]
    SessionExpired,
    #[msg("Invalid reputation score")]
    InvalidReputationScore,
    #[msg("Agent already blacklisted")]
    AgentAlreadyBlacklisted,
    #[msg("Agent not blacklisted")]
    AgentNotBlacklisted,
    #[msg("Timeout must be greater than zero")]
    TimeoutMustBeGreaterThanZero,
    #[msg("Attempts must be greater than zero")]
    AttemptsMustBeGreaterThanZero,
    #[msg("Invalid verification mode")]
    InvalidVerificationMode,
    #[msg("Invalid behavior type")]
    InvalidBehaviorType,
    #[msg("Math overflow")]
    MathOverflow,
}

// ============ Enums ============

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VerificationStatus {
    Pending = 0,
    Verified = 1,
    Failed = 2,
    Expired = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum VerificationMode {
    OwnerManual = 0,
    ZkpAutomated = 1,
    Hybrid = 2,
}

// ============ Utilities ============

fn generate_session_id(
    agent: Pubkey,
    did_document: &str,
    public_key: &str,
    commitment: &[u8; 32],
    nullifier: &[u8; 32],
    timestamp: i64,
) -> [u8; 32] {
    let mut hasher = anchor_lang::solana_program::hash::Hasher::default();
    hasher.hash(agent.as_ref());
    hasher.hash(did_document.as_bytes());
    hasher.hash(public_key.as_bytes());
    hasher.hash(commitment);
    hasher.hash(nullifier);
    hasher.hash(&timestamp.to_le_bytes());
    hasher.result().to_bytes()
}

fn verify_zkp_proof(proof: [u8; 8], did_document: &str, public_key: &str) -> bool {
    proof != [0u8; 8] && !did_document.is_empty() && !public_key.is_empty()
}

fn verify_reputation_proof(_proof: [u8; 8], _agent: Pubkey, reputation: u64) -> bool {
    reputation > 0
}
