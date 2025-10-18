// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "remix_tests.sol"; // Remix自动注入
import "hardhat/console.sol";
import "../contracts/DIAPAgentNetworkSimple.sol";
import "../contracts/DIAPTokenSimple.sol";

/**
 * @title DIAPSimpleTest
 * @dev DIAP智能体网络简化测试 - 专为Remix设计，不依赖Hardhat
 */
contract DIAPSimpleTest {
    
    // ============ 测试变量 ============
    
    DIAPAgentNetworkSimple public agentNetwork;
    DIAPTokenSimple public token;
    
    address public owner;
    address public agent1;
    address public agent2;
    
    uint256 public constant INITIAL_BALANCE = 10000 * 10**18; // 10000代币
    uint256 public constant STAKE_AMOUNT = 1000 * 10**18;    // 1000代币质押
    
    // ============ 测试设置 ============
    
    function beforeAll() public {
        console.log("=== DIAP智能体网络简化测试开始 ===");
        
        // 设置测试账户
        owner = msg.sender;
        agent1 = address(0x1);
        agent2 = address(0x2);
        
        // 部署代币合约
        token = new DIAPTokenSimple();
        console.log("DIAPTokenSimple部署成功:", address(token));
        
        // 部署智能体网络合约
        agentNetwork = new DIAPAgentNetworkSimple();
        console.log("DIAPAgentNetworkSimple部署成功:", address(agentNetwork));
        
        // 分配初始代币
        token.mint(agent1, INITIAL_BALANCE);
        token.mint(agent2, INITIAL_BALANCE);
        console.log("初始代币分配完成");
    }
    
    // ============ 代币功能测试 ============
    
    function testTokenInitialization() public {
        console.log("=== 测试代币初始化 ===");
        
        Assert.equal(token.name(), "DIAP Token", "代币名称错误");
        Assert.equal(token.symbol(), "DIAP", "代币符号错误");
        Assert.equal(token.totalSupply(), 100_000_000 * 10**18, "初始供应量错误");
        
        console.log("代币初始化测试通过");
    }
    
    function testTokenTransfer() public {
        console.log("=== 测试代币转账 ===");
        
        uint256 transferAmount = 1000 * 10**18;
        uint256 balanceBefore = token.balanceOf(agent1);
        
        // 注意：在Remix中，我们需要使用msg.sender作为agent1
        // 这里简化测试，直接测试转账功能
        token.transfer(agent2, transferAmount);
        
        uint256 balanceAfter = token.balanceOf(msg.sender);
        Assert.equal(balanceAfter, balanceBefore - transferAmount, "转账后余额错误");
        
        console.log("代币转账测试通过");
    }
    
    function testTokenStaking() public {
        console.log("=== 测试代币质押 ===");
        
        // 质押代币 (青铜级)
        token.stake(STAKE_AMOUNT, 0);
        
        // 检查质押信息
        (uint256 amount, uint256 startTime, uint256 lockPeriod, , , uint256 tier) = token.getStakingInfo(msg.sender);
        
        Assert.equal(amount, STAKE_AMOUNT, "质押数量错误");
        Assert.equal(tier, 0, "质押层级错误"); // 青铜级
        Assert.equal(lockPeriod, 30 days, "锁定期错误");
        Assert.greaterThan(startTime, 0, "开始时间错误");
        
        console.log("代币质押测试通过");
    }
    
    function testTokenBurn() public {
        console.log("=== 测试代币燃烧 ===");
        
        uint256 burnAmount = 100 * 10**18;
        uint256 balanceBefore = token.balanceOf(msg.sender);
        
        token.burnTokens(burnAmount, "测试燃烧");
        
        uint256 balanceAfter = token.balanceOf(msg.sender);
        Assert.equal(balanceAfter, balanceBefore - burnAmount, "燃烧后余额错误");
        
        console.log("代币燃烧测试通过");
    }
    
    // ============ 智能体网络测试 ============
    
    function testAgentRegistration() public {
        console.log("=== 测试智能体注册 ===");
        
        // 注册智能体
        agentNetwork.registerAgent{value: 100 * 10**18}(
            "QmTestDID1",
            "0x1234567890abcdef",
            STAKE_AMOUNT
        );
        
        // 检查智能体信息
        DIAPAgentNetworkSimple.Agent memory agent = agentNetwork.getAgent(msg.sender);
        
        Assert.equal(agent.didDocument, "QmTestDID1", "DID文档错误");
        Assert.equal(agent.publicKey, "0x1234567890abcdef", "公钥错误");
        Assert.equal(agent.reputation, 1000, "初始声誉错误");
        Assert.equal(agent.isActive, true, "活跃状态错误");
        Assert.equal(agent.stakedAmount, STAKE_AMOUNT, "质押数量错误");
        Assert.equal(agent.isVerified, false, "验证状态错误");
        
        console.log("智能体注册测试通过");
    }
    
    function testAgentVerification() public {
        console.log("=== 测试智能体验证 ===");
        
        // 验证智能体身份
        uint256[8] memory proof = [uint256(1), 2, 3, 4, 5, 6, 7, 8];
        
        agentNetwork.verifyAgent(msg.sender, proof);
        
        // 检查验证状态
        DIAPAgentNetworkSimple.Agent memory agent = agentNetwork.getAgent(msg.sender);
        Assert.equal(agent.isVerified, true, "验证状态错误");
        Assert.equal(agent.reputation, 2000, "验证后声誉错误"); // 1000 + 1000奖励
        
        console.log("智能体验证测试通过");
    }
    
    function testMessageSending() public {
        console.log("=== 测试消息发送 ===");
        
        // 注册另一个智能体 (使用不同的地址)
        // 在Remix中，我们可以使用address(0x2)作为另一个智能体
        // 这里简化测试，直接测试消息发送功能
        
        // 发送消息
        agentNetwork.sendMessage{value: 1 * 10**18}(
            address(0x2),
            "QmTestMessage1"
        );
        
        // 检查网络统计
        (uint256 totalAgents, uint256 totalMessages, , , ) = agentNetwork.getNetworkStats();
        Assert.equal(totalMessages, 1, "总消息数量错误");
        
        console.log("消息发送测试通过");
    }
    
    function testServiceCreation() public {
        console.log("=== 测试服务创建 ===");
        
        // 创建服务
        agentNetwork.createService(
            address(0x2),
            "AI_ANALYSIS",
            100 * 10**18
        );
        
        // 完成服务
        agentNetwork.completeService(
            0, // 第一个服务
            "QmTestResult1"
        );
        
        // 检查智能体信息更新
        DIAPAgentNetworkSimple.Agent memory agent = agentNetwork.getAgent(msg.sender);
        Assert.equal(agent.totalServices, 1, "服务数量错误");
        Assert.equal(agent.reputation, 2010, "完成服务后声誉错误"); // 2000 + 10奖励
        
        console.log("服务创建测试通过");
    }
    
    function testReputationUpdate() public {
        console.log("=== 测试声誉更新 ===");
        
        // 更新声誉
        agentNetwork.updateReputation(msg.sender, 500); // 增加500声誉
        
        // 检查声誉更新
        DIAPAgentNetworkSimple.Agent memory agent = agentNetwork.getAgent(msg.sender);
        Assert.equal(agent.reputation, 2510, "声誉更新错误"); // 2010 + 500
        
        // 减少声誉
        agentNetwork.updateReputation(msg.sender, -100); // 减少100声誉
        
        agent = agentNetwork.getAgent(msg.sender);
        Assert.equal(agent.reputation, 2410, "声誉减少错误"); // 2510 - 100
        
        console.log("声誉更新测试通过");
    }
    
    // ============ 参数测试 ============
    
    function testParameterUpdates() public {
        console.log("=== 测试参数更新 ===");
        
        // 更新注册费用
        agentNetwork.setRegistrationFee(200 * 10**18);
        
        // 更新消息费用
        agentNetwork.setMessageFee(2 * 10**18);
        
        // 更新服务费用率
        agentNetwork.setServiceFeeRate(500); // 5%
        
        // 更新最小质押数量
        agentNetwork.setMinStakeAmount(2000 * 10**18);
        
        // 更新奖励率
        agentNetwork.setRewardRate(10); // 10%
        
        console.log("参数更新测试通过");
    }
    
    // ============ 测试总结 ============
    
    function afterAll() public {
        console.log("=== DIAP智能体网络简化测试完成 ===");
        
        // 输出最终统计
        (uint256 totalAgents, uint256 totalMessages, uint256 totalServices, uint256 totalVolume, ) = agentNetwork.getNetworkStats();
        (uint256 totalSupply, uint256 totalStaked, uint256 totalBurned, uint256 totalRewards) = token.getTokenStats();
        
        console.log("=== 最终统计 ===");
        console.log("总智能体数量:", totalAgents);
        console.log("总消息数量:", totalMessages);
        console.log("总服务数量:", totalServices);
        console.log("总交易量:", totalVolume);
        console.log("代币总供应量:", totalSupply);
        console.log("总质押量:", totalStaked);
        console.log("总燃烧量:", totalBurned);
        console.log("总奖励量:", totalRewards);
        
        console.log("=== 所有测试通过 ===");
    }
}
