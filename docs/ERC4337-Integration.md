# DIAP ERC-4337 集成文档

## 概述

DIAP 智能体网络现已集成 ERC-4337 账户抽象标准，为智能体提供更安全、更灵活的链上钱包解决方案。

## 架构

```
智能体生态
├── 传统方式（EOA）
│   └── 智能体使用外部账户（私钥管理）
│
└── ERC-4337 方式（推荐）
    ├── DIAPAccount（智能体账户合约）
    │   ├── Owner（主人完全控制）
    │   ├── Session Keys（智能体临时授权）
    │   ├── 支出限额（每日/单笔）
    │   └── 白名单（允许的合约）
    │
    ├── DIAPAccountFactory（账户工厂）
    │   └── 使用 CREATE2 创建可预测地址
    │
    └── DIAPPaymaster（Gas 赞助）
        └── 为智能体操作支付 Gas
```

## 核心合约

### 1. DIAPAccount

智能体的 ERC-4337 账户合约，支持：

- **Owner 控制**：主人拥有完全控制权
- **Session Keys**：智能体的临时授权密钥
- **支出限额**：每日和单笔限额控制
- **白名单**：只能与授权的合约交互
- **EIP-1271**：标准签名验证
- **冻结机制**：紧急情况下冻结账户

### 2. DIAPAccountFactory

账户工厂合约，负责：

- 使用 Minimal Proxy 模式创建账户
- CREATE2 部署，地址可预测
- 维护账户注册表
- 批量创建账户

### 3. DIAPPaymaster

Gas 赞助合约，提供：

- 为智能体操作支付 Gas
- 每日 Gas 配额管理
- 账户和目标白名单
- Gas 使用统计

## 部署指南

### 1. 部署合约

```bash
# 部署到测试网
npx hardhat run scripts/deploy-aa.js --network sepolia

# 部署到主网
npx hardhat run scripts/deploy-aa.js --network mainnet
```

### 2. 配置 AgentNetwork

```javascript
// 设置 AccountFactory 地址
await agentNetwork.setAccountFactory(accountFactoryAddress);
```

### 3. 配置 Paymaster

```javascript
// 添加 DIAP 生态合约到白名单
await paymaster.batchAddTargetToWhitelist([
    diapTokenAddress,
    diapAgentNetworkAddress,
    diapPaymentCoreAddress,
    diapVerificationAddress
]);

// 设置默认每日配额
await paymaster.setDefaultDailyQuota(ethers.utils.parseEther("0.01"));

// 添加存款
await paymaster.addDeposit({ value: ethers.utils.parseEther("1.0") });
```

## 使用指南

### 智能体注册（AA 方式）

#### 方式 1：通过合约直接注册

```javascript
// 注册智能体并创建 AA 账户
const tx = await agentNetwork.registerAgentWithAA(
    didDocument,      // IPNS 名称
    publicKey,        // 公钥
    stakedAmount,     // 质押数量
    salt              // 用于生成唯一地址的盐值
);

const receipt = await tx.wait();
const aaAccountAddress = receipt.events.find(
    e => e.event === 'AAAccountCreated'
).args.aaAccount;

console.log("AA 账户地址:", aaAccountAddress);
```

#### 方式 2：通过 UserOperation

```javascript
import { Client } from "userop";

// 初始化客户端
const client = await Client.init(rpcUrl, {
    entryPoint: ENTRY_POINT_ADDRESS,
    factory: accountFactoryAddress,
});

// 构建 UserOperation
const userOp = await client.buildUserOperation({
    target: agentNetworkAddress,
    data: encodeFunctionData({
        abi: agentNetworkABI,
        functionName: "registerAgentWithAA",
        args: [didDocument, publicKey, stakedAmount, salt],
    }),
});

// 签名并发送
const result = await client.sendUserOperation(userOp);
console.log("UserOp Hash:", result.userOpHash);
```

### Session Key 管理

#### 添加 Session Key

```javascript
// 主人添加 Session Key
await aaAccount.addSessionKey(
    sessionKeyAddress,                    // Session Key 地址
    Math.floor(Date.now() / 1000) + 30 * 24 * 3600,  // 30 天后过期
    ethers.utils.parseEther("1000"),      // 每日限额 1000 DIAP
    ethers.utils.parseEther("100")        // 单笔限额 100 DIAP
);
```

