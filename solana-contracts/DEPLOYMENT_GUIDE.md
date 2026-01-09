# DIAP Solana Contracts - Deployment Guide

## Overview

This directory contains Solana/Anchor versions of the DIAP smart contracts. Three complete contracts have been implemented:

1. **diap-agent-network** - Complete implementation
2. **diap-token** - Complete implementation
3. **diap-payment-core** - Complete implementation

Four additional contracts need completion:

4. **diap-payment-channel** - Payment channels for state channels
5. **diap-payment-privacy** - Privacy-preserving payments using ZKPs
6. **diap-verification** - Identity verification system
7. **diap-governance** - DAO governance framework
8. **diap-subscription** - Subscription management

## Prerequisites

### Install Rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Install Solana CLI
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
echo 'export PATH="~/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Install Anchor CLI
```bash
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
```

### Verify Installation
```bash
rustc --version
solana --version
anchor --version
```

## Project Structure

```
solana-contracts/
├── Anchor.toml                    # Anchor configuration
├── Cargo.toml                     # Workspace configuration
├── README.md                      # Overview documentation
├── DEPLOYMENT_GUIDE.md           # This file
└── programs/
    ├── diap-agent-network/
    │   └── src/
    │       └── lib.rs            # ✅ Complete
    ├── diap-token/
    │   └── src/
    │       └── lib.rs            # ✅ Complete
    ├── diap-payment-core/
    │   └── src/
    │       └── lib.rs            # ✅ Complete
    ├── diap-payment-channel/
    │   └── src/
    │       └── lib.rs            # 📋 Needs completion
    ├── diap-payment-privacy/
    │   └── src/
    │       └── lib.rs            # 📋 Needs completion
    ├── diap-verification/
    │   └── src/
    │       └── lib.rs            # 📋 Needs completion
    ├── diap-governance/
    │   └── src/
    │       └── lib.rs            # 📋 Needs completion
    └── diap-subscription/
        └── src/
            └── lib.rs            # 📋 Needs completion
```

## Quick Start

### Build Contracts
```bash
# Navigate to solana-contracts directory
cd solana-contracts

# Build all contracts
anchor build

# Build specific contract
anchor build -p diap-agent-network
```

### Run Tests
```bash
# Run all tests
anchor test

# Run without local validator (if you have one running)
anchor test --skip-local-validator
```

### Deploy to Localnet
```bash
# Start local validator
solana-test-validator

# Deploy
anchor deploy
```

### Deploy to Devnet
```bash
# Configure Solana CLI for devnet
solana config set --url devnet

# Request airdrop
solana airdrop 2

# Deploy
anchor deploy --provider.cluster devnet
```

## Contract Details

### 1. DIAP Agent Network
**Program ID**: `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS`

**Key Features**:
- Agent registration with staking
- Agent verification
- Agent-to-agent messaging
- Service creation and completion
- Fee collection and withdrawal

**Initialization**:
```bash
anchor run init-agent-network
```

**Key Functions**:
- `register_agent` - Register a new agent (100+ token stake minimum)
- `unstake_agent` - Unstake and remove agent (30 day lock period)
- `send_message` - Send message to another agent (1 token fee)
- `create_service` - Create a service offer (3% service fee)
- `complete_service` - Complete service and receive payment
- `verify_agent` - Verify agent identity (ZKP based)
- `withdraw_fees` - Withdraw accumulated fees to treasury

**Staking Tiers**:
- Bronze: 100 tokens minimum
- Silver: 10,000 tokens minimum
- Gold: 50,000 tokens minimum
- Platinum: 100,000 tokens minimum

