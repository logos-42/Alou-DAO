# Tenderly 监控配置指南

## 什么是 Tenderly？

Tenderly 是一个强大的智能合约监控和调试平台，免费版已经足够个人开发者使用。

### 主要功能
- 📊 实时监控合约事件
- 🔔 自定义告警规则
- 🐛 交易调试和模拟
- 📈 Gas 分析
- 🔍 合约验证

## 快速开始（5分钟设置）

### 步骤 1: 注册账号

1. 访问 https://tenderly.co
2. 点击 "Sign Up"
3. 使用 GitHub/Google 账号注册（推荐）
4. 创建一个项目（Project）

### 步骤 2: 添加合约

#### 方法 A: 通过 UI 添加（最简单）

1. 在 Tenderly Dashboard 点击 "Add Contract"
2. 选择网络（Sepolia）
3. 输入合约地址
4. 点击 "Add Contract"

合约列表：
```
DIAPToken: 0x你的Token地址
DIAPAgentNetwork: 0x你的Network地址
DIAPPaymentCore: 0x你的PaymentCore地址
DIAPPaymentChannel: 0x你的PaymentChannel地址
DIAPGovernance: 0x你的Governance地址
```

#### 方法 B: 通过 CLI 添加（自动化）

```bash
# 1. 安装 Tenderly CLI
npm install -g @tenderly/cli

# 2. 登录
tenderly login

# 3. 初始化项目
tenderly init

# 4. 添加合约
tenderly push
```

创建 `tenderly.yaml`:

```yaml
account_id: "你的账号ID"
project_slug: "diap-protocol"
contracts:
  - address: "0x你的Token地址"
    network_id: "11155111"  # Sepolia
    name: "DIAPToken"
  - address: "0x你的Network地址"
    network_id: "11155111"
    name: "DIAPAgentNetwork"
  - address: "0x你的PaymentCore地址"
    network_id: "11155111"
    name: "DIAPPaymentCore"
```

### 步骤 3: 设置告警规则

#### 告警 1: 大额转账监控

```javascript
// 在 Tenderly UI 中创建 Alert
名称: "大额转账告警"
合约: DIAPToken
事件: Transfer
条件: 
  - value > 100000 * 10^18  // 超过 10万 DIAP

通知方式:
  - Email
  - Telegram
  - Webhook
```

#### 告警 2: 合约暂停监控

```javascript
名称: "合约暂停告警"
合约: DIAPToken
事件: Paused
条件: 无（所有暂停都告警）

通知方式:
  - Email（立即）
  - Telegram（立即）
  - SMS（如果有）
```

#### 告警 3: 所有权转移监控

```javascript
名称: "所有权转移告警"
合约: DIAPToken
事件: OwnershipTransferred
条件: 无

通知方式:
  - Email（立即）
  - Telegram（立即）
```

#### 告警 4: 质押异常监控

```javascript
名称: "质押异常告警"
合约: DIAPToken
事件: Staked, Unstaked
条件:
  - amount > 1000000 * 10^18  // 超过 100万 DIAP

通知方式:
  - Email
  - Telegram
```

#### 告警 5: 失败交易监控

```javascript
名称: "失败交易告警"
合约: 所有合约
条件:
  - status = "failed"
  - 连续失败 > 3 次

通知方式:
  - Email
  - Telegram
```

### 步骤 4: 配置 Telegram 通知

1. **在 Tenderly 中添加 Telegram**
   - 进入 Settings → Notifications
   - 点击 "Add Telegram"
   - 扫描二维码或点击链接
   - 授权 Tenderly Bot

2. **测试通知**
   - 创建一个测试告警
   - 触发条件
   - 检查是否收到 Telegram 消息

### 步骤 5: 配置 Webhook（高级）

如果你想自定义处理告警：

```javascript
// 创建 Webhook 端点
// scripts/monitoring/webhook_server.js

const express = require('express');
const app = express();

app.use(express.json());

app.post('/tenderly-webhook', async (req, res) => {
    const alert = req.body;
    
    console.log("收到 Tenderly 告警:", alert);
    
    // 处理告警
    if (alert.type === 'TRANSACTION') {
        // 交易告警
        await handleTransactionAlert(alert);
    } else if (alert.type === 'EVENT') {
        // 事件告警
        await handleEventAlert(alert);
    }
    
    res.status(200).send('OK');
});

async function handleTransactionAlert(alert) {
    // 发送到 Telegram
    // 记录日志
    // 触发其他操作
}

app.listen(3000, () => {
    console.log('Webhook 服务器运行在 3000 端口');
});
```

部署 Webhook：
```bash
# 使用 ngrok 暴露本地端口（测试）
ngrok http 3000

# 或部署到云服务（生产）
# - Vercel
# - Railway
# - Heroku
```

在 Tenderly 中配置 Webhook URL：
```
https://your-domain.com/tenderly-webhook
```

## 使用 Tenderly 调试

