# DIAP 智能合约架构

## 架构概述

DIAP协议采用模块化架构，将原来的单体合约拆分为5个独立的智能合约，每个合约专注于特定功能领域。

## 合约列表

### 1. DIAPToken.sol
**功能**: ERC20代币合约
- 代币发行和管理
- 转账和授权
- 代币经济模型

### 2. DIAPAgentNetwork.sol
**功能**: 智能体网络管理
- 智能体注册和注销
- 能力声明和验证
- 网络拓扑管理
- 注册费管理

### 3. DIAPPaymentCore.sol
**功能**: 核心支付功能
- 基础点对点支付
- 服务托管支付（Escrow）
- 支付确认和取消
- 支付费用管理

**主要功能**:
- `createPayment()` - 创建支付
- `confirmPayment()` - 确认支付
- `createServiceOrder()` - 创建服务订单
- `completeServiceOrder()` - 完成服务订单

### 4. DIAPPaymentChannel.sol
**功能**: 支付通道（状态通道）
- 链下支付通道
- EIP-712签名验证
- 挑战期机制
- 通道结算

**主要功能**:
- `openPaymentChannel()` - 开启支付通道
- `initiateChannelClose()` - 发起通道关闭
- `challengeChannelClose()` - 挑战通道状态
- `finalizeChannelClose()` - 最终化通道关闭

### 5. DIAPPaymentPrivacy.sol
**功能**: 隐私支付
- 基于承诺的资金锁定
- ZKP验证（占位符）
- 隐私支付执行
- 超时退款机制

**主要功能**:
- `lockFundsForPrivacy()` - 锁定资金
- `executePrivacyPayment()` - 执行隐私支付
- `withdrawLockedFunds()` - 提取锁定资金
- `refundExpiredCommitment()` - 退款过期承诺

### 6. DIAPGovernance.sol
**功能**: 治理和投票
- 提案创建和投票
- 投票权重计算（防溢出）
- 提案执行
- 治理参数管理

## 架构优势

### 1. 模块化设计
- 每个合约职责单一，易于理解和维护
- 可以独立升级和优化
- 降低合约复杂度

### 2. 合约大小优化
- 原 DIAPPayment 合约: 29,124 bytes（超限）
- 拆分后每个合约: < 24,576 bytes（符合限制）
- 成功解决部署限制问题

### 3. 安全性提升
- 独立的安全边界
- 降低单点故障风险
- 更容易进行安全审计

### 4. 灵活性增强
- 可以选择性部署需要的模块
- 支持渐进式功能发布
- 便于集成和扩展

## 部署顺序

建议按以下顺序部署合约：

1. **DIAPToken** - 代币合约（基础设施）
2. **DIAPAgentNetwork** - 智能体网络（依赖Token）
3. **DIAPPaymentCore** - 核心支付（依赖Token和Network）
4. **DIAPPaymentChannel** - 支付通道（依赖Token和Network）
5. **DIAPPaymentPrivacy** - 隐私支付（依赖Token）
6. **DIAPGovernance** - 治理合约（依赖Token）

## 合约交互

```
DIAPToken
    ↓
DIAPAgentNetwork ← DIAPPaymentCore
    ↓                   ↓
DIAPPaymentChannel  DIAPPaymentPrivacy
    ↓
DIAPGovernance
```

## 升级策略

所有合约都实现了UUPS升级模式：
- 支持合约逻辑升级
- 保持状态数据不变
- 仅owner可以授权升级

## 安全特性

### 已修复的漏洞
1. ✅ 注册费提取机制
2. ✅ 服务托管支付保护
3. ✅ EIP-712签名验证
4. ✅ 隐私支付权限控制
5. ✅ 投票权重溢出防护

### 安全机制
- ReentrancyGuard - 防重入攻击
- Pausable - 紧急暂停
- Ownable - 权限管理
- 超时保护 - 防止资金永久锁定

## 测试建议

每个合约应该有独立的测试套件：
- 单元测试：测试单个函数
- 集成测试：测试合约间交互
- 安全测试：测试攻击场景
- Gas优化测试：测试Gas消耗

## 未来优化方向

1. **Gas优化**: 进一步优化存储和计算
2. **跨链支持**: 集成跨链桥接协议
3. **ZKP集成**: 完善隐私支付的零知识证明
4. **Layer2**: 考虑Layer2扩展方案
