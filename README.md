# DIAP - 去中心化智能体协议

> Decentralized Intelligent Agent Protocol - 基于区块链的智能体网络基础设施

## 🚀 项目简介

DIAP 是一个去中心化智能体网络协议，为 AI 智能体提供身份、支付、通信和治理的完整基础设施。

## ✨ 最新更新 (v0.3.0)

- 🆕 **IPNS支持**: 智能体可使用IPNS名称作为永久标识符
- 🔄 **代币分配优化**: 社区40%、国库22%、开发者15%、投资人15%、质押奖励池8%
- 💰 **质押奖励池**: 800万 DIAP 预留用于质押奖励
- ✅ **完全向后兼容**: 支持现有CID格式智能体
- 🧪 **46个测试全部通过**: 包含16个IPNS功能测试

## 🏗️ 核心合约

| 合约 | 功能 |
|------|------|
| **DIAPToken** | ERC20代币，质押和奖励机制 |
| **DIAPAgentNetwork** | 智能体注册、DID管理、IPNS支持 |
| **DIAPPaymentCore** | 基础支付和服务托管 |
| **DIAPPaymentChannel** | 支付通道和状态通道 |
| **DIAPPaymentPrivacy** | 隐私支付（ZKP） |
| **DIAPGovernance** | DAO治理和提案投票 |

## ✨ 主要特性

- ✅ IPNS持久化身份标识符
- ✅ 智能体身份和DID管理
- ✅ 多层级质押机制
- ✅ 服务托管支付和自动结算
- ✅ 支付通道（链下交易）
- ✅ 隐私支付（ZKP验证）
- ✅ DAO治理和时间锁保护

## 🛠️ 快速开始

### 安装

```bash
npm install
```

### 编译

```bash
npx hardhat compile
```

### 测试

```bash
npx hardhat test
```

### 部署

```bash
npx hardhat run scripts/deploy_diap_full.js --network <network-name>
```

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

- ✅ 重入攻击防护（ReentrancyGuard）
- ✅ 权限控制（Ownable）
- ✅ 紧急暂停（Pausable）
- ✅ 时间锁机制（2天延迟）
- ✅ UUPS 可升级模式
- ✅ EIP-712 签名验证

## 📖 文档

- [架构文档](./ARCHITECTURE.md) - 详细的合约架构说明
- [DIAP 协议文档](./DIAP_README.md) - 完整的协议规范

## 🗳️ 治理

- **提案门槛**: 1,000 DIAP
- **投票期**: 3 天
- **执行延迟**: 1 天
- **法定人数**: 4%

## 🌐 支持的网络

- Ethereum
- Polygon
- Arbitrum
- Optimism

## 📈 路线图

- ✅ Phase 1: 基础功能（已完成）
- ✅ Phase 2: 安全增强（已完成）
- 🚧 Phase 3: 跨链支持（进行中）
- 📋 Phase 4: 生态扩展（计划中）

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📞 联系方式

- 网站: [https://alou.onl/](https://alou.onl/)
- 文档: [https://alou.fun](https://alou.fun)
- Discord: [https://discord.gg/EYqPzuzrdw](https://discord.gg/EYqPzuzrdw)
- Email: yuanjieliu65@gmail.com

---

⚠️ **注意**: 这是一个实验性项目，请在生产环境使用前进行充分测试和审计。
