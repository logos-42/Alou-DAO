# 部署后检查清单

> ⚠️ 部署后必须立即完成的关键任务

## 🔴 立即执行（部署后 1 小时内）

### 1. 验证部署 ✅

```bash
# 检查所有合约是否部署成功
npx hardhat run scripts/monitoring/health_check.js --network sepolia
```

**检查项**:
- [ ] 所有合约地址已记录
- [ ] 合约在 Etherscan 上可见
- [ ] 初始供应量正确 (1亿 DIAP)
- [ ] 奖励池余额正确 (800万 DIAP)

---

### 2. 转移代币到多签 🔴 **最高优先级**

```bash
# 1. 确认 Gnosis Safe 已创建
echo $GNOSIS_SAFE_ADDRESS

# 2. 执行转移
npx hardhat run scripts/post_deploy/transfer_to_multisig.js --network sepolia

# 3. 验证
# 在 Etherscan 上检查 Safe 地址余额应该是 92,000,000 DIAP
```

**转移清单**:
- [ ] 社区份额 (4000万) → Safe
- [ ] 国库份额 (2200万) → Safe  
- [ ] 开发者份额 (1500万) → Safe
- [ ] 投资人份额 (1500万) → Safe
- [ ] 奖励池 (800万) → 保留在合约 ✅

**验证**:
- [ ] Safe 余额 = 92,000,000 DIAP
- [ ] 合约余额 = 8,000,000 DIAP
- [ ] 部署者余额 ≈ 0 DIAP

---

### 3. 转移合约所有权 🔴 **最高优先级**

```bash
# 转移所有合约所有权到 Safe
npx hardhat run scripts/post_deploy/transfer_ownership.js --network sepolia
```

**所有权转移清单**:
- [ ] DIAPToken → Safe
- [ ] DIAPAgentNetwork → Safe
- [ ] DIAPPaymentCore → Safe
- [ ] DIAPPaymentChannel → Safe
- [ ] DIAPGovernance → Safe
- [ ] DIAPVerification → Safe

**验证**:
```bash
# 在 Etherscan 上检查每个合约的 owner() 函数
# 应该返回 Safe 地址
```

---

### 4. 更新配置文件

```bash
# 更新 emergency/contract_addresses.txt
# 填写所有合约地址和交易哈希
```

**更新清单**:
- [ ] `emergency/contract_addresses.txt` - 所有地址
- [ ] `emergency/emergency_contacts.txt` - 联系人
- [ ] `.env` - 所有环境变量
- [ ] README.md - 部署信息

---

### 5. 配置监控

```bash
# 1. 设置 Tenderly
# 访问 https://dashboard.tenderly.co
# 添加所有合约地址

# 2. 测试 Telegram Bot
node scripts/monitoring/telegram_alert.js

# 3. 运行首次健康检查
npm run health
```

**监控清单**:
- [ ] Tenderly 已添加所有合约
- [ ] Telegram Bot 工作正常
- [ ] 健康检查脚本运行成功
- [ ] 告警规则已设置

---

## 🟡 24小时内完成

### 6. 在 Etherscan 上验证合约

