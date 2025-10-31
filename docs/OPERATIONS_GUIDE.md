# DIAP 运营指南

> 独立开发者的实用操作手册

## 📋 目录

1. [快速开始](#快速开始)
2. [部署前准备](#部署前准备)
3. [监控和告警](#监控和告警)
4. [紧急响应](#紧急响应)
5. [日常运维](#日常运维)
6. [故障排查](#故障排查)

---

## 🚀 快速开始

### 1. 环境配置

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 编辑 .env 文件，填写你的配置
# - PRIVATE_KEY: 你的钱包私钥
# - ETHERSCAN_API_KEY: Etherscan API 密钥
# - TELEGRAM_BOT_TOKEN: Telegram Bot Token（可选）
# - TELEGRAM_CHAT_ID: Telegram Chat ID（可选）

# 3. 安装依赖
npm install
```

### 2. 设置 Telegram 告警（可选但强烈推荐）

```bash
# 1. 在 Telegram 中创建 Bot
#    - 找 @BotFather
#    - 发送 /newbot
#    - 按提示创建，获得 BOT_TOKEN

# 2. 获取你的 Chat ID
#    - 给你的 Bot 发送一条消息
#    - 访问: https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
#    - 找到 "chat":{"id": 你的CHAT_ID}

# 3. 在 .env 中填写
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=123456789
```

---

## 📝 部署前准备

### 运行部署前检查

```bash
# 运行完整的部署前检查
npx hardhat run scripts/deployment/pre_deploy_checklist.js

# 检查项包括：
# ✅ 环境配置
# ✅ 代码编译
# ✅ 测试通过
# ✅ 安全检查
# ✅ 文档完整
# ✅ 脚本就绪
# ✅ 账户余额
```

### 部署到测试网

```bash
# Sepolia 测试网
npx hardhat run scripts/deploy_diap_full.js --network sepolia

# 部署后记得：
# 1. 保存合约地址到 .env
# 2. 在 Etherscan 上验证合约
# 3. 运行健康检查确认部署成功
```

---

## 📊 监控和告警

### 1. 手动健康检查

```bash
# 运行一次健康检查
npx hardhat run scripts/monitoring/health_check.js --network sepolia

# 检查内容：
# - 合约状态（是否暂停）
# - 余额和质押量
# - 最近的大额转账
# - Gas 价格
# - 异常事件
```

### 2. 自动化监控（推荐）

#### 方案 A: 使用 cron（Linux/Mac）

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每 5 分钟运行一次）
*/5 * * * * cd /path/to/your/project && npx hardhat run scripts/monitoring/health_check.js --network sepolia >> logs/cron.log 2>&1
```

#### 方案 B: 使用 GitHub Actions（推荐）

创建 `.github/workflows/health_check.yml`:

```yaml
name: Health Check

on:
  schedule:
    - cron: '*/5 * * * *'  # 每 5 分钟
  workflow_dispatch:  # 允许手动触发

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npx hardhat run scripts/monitoring/health_check.js --network sepolia
        env:
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
          DIAP_TOKEN_ADDRESS: ${{ secrets.DIAP_TOKEN_ADDRESS }}
          DIAP_NETWORK_ADDRESS: ${{ secrets.DIAP_NETWORK_ADDRESS }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
```

#### 方案 C: 使用 Tenderly（最简单）

1. 注册 Tenderly 账号（免费）
2. 添加你的合约
3. 设置告警规则：
   - 大额转账
   - 合约暂停
   - 余额变化
4. 配置通知到 Telegram/Email

### 3. 测试告警系统

```bash
# 测试 Telegram 通知
node scripts/monitoring/telegram_alert.js

# 应该收到测试消息
```

---

## 🚨 紧急响应

### 发现问题时的操作流程

#### 1. 立即暂停合约（如果是严重问题）

```bash
# 暂停所有合约
npx hardhat run scripts/emergency/pause_all.js --network sepolia

# 这会：
# ✅ 暂停所有新操作
# ✅ 允许用户提取资金
# ✅ 记录操作日志
# ✅ 发送 Telegram 通知（如果配置）
```

#### 2. 分析问题

```bash
# 运行健康检查，查看详细状态
npx hardhat run scripts/monitoring/health_check.js --network sepolia

# 查看最近的交易
# 在 Etherscan 上查看合约交互
```

#### 3. 修复问题

```bash
# 根据问题类型：
# - 如果是代码问题：准备升级合约
# - 如果是配置问题：调整参数
# - 如果是攻击：联系安全专家
```

#### 4. 恢复服务

```bash
# 确认问题已解决后，恢复合约
npx hardhat run scripts/emergency/unpause_all.js --network sepolia

# 恢复后：
# ✅ 密切监控 24 小时
# ✅ 发布事故报告
# ✅ 通知用户
```

### 紧急联系人

```
你自己: [你的电话]
技术顾问: [如果有]
审计公司: [如果有]
律师: [如果有]

紧急资源:
- Etherscan: https://sepolia.etherscan.io
- Tenderly: https://dashboard.tenderly.co
- Discord: [你的社区]
```

---

## 🔧 日常运维

### 每天

```bash
# 1. 查看健康检查日志
cat logs/health/health_*.json | tail -1

# 2. 检查 Telegram 通知
# 3. 查看 Etherscan 上的交易
# 4. 检查社区反馈
```

### 每周

```bash
# 1. 运行完整测试
npm test

# 2. 检查合约余额
npx hardhat run scripts/monitoring/health_check.js --network sepolia

# 3. 备份重要数据
# 4. 更新文档
```

### 每月

```bash
# 1. 审查安全日志
# 2. 更新依赖
npm audit
npm update

# 3. 检查 Gas 优化机会
# 4. 社区反馈总结
```

---

## 🔍 故障排查

### 问题：健康检查失败

```bash
# 1. 检查网络连接
curl https://sepolia.infura.io/v3/YOUR_KEY

# 2. 检查合约地址是否正确
echo $DIAP_TOKEN_ADDRESS

# 3. 检查账户余额
npx hardhat run scripts/check_balance.js --network sepolia

# 4. 查看详细错误
npx hardhat run scripts/monitoring/health_check.js --network sepolia --verbose
```

### 问题：Telegram 通知不工作

```bash
# 1. 测试 Bot Token
curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe

# 2. 测试发送消息
node scripts/monitoring/telegram_alert.js

# 3. 检查 Chat ID
# 给 Bot 发消息，然后访问：
# https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
```

### 问题：合约交互失败

```bash
# 1. 检查 Gas 价格
npx hardhat run scripts/check_gas.js --network sepolia

# 2. 检查账户余额
# 3. 检查合约是否暂停
# 4. 查看 Etherscan 上的错误信息
```

---

## 📱 移动端监控

### 使用 Telegram Bot 命令

创建一个简单的 Bot 命令系统：

```javascript
// 在 Telegram Bot 中添加命令
/status - 查看系统状态
/balance - 查看合约余额
/pause - 紧急暂停（需要确认）
/health - 运行健康检查
```

### 使用 Etherscan App

1. 下载 Etherscan App
2. 添加你的合约地址到监控列表
3. 开启推送通知

---

## 🎯 最佳实践

### 1. 安全第一

- ✅ 永远不要提交私钥到 Git
- ✅ 使用硬件钱包存储大额资金
- ✅ 定期备份私钥（多个安全位置）
- ✅ 使用多签钱包（即使是你自己的多个钱包）

### 2. 监控和告警

- ✅ 设置自动化健康检查
- ✅ 配置 Telegram 告警
- ✅ 定期查看日志
- ✅ 关注社区反馈

### 3. 文档和记录

- ✅ 记录所有重要操作
- ✅ 保存部署地址和交易哈希
- ✅ 维护操作日志
- ✅ 更新文档

### 4. 社区沟通

- ✅ 及时回应用户问题
- ✅ 定期发布更新
- ✅ 透明地沟通问题
- ✅ 建立信任

---

## 📞 获取帮助

### 社区资源

- Discord: [你的 Discord]
- Telegram: [你的 Telegram]
- Twitter: [你的 Twitter]
- GitHub: [你的 GitHub]

### 技术支持

- Hardhat 文档: https://hardhat.org/docs
- OpenZeppelin 文档: https://docs.openzeppelin.com
- Etherscan: https://etherscan.io
- Tenderly: https://tenderly.co

### 紧急情况

如果遇到严重安全问题：
1. 立即暂停合约
2. 联系审计公司
3. 通知用户
4. 寻求社区帮助

---

## 🔄 更新日志

### v1.0.0 (2024-10-31)
- ✅ 初始版本
- ✅ 紧急暂停脚本
- ✅ 健康检查脚本
- ✅ Telegram 告警
- ✅ 部署前检查

---

**记住**: 作为独立开发者，你不需要做到完美，但需要做到负责任。诚实、透明、持续改进是关键。

祝你好运！🚀
