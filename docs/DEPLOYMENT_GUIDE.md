# 测试网部署指南

本指南将帮助您将DIAP智能合约部署到以太坊Sepolia或Base Sepolia测试网。

## 前置要求

1. **钱包和测试币**
   - 准备一个用于部署的钱包地址
   - 确保钱包中有足够的测试ETH支付Gas费用（建议至少0.1 ETH）
   
   - 获取Sepolia测试币: https://sepoliafaucet.com/ 或 https://faucet.quicknode.com/ethereum/sepolia
   - 获取Base Sepolia测试币: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

2. **RPC节点**
   - 以太坊Sepolia: 可以使用Infura、Alchemy或公共RPC节点
   - Base Sepolia: 官方公共RPC `https://sepolia.base.org` 或使用Alchemy

3. **环境变量配置**
   - 创建 `.env` 文件（参考 `.env.example`）
   - 配置以下变量：
     ```
     PRIVATE_KEY=your_private_key_here
     SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_api_key
     BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
     ETHERSCAN_API_KEY=your_etherscan_api_key (可选，用于验证)
     BASESCAN_API_KEY=your_basescan_api_key (可选，用于验证)
     ```

## 安装依赖

```bash
npm install --legacy-peer-deps
```

## 部署步骤

### 1. 编译合约

```bash
npm run compile
```

### 2. 部署到Sepolia测试网

```bash
npm run deploy:sepolia
```

或使用完整命令：

```bash
npx hardhat run scripts/deploy_to_testnet.js --network sepolia
```

### 3. 部署到Base Sepolia测试网

```bash
npm run deploy:base
```

或使用完整命令：

```bash
npx hardhat run scripts/deploy_to_testnet.js --network baseSepolia
```

## 部署过程说明

部署脚本会执行以下步骤：

1. **部署DIAPToken实现合约** - 部署可升级代币合约的实现
2. **部署DIAPToken代理合约** - 使用ERC1967Proxy部署代理并初始化
3. **部署DIAPAgentNetwork实现合约** - 部署智能体网络合约的实现
4. **部署DIAPAgentNetwork代理合约** - 使用ERC1967Proxy部署代理并初始化
5. **验证部署** - 检查所有合约是否正确初始化和连接
6. **保存部署信息** - 将部署地址保存到 `deployments/` 目录

## 部署后的操作

### 1. 验证合约源码

在区块浏览器验证合约源码可以提高透明度和安全性：

**Sepolia:**
```bash
# 验证DIAPToken实现
npx hardhat verify --network sepolia <IMPLEMENTATION_ADDRESS>

# 验证DIAPAgentNetwork实现
npx hardhat verify --network sepolia <IMPLEMENTATION_ADDRESS>
```

**Base Sepolia:**
```bash
# 验证DIAPToken实现
npx hardhat verify --network baseSepolia <IMPLEMENTATION_ADDRESS>

# 验证DIAPAgentNetwork实现
npx hardhat verify --network baseSepolia <IMPLEMENTATION_ADDRESS>
```

### 2. 检查部署信息

部署信息会自动保存到 `deployments/` 目录，包含：
- 代理合约地址（用于前端集成）
- 实现合约地址（用于升级）
- 网络信息
- 部署时间戳

### 3. 测试合约功能

部署后建议测试以下功能：
- 代币转账
- 智能体注册
- 消息发送
- 服务创建和完成

## 合约地址说明

### 代理地址 vs 实现地址

- **代理地址**: 这是您在前端和交互中使用的地址，永远不会改变
- **实现地址**: 这是实际的合约逻辑地址，升级时会部署新的实现地址

### 重要提示

⚠️ **始终使用代理地址进行交互**，不要直接与实现地址交互！

## 升级合约

由于合约使用UUPS可升级模式，可以通过以下步骤升级：

1. 部署新的实现合约
2. 调用代理合约的 `upgradeTo()` 或 `upgradeToAndCall()` 函数
3. 只有合约所有者可以执行升级

## 故障排除

### 1. 余额不足错误

确保钱包中有足够的测试ETH（建议至少0.1 ETH）

### 2. 网络连接错误

检查RPC URL是否正确，并确保可以访问

### 3. 编译错误

运行 `npx hardhat clean` 清理缓存后重新编译

### 4. Gas估算失败

某些网络可能需要手动设置Gas价格，可以在 `hardhat.config.js` 中配置

## 安全建议

1. **私钥安全**: 永远不要将私钥提交到版本控制系统
2. **测试验证**: 在主网部署前充分测试
3. **多重签名**: 考虑使用多重签名钱包管理合约所有权
4. **审计**: 生产环境部署前进行安全审计

## 参考链接

- [Hardhat文档](https://hardhat.org/docs)
- [OpenZeppelin升级模式](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [Sepolia区块浏览器](https://sepolia.etherscan.io/)
- [Base Sepolia区块浏览器](https://sepolia.basescan.org/)

