# DIAP - 去中心化智能体协议

> Decentralized Intelligent Agent Protocol - 基于区块链的智能体网络基础设施

## 🚀 项目简介

DIAP 是一个去中心化智能体网络协议，为 AI 智能体提供身份、支付、通信和治理的完整基础设施。现已集成 ERC-4337 账户抽象标准，为智能体提供更安全、更灵活的链上钱包解决方案。

## ✨ 最新更新 (v0.4.0)

- 🆕 **ERC-4337 集成**: 完整的账户抽象支持（DIAPAccount, DIAPAccountFactory, DIAPPaymaster）
- 🔐 **Session Key 管理**: 智能体临时授权密钥，支持限额和过期控制
- 💰 **Gas 赞助**: Paymaster 为智能体操作支付 Gas 费用
- ⚡ **Gas 优化**: 循环增量优化、unchecked 块、批量操作
- 🧪 **测试完善**: 22 个 ERC-4337 测试全部通过
- 🌐 **Sepolia 部署**: 所有合约已部署到 Sepolia 测试网
- 📝 **代码质量**: Solhint v6 配置，代码检查通过

## 🏗️ 核心合约

| 合约 | 功能 | 状态 |
|------|------|------|
| **DIAPToken** | ERC20代币，质押和奖励机制 | ✅ 已部署 |
| **DIAPAgentNetwork** | 智能体注册、DID管理、IPNS支持 | ✅ 已部署 |
| **DIAPVerification** | ZKP身份验证和恶意行为检测 | ✅ 已部署 |
| **DIAPPaymentCore** | 基础支付和服务托管 | ✅ 已部署 |
| **DIAPPaymentChannel** | 支付通道和状态通道 | ✅ 已部署 |
| **DIAPPaymentPrivacy** | 隐私支付（ZKP） | ✅ 已部署 |
| **DIAPGovernance** | DAO治理和提案投票 | ✅ 已部署 |
| **TimelockController** | 时间锁保护机制 | ✅ 已部署 |
| **DIAPAccountFactory** | ERC-4337 账户工厂 | ✅ 已部署 |
| **DIAPPaymaster** | ERC-4337 Gas 赞助 | ✅ 已部署 |

## ✨ 主要特性

### 核心功能
- ✅ IPNS持久化身份标识符
- ✅ 智能体身份和DID管理
- ✅ 多层级质押机制
- ✅ 服务托管支付和自动结算
- ✅ 支付通道（链下交易）
- ✅ 隐私支付（ZKP验证）
- ✅ DAO治理和时间锁保护

### ERC-4337 账户抽象
- ✅ **智能钱包**: 智能体拥有自己的智能合约账户
- ✅ **Session Keys**: 临时授权密钥，支持限额和过期控制
- ✅ **Gas 赞助**: Paymaster 为智能体操作支付 Gas
- ✅ **白名单**: 限制智能体只能与授权合约交互
- ✅ **冻结机制**: 紧急情况下可冻结账户
- ✅ **批量操作**: 支持批量转账和白名单管理

## 🌐 测试网部署

### Sepolia (Ethereum Testnet)