```bash
# 验证所有合约源代码
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

**验证清单**:
- [ ] DIAPToken
- [ ] DIAPAgentNetwork
- [ ] DIAPPaymentCore
- [ ] DIAPPaymentChannel
- [ ] DIAPGovernance
- [ ] DIAPVerification

---

### 7. 测试多签操作

```bash
# 在 Gnosis Safe UI 中测试
# https://app.safe.global
```

**测试清单**:
- [ ] 创建测试交易
- [ ] 多个所有者签名
- [ ] 执行交易
- [ ] 测试紧急暂停（在测试网）

---

### 8. 设置自动化监控

```bash
# 配置 GitHub Actions
# 见 .github/workflows/health_check.yml
```

**自动化清单**:
- [ ] GitHub Actions 配置
- [ ] 定时健康检查 (每5分钟)
- [ ] 告警通知到 Telegram
- [ ] 日志记录

---

### 9. 准备通信

**社区通信**:
- [ ] 准备部署公告
- [ ] 创建 Discord/Telegram 群组
- [ ] 发布合约地址
- [ ] 说明如何使用

**文档更新**:
- [ ] 更新 README
- [ ] 创建用户指南
- [ ] 准备 FAQ
- [ ] 记录已知问题

---

## 🟢 一周内完成

### 10. 安全措施

**备份**:
- [ ] 备份所有私钥（多个位置）
- [ ] 备份助记词（纸质+金属板）
- [ ] 备份合约地址列表
- [ ] 备份部署记录

**测试**:
- [ ] 测试紧急暂停流程
- [ ] 测试紧急恢复流程
- [ ] 测试多签操作
- [ ] 进行灾难恢复演练

---

### 11. 社区建设

**启动社区**:
- [ ] 发布公告
- [ ] 邀请早期用户
- [ ] 收集反馈
- [ ] 建立支持渠道

**监控指标**:
- [ ] 用户数量
- [ ] 交易量
- [ ] 质押率
- [ ] Gas 消耗

---

### 12. 优化和改进

**数据收集**:
- [ ] 用户行为分析
- [ ] Gas 使用分析
- [ ] 错误日志分析
- [ ] 性能监控

**优化计划**:
- [ ] 识别优化机会
- [ ] 准备升级方案
- [ ] 测试优化效果
- [ ] 部署优化

---

## 📋 验证脚本

创建一个验证脚本来检查所有项目：

```javascript
// scripts/post_deploy/verify_deployment.js
async function main() {
    console.log("🔍 验证部署...\n");
    
    const checks = [];
    
    // 1. 检查合约部署
    console.log("1️⃣ 检查合约部署...");
    // ... 检查逻辑
    
    // 2. 检查代币分配
    console.log("2️⃣ 检查代币分配...");
    // ... 检查逻辑
    
    // 3. 检查所有权
    console.log("3️⃣ 检查所有权...");
    // ... 检查逻辑
    
    // 4. 检查监控
    console.log("4️⃣ 检查监控...");
    // ... 检查逻辑
    
    // 生成报告
    console.log("\n" + "=".repeat(60));
    console.log("验证报告");
    console.log("=".repeat(60));
    
    const passed = checks.filter(c => c.status === "passed").length;
    const failed = checks.filter(c => c.status === "failed").length;
    
    console.log(`\n✅ 通过: ${passed}/${checks.length}`);
    console.log(`❌ 失败: ${failed}/${checks.length}`);
    
    if (failed === 0) {
        console.log("\n🎉 所有检查通过！部署成功！");
    } else {
        console.log("\n⚠️  有检查项未通过，请修复后再继续");
    }
}
```

---

## ⚠️ 常见问题

### Q: 如果转移代币时 Gas 不足怎么办？

A: 
```bash
# 1. 检查账户余额
# 2. 分批转移
# 3. 在 Gas 价格低时操作
```

### Q: 如果多签操作失败怎么办？

A:
```bash
# 1. 检查所有者地址
# 2. 确认阈值设置
# 3. 重新创建交易
# 4. 联系 Gnosis Safe 支持
```

### Q: 如果发现问题需要回滚怎么办？

A:
```bash
# 1. 立即暂停合约
npm run pause -- --network sepolia

# 2. 评估问题严重性
# 3. 准备修复方案
# 4. 通知用户
```

---

## 📞 紧急联系

如果遇到问题：

1. **查看文档**: `docs/OPERATIONS_GUIDE.md`
2. **运行诊断**: `npm run health`
3. **查看日志**: `logs/`
4. **联系支持**: 见 `emergency/emergency_contacts.txt`

---

## ✅ 完成确认

部署完成后，请确认：

- [ ] 所有代币已转移到多签
- [ ] 所有合约所有权已转移
- [ ] 监控系统正常运行
- [ ] 文档已更新
- [ ] 团队已通知
- [ ] 社区已通知
- [ ] 备份已完成

**签名**: _______________  
**日期**: _______________  
**网络**: Sepolia / Mainnet

---

**记住**: 安全第一，不要着急。每一步都要仔细验证。

🎯 目标：零事故部署！