#### 智能体使用 Session Key

```javascript
// 智能体使用 Session Key 发起操作
const sessionKeyProvider = new SessionKeyProvider(
    sessionKeyPrivateKey,
    aaAccountAddress
);

// 发起支付
await sessionKeyProvider.sendTransaction({
    to: paymentCoreAddress,
    data: createPaymentData,
});
```

### 白名单管理

```javascript
// 添加合约到白名单
await aaAccount.addToWhitelist(contractAddress);

// 批量添加
await aaAccount.batchAddToWhitelist([
    address1,
    address2,
    address3
]);

// 移除
await aaAccount.removeFromWhitelist(contractAddress);
```

### 限额管理

```javascript
// 设置每日限额
await aaAccount.setDefaultDailyLimit(
    ethers.utils.parseEther("2000")  // 2000 DIAP
);

// 设置单笔限额
await aaAccount.setDefaultPerTxLimit(
    ethers.utils.parseEther("200")   // 200 DIAP
);
```

### 紧急控制

```javascript
// 冻结账户
await aaAccount.freeze();

// 解冻账户
await aaAccount.unfreeze();

// 转移所有权
await aaAccount.transferOwnership(newOwnerAddress);
```

## 查询功能

### 查询 AA 账户信息

```javascript
// 获取智能体的 AA 账户地址
const aaAccount = await agentNetwork.getAgentAAAccount(agentAddress);

// 检查是否使用 AA 账户
const isAA = await agentNetwork.isAgentUsingAA(agentAddress);

// 获取代币余额
const balance = await agentNetwork.getAgentTokenBalance(agentAddress);
```

### 查询 Session Key 信息

```javascript
const sessionKeyInfo = await aaAccount.getSessionKeyInfo(sessionKeyAddress);
console.log({
    validUntil: sessionKeyInfo.validUntil,
    dailyLimit: sessionKeyInfo.dailyLimit,
    perTxLimit: sessionKeyInfo.perTxLimit,
    spentToday: sessionKeyInfo.spentToday,
    remainingToday: sessionKeyInfo.remainingToday,
    isActive: sessionKeyInfo.isActive
});
```

### 查询 Paymaster 配额

```javascript
const quotaInfo = await paymaster.getGasQuotaInfo(aaAccountAddress);
console.log({
    dailyQuota: quotaInfo.dailyQuota,
    usedToday: quotaInfo.usedToday,
    remainingToday: quotaInfo.remainingToday,
    isActive: quotaInfo.isActive
});
```

## 前端集成

### 使用 userop.js

```javascript
import { Client, Presets } from "userop";

// 创建客户端
const client = await Client.init(rpcUrl, {
    entryPoint: ENTRY_POINT_ADDRESS,
    factory: accountFactoryAddress,
    paymaster: paymasterAddress,
});

// 构建并发送 UserOperation
const builder = await Presets.Builder.SimpleAccount.init(
    signerOrProvider,
    rpcUrl,
    {
        entryPoint: ENTRY_POINT_ADDRESS,
        factory: accountFactoryAddress,
    }
);

const userOp = await builder.execute(
    targetAddress,
    value,
    callData
);

const result = await client.sendUserOperation(userOp);
```

### 使用 Alchemy Account Kit

```javascript
import { AlchemyProvider } from "@alchemy/aa-alchemy";
import { LocalAccountSigner } from "@alchemy/aa-core";

const provider = new AlchemyProvider({
    apiKey: ALCHEMY_API_KEY,
    chain: sepolia,
    entryPointAddress: ENTRY_POINT_ADDRESS,
});

const signer = LocalAccountSigner.privateKeyToAccountSigner(privateKey);
const smartAccountAddress = await provider.getAddress();

// 发送交易
const result = await provider.sendUserOperation({
    target: targetAddress,
    data: callData,
    value: 0n,
});
```

## 安全最佳实践

### 1. Session Key 管理