### 2. DIAP Token
**Program ID**: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`

**Key Features**:
- SPL Token standard implementation
- Multi-tier staking system
- Reward distribution
- Token burning mechanism
- Emergency controls

**Initialization**:
```bash
anchor run init-diap-token
```

**Staking Tiers**:
- **Bronze (0)**: 1,000+ tokens, 1x rewards, 30-day lock
- **Silver (1)**: 10,000+ tokens, 1.5x rewards, 90-day lock
- **Gold (2)**: 50,000+ tokens, 2x rewards, 180-day lock
- **Platinum (3)**: 100,000+ tokens, 3x rewards, 365-day lock

**Key Functions**:
- `stake` - Stake tokens to earn rewards
- `unstake` - Unstake tokens after lock period
- `claim_rewards` - Claim accumulated rewards
- `burn_tokens` - Burn tokens for deflation
- `replenish_staking_pool` - Add tokens to reward pool

**Token Economics**:
- Max Supply: 1,000,000,000 tokens (1B)
- Decimals: 9 (standard for Solana)
- Burn Rate: 0.25% on transfers
- Base APY: 5% (adjustable by authority)
- Staking Multiplier: 1x-3x based on tier

### 3. DIAP Payment Core
**Program ID**: `HmbTLCmaGvZhKnn1Zfa1JVk7jmkAuCWx3nNSeXDVoEk1`

**Key Features**:
- Basic peer-to-peer payments
- Escrow-based service payments
- Fee collection
- Payment lifecycle management

**Initialization**:
```bash
anchor run init-payment-core
```

**Payment Flow**:
1. **Create Payment**: Sender creates payment request
2. **Confirm Payment**: Recipient confirms and receives funds
3. **Cancel Payment**: Sender can cancel if not confirmed

**Service Flow**:
1. **Create Service Order**: Consumer creates service request
2. **Complete Service**: Provider completes and receives payment
3. **Cancel Service**: Consumer can cancel within 24 hours

**Fee Structure**:
- Payment Fee: 0.1% (configurable)
- Service Fee: Same as payment fee
- Minimum Fee: 0 tokens

## Remaining Contracts (To Be Implemented)

### 4. DIAP Payment Channel
**Purpose**: State channels for off-chain payments

**Key Features to Implement**:
- Bi-directional payment channels
- Channel opening with deposits
- Off-chain state updates with signatures
- Challenge mechanism for disputes
- Channel closure and settlement

**Implementation Notes**:
- Use PDAs for channel accounts
- Implement EIP-712 style signatures for state updates
- 24-hour challenge period
- Channel fee: 0.05%

**Reference**: Based on Solidity `DIAPPaymentChannel.sol`

### 5. DIAP Payment Privacy
**Purpose**: Privacy-preserving payments using ZKPs

**Key Features to Implement**:
- Commitment-based deposits
- Nullifier-based spending
- ZKP verification for transactions
- Privacy pool management
- Commitment expiration (90 days)

**Implementation Notes**:
- Use poseidon hash for commitments
- Implement nullifier tracking
- ZKP verification via CPI to verification program
- Support for anonymous transfers

**Reference**: Based on Solidity `DIAPPaymentPrivacy.sol`

### 6. DIAP Verification
**Purpose**: Identity and reputation verification using ZKPs

**Key Features to Implement**:
- Identity verification sessions
- Reputation proof verification
- Blacklist management
- Nullifier tracking (anti-replay)
- Batch verification support

**Implementation Notes**:
- Session-based verification flow
- Support for Noir ZKPs
- Multi-mode verification (owner, ZKP, hybrid)
- Malicious behavior detection

**Reference**: Based on Solidity `DIAPVerification.sol`

### 7. DIAP Governance
**Purpose**: Decentralized governance and DAO management

**Key Features to Implement**:
- Proposal creation and voting
- Multi-tier proposal types
- Emergency actions
- Vote weight calculation (tokens + reputation)
- Timelock for critical actions

**Implementation Notes**:
- Governance tokens represent voting power
- Support for multiple proposal types:
  - Network upgrades
  - Parameter changes
  - Treasury management
  - Emergency actions
- Voting delay and duration periods

**Reference**: Based on Solidity `DIAPGovernance.sol`

### 8. DIAP Subscription
**Purpose**: Subscription management with multi-token support

**Key Features to Implement**:
- Subscription plan creation
- Multi-token payment support
- Subscription lifecycle management
- Renewal and cancellation
- Token price oracle integration

**Implementation Notes**:
- Plans support multiple tokens
- USD-pegged pricing
- Subscription tiers (monthly/yearly)
- Automatic renewal support

**Reference**: Based on Solidity `DIAPSubscription.sol`

## Integration Guide

### Cross-Program Invocation (CPI)

Contracts can interact with each other via CPI:

```rust
// Example: Payment Core checking Agent Network
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::instruction::Instruction;

pub fn verify_agent_active(agent_network_program: Pubkey, agent_pubkey: Pubkey) -> Result<bool> {
    let ix = Instruction {
        program_id: agent_network_program,
        accounts: vec![],
        data: vec![],
    };
    invoke_signed(&ix, &[/* accounts */], &[/* seeds */])?;
    Ok(true)
}
```

### Frontend Integration

Use Anchor's TypeScript client:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { DiapAgentNetwork } from "./target/types/diap_agent_network";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.DiapAgentNetwork as anchor.Program<DiapAgentNetwork>;

// Register agent
await program.methods
  .registerAgent(identifier, publicKey, new anchor.BN(stakedAmount))
  .accounts({
    agent: agentPda,
    network: networkPda,
    // ... other accounts
  })
  .rpc();
```

## Security Best Practices

1. **Authority Checks**: Always verify signer authority
2. **Account Validation**: Validate all accounts passed to instructions
3. **Overflow Protection**: Use Anchor's built-in overflow checks
4. **Rent Exemption**: Ensure all accounts are rent-exempt
5. **Seed Verification**: Verify PDA seeds match expected values
6. **Emergency Controls**: Maintain emergency pause/withdraw mechanisms

## Deployment Checklist

Before deploying to mainnet:

- [ ] Audit smart contracts
- [ ] Verify tokenomics calculations
- [ ] Test staking reward distribution
- [ ] Test emergency controls
- [ ] Verify authority keys
- [ ] Set appropriate fees
- [ ] Configure treasury addresses
- [ ] Document all PDAs
- [ ] Create frontend integration examples
- [ ] Deploy to devnet first
- [ ] Monitor for 1 week on devnet

## Troubleshooting

### Common Issues

**Issue**: "Program failed to compile"
```bash
# Solution: Update dependencies
cargo update
anchor clean
anchor build
```

**Issue**: "Transaction simulation failed"
```bash
# Solution: Check account balances
solana balance
solana airdrop 2
```

**Issue**: "PDA derivation mismatch"
```bash
# Solution: Verify seeds match exactly
# Check bump seeds in logs
```

**Issue**: "Account not rent-exempt"
```bash
# Solution: Increase lamports sent
# Accounts need ~0.002 SOL minimum
```

## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Developer Docs](https://docs.solana.com/)
- [Anchor Examples](https://github.com/coral-xyz/anchor/tree/master/examples)
- [Solana Cookbook](https://solanacookbook.com/)

## Support

For questions or issues:
1. Check this documentation
2. Review Anchor examples
3. Open an issue on GitHub
4. Ask in Solana Discord

## License

MIT License - See LICENSE file for details