| 合约 | 代理地址 | 区块浏览器 |
|------|---------|-----------|
| DIAPToken | [0x2a5b6A672e9028962Ab4DaF20d256C0978604Cb3](https://sepolia.etherscan.io/address/0x2a5b6A672e9028962Ab4DaF20d256C0978604Cb3) | Etherscan |
| DIAPAgentNetwork | [0x9eF71FD5be68ebab2ABE20c5Fab826b14BfBc089](https://sepolia.etherscan.io/address/0x9eF71FD5be68ebab2ABE20c5Fab826b14BfBc089) | Etherscan |
| DIAPVerification | [0x8F513135a6865173b6fC08e7A1138211ba174109](https://sepolia.etherscan.io/address/0x8F513135a6865173b6fC08e7A1138211ba174109) | Etherscan |
| DIAPPaymentCore | [0x498CbdD8d509058FfDe7335391B8a053Bb4Ab0e7](https://sepolia.etherscan.io/address/0x498CbdD8d509058FfDe7335391B8a053Bb4Ab0e7) | Etherscan |
| DIAPPaymentChannel | [0x471cB216e5bF64d9E33b92E12d6AE3327c7a7a80](https://sepolia.etherscan.io/address/0x471cB216e5bF64d9E33b92E12d6AE3327c7a7a80) | Etherscan |
| DIAPPaymentPrivacy | [0x69bd0c763F86B80C043eA7CF1af58186E23E21cc](https://sepolia.etherscan.io/address/0x69bd0c763F86B80C043eA7CF1af58186E23E21cc) | Etherscan |
| DIAPGovernance | [0xFBD843F3ECDd5398639d849763088BF9Cd36f2Be](https://sepolia.etherscan.io/address/0xFBD843F3ECDd5398639d849763088BF9Cd36f2Be) | Etherscan |
| DIAPAccountFactory | [0xeaf2cb64685695497bf20f70c6F74bA86851edfD](https://sepolia.etherscan.io/address/0xeaf2cb64685695497bf20f70c6F74bA86851edfD) | Etherscan |
| DIAPPaymaster | [0xA960cf9053FA76278e16f9D4BA35225f7634DC54](https://sepolia.etherscan.io/address/0xA960cf9053FA76278e16f9D4BA35225f7634DC54) | Etherscan |

**完整部署信息**: 查看 [emergency/contract_addresses.txt](./emergency/contract_addresses.txt)

## 📊 代币经济

- **总供应量**: 10亿 DIAP
- **初始供应**: 1亿 DIAP (10%)
- **代币分配**: 
  - 社区 40% (4000万)
  - 国库 22% (2200万)
  - 开发者 15% (1500万)
  - 投资人 15% (1500万)
  - 质押奖励池 8% (800万)

### 质押层级

| 层级 | 最小质押 | 奖励倍数 | 锁定期 |
|------|----------|----------|--------|
| 青铜 | 1,000 DIAP | 1x | 30天 |
| 白银 | 10,000 DIAP | 1.5x | 90天 |
| 黄金 | 50,000 DIAP | 2x | 180天 |
| 铂金 | 100,000 DIAP | 3x | 365天 |

## 🔒 安全特性

### 智能合约安全
- ✅ 重入攻击防护（ReentrancyGuard）
- ✅ 权限控制（Ownable）
- ✅ 紧急暂停（Pausable）
- ✅ 时间锁机制（2天延迟）
- ✅ UUPS 可升级模式
- ✅ EIP-712 签名验证
- ✅ Custom Errors（Gas优化）

### ERC-4337 安全
- ✅ Session Key 限额控制
- ✅ 账户冻结机制
- ✅ 白名单访问控制
- ✅ Nonce 防重放攻击
- ✅ 签名验证（EIP-1271）

### Gas 优化
- ✅ 循环增量优化（unchecked { ++i }）
- ✅ 批量操作支持
- ✅ Minimal Proxy 模式（CREATE2）
- ✅ Immutable 变量
- ✅ Calldata 优化

## 📖 文档

- [ERC-4337 集成文档](./docs/ERC4337-Integration.md) - 完整的账户抽象集成指南
- [部署指南](./docs/DEPLOYMENT_GUIDE.md) - 合约部署详细说明
- [Gas 优化报告](./docs/Gas-Optimization.md) - Gas优化策略和效果
- [安全审计报告](./docs/Security-Audit.md) - 安全评估和最佳实践
- [DIAP 协议文档](./docs/DIAP_README.md) - 完整的协议规范

## 🧪 测试状态

- ✅ **22 个 ERC-4337 测试**全部通过
  - 账户创建和预计算
  - Session Key 管理
  - 限额管理
  - 白名单管理
  - 账户控制
  - AgentNetwork 集成
  - Paymaster 功能

## 🗳️ 治理

- **提案门槛**: 1,000 DIAP
- **投票期**: 3 天
- **执行延迟**: 1 天
- **法定人数**: 4%

## 🌐 支持的网络

### 测试网
- ✅ **Sepolia** (Ethereum Testnet) - 已部署
- ✅ **Base Sepolia** - 已部署

### 主网（计划中）
- Ethereum
- Polygon
- Arbitrum
- Optimism

## 📈 路线图

- ✅ Phase 1: 基础功能（已完成）
- ✅ Phase 2: 安全增强（已完成）
- ✅ Phase 3: ERC-4337 集成（已完成）
- 🚧 Phase 4: 跨链支持（进行中）
- 📋 Phase 5: 生态扩展（计划中）

## ⚡ Gas 优化成果

| 操作 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 创建账户 | ~2,000,000 | ~45,000 | 97.75% |
| 批量转账(5次) | ~500,000 | ~200,000 | 60% |
| 循环操作 | 每次+30-40 gas | 0 | 100% |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 代码规范
- Solidity ^0.8.30
- 遵循 OpenZeppelin 标准
- Solhint v6 配置
- 完整的测试覆盖

## 📄 许可证

MIT License

## 📞 联系方式

- 网站: [https://alou.onl/](https://alou.onl/)
- 文档: [https://alou.fun](https://alou.fun)
- Discord: [https://discord.gg/EYqPzuzrdw](https://discord.gg/EYqPzuzrdw)
- Email: yuanjieliu65@gmail.com
- GitHub: [logos-42/Alou-DAO](https://github.com/logos-42/Alou-DAO)

---

⚠️ **注意**: 这是一个实验性项目，请在生产环境使用前进行充分测试和审计。

**版本**: v0.4.0  
**最后更新**: 2025-11-01  
**部署网络**: Sepolia Testnet (Chain ID: 11155111)
