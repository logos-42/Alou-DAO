# 多签钱包设置指南

## 为什么需要多签？

作为独立开发者，使用 2/3 多签可以：
- ✅ 防止单个钱包丢失导致资金锁死
- ✅ 需要两个钱包才能操作，增加安全性
- ✅ 你一个人也能管理（不需要其他人）

## 方案：使用 Gnosis Safe

### 步骤 1: 准备 3 个钱包

```
钱包 1 - 日常使用（MetaMask）
├─ 用途：日常操作、签名交易
├─ 存储：浏览器插件
└─ 风险：中等（在线）

钱包 2 - 冷存储（Ledger 硬件钱包）
├─ 用途：重要操作的第二签名
├─ 存储：硬件设备
└─ 风险：低（离线）

钱包 3 - 备份（纸钱包）
├─ 用途：紧急恢复
├─ 存储：保险箱/银行保险柜
└─ 风险：最低（完全离线）
```

### 步骤 2: 创建 Gnosis Safe

#### 在线创建（推荐）

1. **访问 Gnosis Safe**
   - 测试网: https://app.safe.global/welcome
   - 主网: https://app.safe.global/welcome

2. **连接钱包 1（MetaMask）**
   - 点击 "Create new Safe"
   - 选择网络（Sepolia 测试网）

3. **添加所有者**
   ```
   Owner 1: 你的 MetaMask 地址
   Owner 2: 你的 Ledger 地址
   Owner 3: 你的纸钱包地址
   ```

4. **设置阈值**
   ```
   Threshold: 2 of 3
   （需要 2 个签名才能执行交易）
   ```

5. **部署 Safe**
   - 确认交易
   - 支付 Gas 费
   - 等待确认

6. **保存 Safe 地址**
   ```bash
   # 在 .env 中添加
   GNOSIS_SAFE_ADDRESS=0x你的Safe地址
   ```

### 步骤 3: 测试多签

创建测试脚本：

```javascript
// scripts/multisig/test_multisig.js
const hre = require("hardhat");

async function main() {
    const safeAddress = process.env.GNOSIS_SAFE_ADDRESS;
    
    console.log("测试多签钱包:", safeAddress);
    
    // 1. 检查 Safe 配置
    const safe = await hre.ethers.getContractAt(
        "GnosisSafe",
        safeAddress
    );
    
    const owners = await safe.getOwners();
    const threshold = await safe.getThreshold();
    
    console.log("所有者:", owners);
    console.log("阈值:", threshold.toString());
    
    // 2. 测试提案交易
    console.log("\n创建测试交易...");
    // 这里需要通过 Safe UI 或 SDK 创建交易
}

main();
```

### 步骤 4: 转移合约所有权到多签

```javascript
// scripts/multisig/transfer_ownership.js
const hre = require("hardhat");

async function main() {
    const safeAddress = process.env.GNOSIS_SAFE_ADDRESS;
    const tokenAddress = process.env.DIAP_TOKEN_ADDRESS;
    
    console.log("⚠️  警告：即将转移合约所有权到多签钱包");
    console.log("Safe 地址:", safeAddress);
    console.log("Token 地址:", tokenAddress);
    
    // 确认
    if (hre.network.name === "mainnet") {
        console.log("❌ 主网操作需要额外确认");
        process.exit(1);
    }
    
    // 转移所有权
    const token = await hre.ethers.getContractAt("DIAPToken", tokenAddress);
    const tx = await token.transferOwnership(safeAddress);
    await tx.wait();
    
    console.log("✅ 所有权已转移");
    console.log("交易哈希:", tx.hash);
    
    // 验证
    const newOwner = await token.owner();
    console.log("新所有者:", newOwner);
    console.log("是否正确:", newOwner === safeAddress ? "✅" : "❌");
}

main();
```

## 使用多签的日常操作

### 1. 通过 Safe UI 操作（推荐）

```
1. 访问 https://app.safe.global
2. 连接钱包 1（MetaMask）
3. 选择你的 Safe
4. 点击 "New Transaction"
5. 选择操作类型：
   - Send tokens
   - Contract interaction
   - Custom transaction
6. 填写交易详情
7. 提交（第一个签名）
8. 切换到钱包 2（Ledger）
9. 签名确认（第二个签名）
10. 执行交易
```

### 2. 通过脚本操作（高级）

需要安装 Safe SDK：

```bash
npm install @safe-global/safe-core-sdk @safe-global/safe-ethers-lib
```

