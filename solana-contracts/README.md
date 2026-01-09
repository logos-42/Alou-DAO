# DIAP Solana Contracts

This directory contains Solana/Anchor versions of the DIAP smart contracts, adapted from the Solidity Ethereum versions.

## Programs

### 1. diap-agent-network
Manages agents in the DIAP decentralized network including registration, verification, messaging, and services.

**Key Functions:**
- `initialize` - Initialize the agent network
- `register_agent` - Register a new agent with staking
- `unstake_agent` - Unstake and deactivate an agent
- `verify_agent` - Verify an agent's identity
- `send_message` - Send messages between agents
- `create_service` - Create a service offer
- `complete_service` - Complete a service and receive payment
- `update_network_params` - Update network parameters
- `withdraw_fees` - Withdraw accumulated fees

### 2. diap-token
SPL Token with staking, burning, and reward distribution features.

**Key Functions:**
- `initialize_token` - Initialize the token mint
- `mint_tokens` - Mint new tokens (authority only)
- `stake` - Stake tokens to earn rewards
- `unstake` - Unstake tokens
- `claim_rewards` - Claim staking rewards
- `burn_tokens` - Burn tokens (deflationary mechanism)
- `update_config` - Update token configuration
- `emergency_pause` - Emergency pause functionality
- `replenish_staking_pool` - Add tokens to staking pool

**Staking Tiers:**
- Bronze (Tier 0): 1,000+ tokens, 1x rewards, 30-day lock
- Silver (Tier 1): 10,000+ tokens, 1.5x rewards, 90-day lock
- Gold (Tier 2): 50,000+ tokens, 2x rewards, 180-day lock
- Platinum (Tier 3): 100,000+ tokens, 3x rewards, 365-day lock

### 3. diap-payment-core
Core payment contract for basic payments and escrow services.

### 4. diap-payment-channel
Payment channel contract for state channels and off-chain payments.

### 5. diap-payment-privacy
Privacy-focused payment contract using ZKPs for anonymous payments.

### 6. diap-verification
Verification contract for ZK-based identity and reputation verification.

### 7. diap-governance
Governance contract for decentralized management and voting.

### 8. diap-subscription
Subscription management contract for multi-token subscription plans.

## Building

```bash
# Build all programs
anchor build

# Build specific program
anchor build -p diap-agent-network
```

## Testing

```bash
# Run all tests
anchor test

# Run specific test
anchor test --skip-local-validator
```

## Deployment

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet
anchor deploy --provider.cluster mainnet
```

## Architecture Notes

### Differences from Ethereum Version

1. **Account Model**: Solana uses explicit account passing instead of implicit `msg.sender`
2. **PDAs**: Program Derived Addresses are used for state management
3. **Token Handling**: Uses SPL Token standard instead of ERC20
4. **No Gas**: Transaction fees are separate from computation
5. **Parallel Processing**: Transactions can be processed in parallel
6. **No Proxy Pattern**: Upgradeability is handled differently in Solana
7. **Rent**: Accounts must maintain minimum SOL balance for rent exemption

### Key Adaptations

- **Agent Registration**: Uses PDAs for agent accounts
- **Token Operations**: Integrated with SPL Token standard
- **State Storage**: Uses Anchor account structs with explicit space allocation
- **Authorization**: Uses CPI (Cross-Program Invocation) for authority checks
- **Signature Verification**: Uses Solana's native signature system

## Security Considerations

- All authority checks are explicit through CPI
- Rent-exempt accounts are enforced
- Overflow/underflow checks are built-in to Anchor
- Emergency pause functionality is available
- Reentrancy guards are built into Anchor

## License

MIT