### 1. 查看交易详情

```
1. 在 Tenderly Dashboard 找到交易
2. 点击查看详情
3. 可以看到：
   - Gas 使用情况
   - 状态变化
   - 事件日志
   - 调用栈
   - 错误信息
```

### 2. 模拟交易

```javascript
// 在 Tenderly UI 中
1. 点击 "Simulate Transaction"
2. 输入交易参数
3. 点击 "Simulate"
4. 查看结果（不会真正执行）

用途：
- 测试交易是否会成功
- 估算 Gas 消耗
- 调试错误
```

### 3. Fork 主网

```javascript
// 创建主网 Fork 用于测试
1. 在 Tenderly 中点击 "Fork"
2. 选择网络和区块高度
3. 获得一个测试 RPC URL
4. 在这个 Fork 上测试

// 在 Hardhat 中使用
module.exports = {
  networks: {
    tenderly: {
      url: "https://rpc.tenderly.co/fork/你的fork-id",
      chainId: 1
    }
  }
};
```

## 监控仪表板

### 创建自定义仪表板

```javascript
// 在 Tenderly UI 中
1. 进入 "Dashboards"
2. 点击 "Create Dashboard"
3. 添加小部件：
   - 交易量图表
   - Gas 使用趋势
   - 事件统计
   - 错误率
   - 活跃用户数
```

### 推荐的仪表板布局

```
┌─────────────────────────────────────┐
│  DIAP Protocol 监控仪表板            │
├─────────────────────────────────────┤
│                                     │
│  📊 24小时交易量                     │
│  [图表]                              │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  💰 合约余额                         │
│  Token: 8,000,000 DIAP              │
│  Network: 500,000 DIAP              │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  👥 活跃用户                         │
│  今天: 150                           │
│  本周: 1,200                         │
│                                     │
├─────────────────────────────────────┤
│                                     │
│  ⚠️  最近告警                        │
│  [列表]                              │
│                                     │
└─────────────────────────────────────┘
```

## 集成到 CI/CD

### GitHub Actions 集成

```yaml
# .github/workflows/tenderly-verify.yml
name: Tenderly Verification

on:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Install Tenderly CLI
        run: npm install -g @tenderly/cli
      
      - name: Verify Contracts
        run: |
          tenderly login --authentication-method access-key --access-key ${{ secrets.TENDERLY_ACCESS_KEY }}
          tenderly push
        env:
          TENDERLY_ACCESS_KEY: ${{ secrets.TENDERLY_ACCESS_KEY }}
```

## 成本

### 免费版（足够个人使用）
- ✅ 3 个项目
- ✅ 无限合约
- ✅ 基础告警
- ✅ 交易调试
- ✅ 7 天数据保留

### 付费版（$50/月起）
- ✅ 无限项目
- ✅ 高级告警
- ✅ 更长数据保留
- ✅ 团队协作
- ✅ 优先支持

**建议**: 先用免费版，等项目成熟后再考虑升级

## 最佳实践

### ✅ 应该做的

1. **设置关键告警**
   - 大额转账
   - 合约暂停
   - 所有权变更
   - 失败交易

2. **定期检查仪表板**
   - 每天至少看一次
   - 关注异常模式
   - 分析 Gas 使用

3. **使用模拟功能**
   - 部署前模拟
   - 升级前测试
   - 参数调整验证

4. **保持合约更新**
   - 代码更新后重新验证
   - 保持 ABI 同步

### ❌ 不应该做的

1. **不要**忽略告警
2. **不要**设置太多无用告警
3. **不要**分享 API 密钥
4. **不要**在生产环境使用 Fork

## 故障排查

### 问题：合约未显示

```
解决方案：
1. 确认合约地址正确
2. 确认网络选择正确
3. 等待几分钟（索引需要时间）
4. 尝试手动添加
```

### 问题：告警不工作

```
解决方案：
1. 检查告警条件是否正确
2. 确认通知渠道已配置
3. 测试告警（手动触发）
4. 检查邮件垃圾箱
```

### 问题：无法连接 Telegram

```
解决方案：
1. 重新授权 Tenderly Bot
2. 检查 Telegram 设置
3. 尝试使用其他通知方式
4. 联系 Tenderly 支持
```

## 替代方案

如果 Tenderly 不适合你：

### OpenZeppelin Defender
- 类似功能
- 更注重安全
- 有免费版

### Blocknative
- 实时交易监控
- Mempool 监控
- 有免费版

### The Graph
- 自定义数据索引
- 完全免费
- 需要编写 Subgraph

## 资源链接

- Tenderly 官网: https://tenderly.co
- 文档: https://docs.tenderly.co
- CLI 文档: https://github.com/Tenderly/tenderly-cli
- 社区: https://discord.gg/tenderly

---

**下一步**: 设置完 Tenderly 后，配置 Telegram Bot 进行双重告警保障。

🎯 目标：5分钟内发现任何异常！