- ✅ 定期轮换 Session Keys（建议每月）
- ✅ 设置合理的有效期（不超过 90 天）
- ✅ 使用最小权限原则（最低限额）
- ✅ 监控 Session Key 使用情况
- ❌ 不要共享 Session Key 私钥

### 2. 限额设置

- ✅ 根据智能体用途设置合理限额
- ✅ 定期审查和调整限额
- ✅ 为高价值操作设置更严格的限制
- ❌ 不要设置过高的限额

### 3. 白名单管理

- ✅ 只添加经过审计的合约
- ✅ 定期审查白名单
- ✅ 移除不再使用的合约
- ❌ 不要添加未知合约

### 4. 监控和告警

- ✅ 监控账户余额变化
- ✅ 监控异常交易模式
- ✅ 设置余额低于阈值的告警
- ✅ 记录所有重要操作

## 成本估算

### Gas 成本

| 操作 | Gas 消耗 | 成本（50 gwei） |
|------|---------|----------------|
| 创建 AA 账户 | ~200,000 | ~$0.50 |
| 添加 Session Key | ~50,000 | ~$0.13 |
| 通过 AA 转账 | ~100,000 | ~$0.25 |
| 批量操作（5个） | ~300,000 | ~$0.75 |

### 运营成本（每月）

- 100 个智能体
- 每个智能体每天 10 笔交易
- Paymaster 赞助 Gas

**估算**：
- Gas 消耗：~1 ETH/月
- Bundler 费用：$0-500/月
- **总计**：~$2,000-2,500/月

## 故障排查

### 问题 1：UserOperation 失败

**可能原因**：
- Gas 配额不足
- 不在白名单中
- 签名无效
- 限额超出

**解决方案**：
```javascript
// 检查配额
const quota = await paymaster.getGasQuotaInfo(aaAccount);
console.log("剩余配额:", quota.remainingToday);

// 检查白名单
const isWhitelisted = await aaAccount.isWhitelisted(targetAddress);
console.log("是否在白名单:", isWhitelisted);
```

### 问题 2：Session Key 无法使用

**可能原因**：
- Session Key 已过期
- 限额已用完
- Session Key 未激活

**解决方案**：
```javascript
// 检查 Session Key 状态
const info = await aaAccount.getSessionKeyInfo(sessionKeyAddress);
console.log("Session Key 信息:", info);

// 如果过期，添加新的
if (info.validUntil < Date.now() / 1000) {
    await aaAccount.addSessionKey(/* ... */);
}
```

### 问题 3：Paymaster 拒绝赞助

**可能原因**：
- Paymaster 余额不足
- 账户不在白名单
- 目标合约不在白名单

**解决方案**：
```javascript
// 检查 Paymaster 余额
const deposit = await paymaster.getDeposit();
console.log("Paymaster 余额:", ethers.utils.formatEther(deposit));

// 添加存款
if (deposit.lt(ethers.utils.parseEther("0.1"))) {
    await paymaster.addDeposit({ value: ethers.utils.parseEther("1.0") });
}
```

## 升级路径

### 从 EOA 迁移到 AA

```javascript
// 1. 创建 AA 账户
const aaAccount = await accountFactory.createAccount(ownerAddress, salt);

// 2. 转移资产
await token.transfer(aaAccount, balance);

// 3. 配置 AA 账户
await aaAccount.addSessionKey(/* ... */);
await aaAccount.addToWhitelist(/* ... */);

// 4. 更新智能体信息（需要合约支持）
// 这一步需要在 AgentNetwork 中添加迁移函数
```

## 参考资源

- [ERC-4337 官方文档](https://eips.ethereum.org/EIPS/eip-4337)
- [Account Abstraction 官方仓库](https://github.com/eth-infinitism/account-abstraction)
- [userop.js 文档](https://docs.stackup.sh/docs/userop-js)
- [Alchemy Account Kit](https://docs.alchemy.com/docs/account-kit-overview)
- [Biconomy SDK](https://docs.biconomy.io/)

## 支持

如有问题，请：
1. 查看本文档的故障排查部分
2. 查看合约代码注释
3. 提交 GitHub Issue
4. 联系技术支持团队