创建脚本：

```javascript
// scripts/multisig/propose_transaction.js
const Safe = require('@safe-global/safe-core-sdk').default;
const EthersAdapter = require('@safe-global/safe-ethers-lib').default;

async function main() {
    // 初始化
    const [signer] = await hre.ethers.getSigners();
    const ethAdapter = new EthersAdapter({ ethers, signerOrProvider: signer });
    
    const safe = await Safe.create({
        ethAdapter,
        safeAddress: process.env.GNOSIS_SAFE_ADDRESS
    });
    
    // 创建交易
    const transaction = {
        to: process.env.DIAP_TOKEN_ADDRESS,
        value: '0',
        data: '0x...' // 编码的函数调用
    };
    
    const safeTransaction = await safe.createTransaction({ safeTransactionData: transaction });
    
    // 签名
    await safe.signTransaction(safeTransaction);
    
    console.log("✅ 交易已提案，等待其他签名者确认");
}

main();
```

## 紧急情况处理

### 如果丢失一个钱包

```
场景 1: 丢失钱包 1（MetaMask）
├─ 使用钱包 2 + 钱包 3
├─ 仍然可以操作（2/3）
└─ 之后移除钱包 1，添加新钱包

场景 2: 丢失钱包 2（Ledger）
├─ 使用钱包 1 + 钱包 3
├─ 仍然可以操作（2/3）
└─ 之后移除钱包 2，添加新钱包

场景 3: 丢失钱包 3（纸钱包）
├─ 使用钱包 1 + 钱包 2
├─ 仍然可以操作（2/3）
└─ 之后移除钱包 3，添加新钱包
```

### 更换所有者

```javascript
// 通过 Safe UI
1. 进入 Safe 设置
2. 点击 "Owners"
3. 点击 "Add owner" 或 "Remove owner"
4. 需要达到阈值的签名确认
```

## 最佳实践

### ✅ 应该做的

1. **定期测试**
   - 每月测试一次多签流程
   - 确保所有钱包都能访问

2. **安全存储**
   - 钱包 1: 日常使用，定期更新密码
   - 钱包 2: 硬件钱包，放在安全的地方
   - 钱包 3: 纸钱包，放在保险箱

3. **备份助记词**
   - 每个钱包的助记词分别备份
   - 存储在不同的物理位置
   - 考虑使用金属板备份

4. **文档记录**
   - 记录 Safe 地址
   - 记录所有者地址
   - 记录操作流程

### ❌ 不应该做的

1. **不要**把所有钱包放在同一个地方
2. **不要**在线存储助记词
3. **不要**分享助记词给任何人
4. **不要**使用截图保存助记词
5. **不要**忘记定期测试

## 成本估算

### 测试网（Sepolia）
- 创建 Safe: ~0.01 ETH
- 每次交易: ~0.001-0.005 ETH
- 总计: 可以用测试网水龙头获取

### 主网（Ethereum）
- 创建 Safe: ~$20-50（取决于 Gas）
- 每次交易: ~$5-20（取决于 Gas）
- 建议: 在 Gas 低的时候操作

### 其他网络（更便宜）
- Polygon: ~$0.01-0.1
- Arbitrum: ~$0.5-2
- Optimism: ~$0.5-2

## 故障排查

### 问题：无法连接 Ledger

```
解决方案：
1. 确保 Ledger 固件是最新的
2. 在 Ledger 上打开 Ethereum 应用
3. 启用 "Blind signing"（在设置中）
4. 使用 Chrome 浏览器
5. 尝试使用 Ledger Live 桥接
```

### 问题：交易卡住

```
解决方案：
1. 检查是否有足够的签名
2. 检查 Gas 价格是否合理
3. 尝试取消并重新提交
4. 联系 Safe 支持
```

### 问题：找不到 Safe

```
解决方案：
1. 确认网络是否正确
2. 确认 Safe 地址是否正确
3. 清除浏览器缓存
4. 尝试不同的浏览器
```

## 资源链接

- Gnosis Safe 官网: https://safe.global
- Safe 文档: https://docs.safe.global
- Safe SDK: https://github.com/safe-global/safe-core-sdk
- 社区支持: https://discord.gg/safe

---

**重要提醒**: 
- 在主网操作前，先在测试网完整测试一遍
- 保管好所有助记词和私钥
- 定期测试恢复流程
- 考虑购买硬件钱包（Ledger/Trezor）

祝你设置顺利！🔐
