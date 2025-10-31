# IPNS功能测试指南

## 测试文件

- `DIAPNetwork_IPNS.test.js` - Hardhat JavaScript测试（推荐）
- `DIAPNetwork_IPNS_test.sol` - Solidity测试（Remix兼容）

## 运行测试

### 使用Hardhat（推荐）

```bash
# 运行所有IPNS测试
npx hardhat test tests/DIAPNetwork_IPNS.test.js

# 运行特定测试套件
npx hardhat test tests/DIAPNetwork_IPNS.test.js --grep "标识符格式验证"

# 显示Gas报告
REPORT_GAS=true npx hardhat test tests/DIAPNetwork_IPNS.test.js
```

### 使用Remix

1. 打开 Remix IDE (https://remix.ethereum.org/)
2. 上传 `DIAPNetwork_IPNS_test.sol`
3. 编译合约
4. 在 "Solidity Unit Testing" 插件中运行测试

## 测试覆盖

### 1. 标识符格式验证
- ✅ 有效的IPNS名称（k开头，50-65字符）
- ✅ 有效的CIDv0格式（Qm开头，46字符）
- ✅ 有效的CIDv1格式（bafy开头，59字符）
- ✅ 拒绝无效格式
- ✅ 拒绝过短标识符（<10字符）
- ✅ 拒绝过长标识符（>100字符）

### 2. 标识符类型识别
- ✅ 正确识别IPNS名称
- ✅ 正确识别IPFS CID
- ✅ getAgentIdentifierType函数测试

### 3. 向后兼容性
- ✅ IPNS和CID智能体互相发送消息
- ✅ didToAgent映射正确工作（IPNS）
- ✅ didToAgent映射正确工作（CID）
- ✅ 混合场景测试

### 4. 事件发射
- ✅ IPNS注册发射AgentRegisteredWithIPNS事件
- ✅ CID注册不发射IPNS特定事件
- ✅ 所有注册都发射AgentRegistered事件

### 5. Gas成本
- ✅ IPNS注册Gas消耗测试
- ✅ CID注册Gas消耗对比
- ✅ 验证Gas增幅在可接受范围内

## 测试数据

### IPNS名称示例
```
k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8
```

### IPFS CIDv0示例
```
QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG
```

### IPFS CIDv1示例
```
bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi
```

## 预期结果

所有测试应该通过，并且：
- IPNS注册Gas消耗 < 300,000
- CID注册Gas消耗 < 300,000
- Gas增幅 < 10%

## 故障排查

### 测试失败：Invalid identifier format
- 检查标识符格式是否正确
- 确认长度在10-100字符之间
- 验证前缀（k/Qm/bafy）

### 测试失败：Agent already registered
- 清理测试环境
- 使用不同的测试账户

### Gas消耗过高
- 检查是否有不必要的存储操作
- 验证标识符验证逻辑是否优化

## 下一步

测试通过后，可以：
1. 部署到测试网
2. 进行集成测试
3. 准备主网升级
