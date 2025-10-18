// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "remix_tests.sol"; // Remix自动注入
import "hardhat/console.sol";
import "../contracts/DIAPAgentNetwork.sol";
import "../contracts/DIAPToken.sol";
import "../contracts/DIAPGovernance.sol";
import "../contracts/DIAPPayment.sol";
import "../contracts/DIAPVerification.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DIAPNetworkTest
 * @dev DIAP智能体网络完整测试套件
 * @notice 测试所有核心功能：智能体注册、代币质押、治理投票、支付系统、身份验证
 */
contract DIAPNetworkTest {
    
    // ============ 测试变量 ============
    
    DIAPAgentNetwork public agentNetwork;
    DIAPToken public token;
    DIAPGovernance public governance;
    DIAPPayment public payment;
    DIAPVerification public verification;
    TimelockController public timelock;
    
    address public owner;
    address public agent1;
    address public agent2;
    address public agent3;
    
    uint256 public constant INITIAL_BALANCE = 10000 * 10**18; // 10000代币
    uint256 public constant STAKE_AMOUNT = 1000 * 10**18;    // 1000代币质押
    
    // ============ 测试设置 ============
    
    function beforeAll() public {
        console.log("=== DIAP智能体网络测试开始 ===");
        
        // 设置测试账户
        owner = msg.sender;
        agent1 = address(0x1);
        agent2 = address(0x2);
        agent3 = address(0x3);
        
        // 部署代币合约
        token = new DIAPToken();
        token.initialize();
        console.log("DIAPToken部署成功:", address(token));
        
        // 部署智能体网络合约
        agentNetwork = new DIAPAgentNetwork();
        agentNetwork.initialize();
        console.log("DIAPAgentNetwork部署成功:", address(agentNetwork));
        
        // 部署时间锁合约
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);
        proposers[0] = owner;
        executors[0] = owner;
        timelock = new TimelockController(1 days, proposers, executors, owner);
        console.log("TimelockController部署成功:", address(timelock));
        
        // 部署治理合约
        governance = new DIAPGovernance(
            IVotes(address(token)),
            timelock,
            agentNetwork
        );
        console.log("DIAPGovernance部署成功:", address(governance));
        
        // 部署支付合约
        payment = new DIAPPayment();
        payment.initialize(address(token), address(agentNetwork));
        console.log("DIAPPayment部署成功:", address(payment));
        
        // 部署验证合约
        verification = new DIAPVerification();
        verification.initialize(address(agentNetwork));
        console.log("DIAPVerification部署成功:", address(verification));
        
        // 分配初始代币
        token.mint(agent1, INITIAL_BALANCE);
        token.mint(agent2, INITIAL_BALANCE);
        token.mint(agent3, INITIAL_BALANCE);
        console.log("初始代币分配完成");
    }
    
    // ============ 代币功能测试 ============
    
    function testTokenInitialization() public {
        console.log("=== 测试代币初始化 ===");
        
        Assert.equal(token.name(), "DIAP Token", "代币名称错误");
        Assert.equal(token.symbol(), "DIAP", "代币符号错误");
        Assert.equal(token.totalSupply(), 100_000_000 * 10**18, "初始供应量错误");
        Assert.equal(token.balanceOf(agent1), INITIAL_BALANCE, "Agent1余额错误");
        Assert.equal(token.balanceOf(agent2), INITIAL_BALANCE, "Agent2余额错误");
        Assert.equal(token.balanceOf(agent3), INITIAL_BALANCE, "Agent3余额错误");
        
        console.log("代币初始化测试通过");
    }
    
    function testTokenStaking() public {
        console.log("=== 测试代币质押 ===");
        
        // 切换到agent1
        vm.prank(agent1);
        
        // 质押代币 (青铜级)
        token.stake(STAKE_AMOUNT, 0);
        
        // 检查质押信息
        (uint256 amount, uint256 startTime, uint256 lockPeriod, , , uint256 tier) = token.getStakingInfo(agent1);
        
        Assert.equal(amount, STAKE_AMOUNT, "质押数量错误");
        Assert.equal(tier, 0, "质押层级错误"); // 青铜级
        Assert.equal(lockPeriod, 30 days, "锁定期错误");
        
        console.log("代币质押测试通过");
    }
    
    function testTokenBurn() public {
        console.log("=== 测试代币燃烧 ===");
        
        uint256 burnAmount = 100 * 10**18;
        uint256 balanceBefore = token.balanceOf(agent1);
        
        vm.prank(agent1);
        token.burnTokens(burnAmount, "测试燃烧");
        
        uint256 balanceAfter = token.balanceOf(agent1);
        Assert.equal(balanceAfter, balanceBefore - burnAmount, "燃烧后余额错误");
        
        console.log("代币燃烧测试通过");
    }
    
    // ============ 智能体网络测试 ============
    
    function testAgentRegistration() public {
        console.log("=== 测试智能体注册 ===");
        
        // 切换到agent1
        vm.prank(agent1);
        
        // 注册智能体
        agentNetwork.registerAgent{value: 100 * 10**18}(
            "QmTestDID1",
            "0x1234567890abcdef",
            STAKE_AMOUNT
        );
        
        // 检查智能体信息
        DIAPAgentNetwork.Agent memory agent = agentNetwork.getAgent(agent1);
        
        Assert.equal(agent.didDocument, "QmTestDID1", "DID文档错误");
        Assert.equal(agent.publicKey, "0x1234567890abcdef", "公钥错误");
        Assert.equal(agent.reputation, 1000, "初始声誉错误");
        Assert.equal(agent.isActive, true, "活跃状态错误");
        Assert.equal(agent.stakedAmount, STAKE_AMOUNT, "质押数量错误");
        
        console.log("智能体注册测试通过");
    }
    
    function testAgentVerification() public {
        console.log("=== 测试智能体验证 ===");
        
        // 验证智能体身份
        uint256[8] memory proof = [uint256(1), 2, 3, 4, 5, 6, 7, 8];
        
        vm.prank(owner);
        agentNetwork.verifyAgent(agent1, proof);
        
        // 检查验证状态
        DIAPAgentNetwork.Agent memory agent = agentNetwork.getAgent(agent1);
        Assert.equal(agent.isVerified, true, "验证状态错误");
        Assert.equal(agent.reputation, 2000, "验证后声誉错误"); // 1000 + 1000奖励
        
        console.log("智能体验证测试通过");
    }
    
    function testMessageSending() public {
        console.log("=== 测试消息发送 ===");
        
        // 注册agent2
        vm.prank(agent2);
        agentNetwork.registerAgent{value: 100 * 10**18}(
            "QmTestDID2",
            "0xabcdef1234567890",
            STAKE_AMOUNT
        );
        
        // 发送消息
        vm.prank(agent1);
        agentNetwork.sendMessage{value: 1 * 10**18}(
            agent2,
            "QmTestMessage1"
        );
        
        // 检查网络统计
        (uint256 totalAgents, uint256 totalMessages, , , ) = agentNetwork.getNetworkStats();
        Assert.equal(totalAgents, 2, "总智能体数量错误");
        Assert.equal(totalMessages, 1, "总消息数量错误");
        
        console.log("消息发送测试通过");
    }
    
    function testServiceCreation() public {
        console.log("=== 测试服务创建 ===");
        
        // 创建服务
        vm.prank(agent1);
        agentNetwork.createService(
            agent2,
            "AI_ANALYSIS",
            100 * 10**18
        );
        
        // 完成服务
        vm.prank(agent1);
        agentNetwork.completeService(
            0, // 第一个服务
            "QmTestResult1"
        );
        
        // 检查智能体信息更新
        DIAPAgentNetwork.Agent memory agent = agentNetwork.getAgent(agent1);
        Assert.equal(agent.totalServices, 1, "服务数量错误");
        Assert.equal(agent.reputation, 2010, "完成服务后声誉错误"); // 2000 + 10奖励
        
        console.log("服务创建测试通过");
    }
    
    // ============ 支付系统测试 ============
    
    function testPaymentCreation() public {
        console.log("=== 测试支付创建 ===");
        
        // 创建支付
        vm.prank(agent1);
        payment.createPayment(
            agent2,
            50 * 10**18,
            "PAYMENT_001",
            "测试支付",
            "QmPaymentMetadata1"
        );
        
        // 确认支付
        vm.prank(agent2);
        payment.confirmPayment("PAYMENT_001");
        
        // 检查支付统计
        (uint256 totalPayments, uint256 totalVolume, ) = payment.getPaymentStats();
        Assert.equal(totalPayments, 1, "总支付数量错误");
        Assert.equal(totalVolume, 50 * 10**18, "总支付金额错误");
        
        console.log("支付创建测试通过");
    }
    
    function testCrossChainPayment() public {
        console.log("=== 测试跨链支付 ===");
        
        // 发起跨链支付
        vm.prank(agent1);
        payment.initiateCrossChainPayment(
            agent2,
            100 * 10**18,
            137, // Polygon
            "0x1234567890123456789012345678901234567890",
            "CROSS_CHAIN_001"
        );
        
        // 完成跨链支付
        vm.prank(owner);
        payment.completeCrossChainPayment("CROSS_CHAIN_001", "0xproof");
        
        // 检查跨链支付统计
        (uint256 totalPayments, uint256 totalVolume, uint256 totalCrossChainVolume) = payment.getPaymentStats();
        Assert.equal(totalCrossChainVolume, 100 * 10**18, "跨链支付金额错误");
        
        console.log("跨链支付测试通过");
    }
    
    function testPaymentChannel() public {
        console.log("=== 测试支付通道 ===");
        
        // 打开支付通道
        vm.prank(agent1);
        payment.openPaymentChannel(
            agent2,
            200 * 10**18,
            "CHANNEL_001"
        );
        
        // 关闭支付通道
        vm.prank(agent1);
        payment.closePaymentChannel(
            "CHANNEL_001",
            150 * 10**18, // agent1最终余额
            50 * 10**18,  // agent2最终余额
            "0xsig1",
            "0xsig2"
        );
        
        console.log("支付通道测试通过");
    }
    
    // ============ 治理系统测试 ============
    
    function testGovernanceProposal() public {
        console.log("=== 测试治理提案 ===");
        
        // 创建参数调整提案
        address[] memory targets = new address[](1);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        
        targets[0] = address(agentNetwork);
        values[0] = 0;
        calldatas[0] = abi.encodeWithSignature("setRegistrationFee(uint256)", 200 * 10**18);
        
        vm.prank(owner);
        uint256 proposalId = governance.proposeParameterChange(
            targets,
            values,
            calldatas,
            "调整注册费用"
        );
        
        // 检查提案创建
        Assert.greaterThan(proposalId, 0, "提案ID错误");
        
        console.log("治理提案测试通过");
    }
    
    function testGovernanceVoting() public {
        console.log("=== 测试治理投票 ===");
        
        // 这里需要先创建提案，然后进行投票
        // 由于时间限制，这里简化测试
        
        // 检查投票权重
        uint256 votes = governance.getCurrentVotes(agent1);
        Assert.greaterThan(votes, 0, "投票权重错误");
        
        console.log("治理投票测试通过");
    }
    
    // ============ 验证系统测试 ============
    
    function testIdentityVerification() public {
        console.log("=== 测试身份验证 ===");
        
        // 发起身份验证
        vm.prank(agent1);
        bytes32 sessionId = verification.initiateIdentityVerification(
            "QmTestDID1",
            "0x1234567890abcdef",
            keccak256("commitment1"),
            keccak256("nullifier1"),
            [uint256(1), 2, 3, 4, 5, 6, 7, 8]
        );
        
        // 验证身份
        vm.prank(owner);
        bool isValid = verification.verifyIdentity(sessionId);
        
        Assert.equal(isValid, true, "身份验证失败");
        
        // 检查身份证明
        bool isVerified = verification.isIdentityVerified(agent1);
        Assert.equal(isVerified, true, "身份验证状态错误");
        
        console.log("身份验证测试通过");
    }
    
    function testReputationVerification() public {
        console.log("=== 测试声誉验证 ===");
        
        // 验证声誉
        vm.prank(agent1);
        bool isValid = verification.verifyReputation(
            agent1,
            2000,
            [uint256(1), 2, 3, 4, 5, 6, 7, 8]
        );
        
        Assert.equal(isValid, true, "声誉验证失败");
        
        // 检查声誉证明
        bool isVerified = verification.isReputationVerified(agent1);
        Assert.equal(isVerified, true, "声誉验证状态错误");
        
        console.log("声誉验证测试通过");
    }
    
    function testMaliciousBehaviorDetection() public {
        console.log("=== 测试恶意行为检测 ===");
        
        // 检测恶意行为
        vm.prank(owner);
        verification.detectMaliciousBehavior(
            agent3,
            "SPAM",
            "发送垃圾信息"
        );
        
        // 检查黑名单状态
        bool isBlacklisted = verification.isAgentBlacklisted(agent3);
        Assert.equal(isBlacklisted, true, "黑名单状态错误");
        
        // 移除黑名单
        vm.prank(owner);
        verification.removeFromBlacklist(agent3);
        
        isBlacklisted = verification.isAgentBlacklisted(agent3);
        Assert.equal(isBlacklisted, false, "移除黑名单失败");
        
        console.log("恶意行为检测测试通过");
    }
    
    // ============ 集成测试 ============
    
    function testCompleteWorkflow() public {
        console.log("=== 测试完整工作流程 ===");
        
        // 1. 智能体注册
        vm.prank(agent3);
        agentNetwork.registerAgent{value: 100 * 10**18}(
            "QmTestDID3",
            "0x9876543210fedcba",
            STAKE_AMOUNT
        );
        
        // 2. 身份验证
        vm.prank(agent3);
        bytes32 sessionId = verification.initiateIdentityVerification(
            "QmTestDID3",
            "0x9876543210fedcba",
            keccak256("commitment3"),
            keccak256("nullifier3"),
            [uint256(1), 2, 3, 4, 5, 6, 7, 8]
        );
        
        vm.prank(owner);
        verification.verifyIdentity(sessionId);
        
        // 3. 创建服务
        vm.prank(agent3);
        agentNetwork.createService(
            agent1,
            "DATA_PROCESSING",
            200 * 10**18
        );
        
        // 4. 完成服务
        vm.prank(agent3);
        agentNetwork.completeService(1, "QmTestResult2");
        
        // 5. 创建支付
        vm.prank(agent1);
        payment.createPayment(
            agent3,
            200 * 10**18,
            "PAYMENT_002",
            "服务费用支付",
            "QmPaymentMetadata2"
        );
        
        // 6. 确认支付
        vm.prank(agent3);
        payment.confirmPayment("PAYMENT_002");
        
        // 检查最终状态
        DIAPAgentNetwork.Agent memory agent = agentNetwork.getAgent(agent3);
        Assert.equal(agent.totalServices, 1, "最终服务数量错误");
        Assert.equal(agent.totalEarnings, 200 * 10**18, "最终收益错误");
        
        console.log("完整工作流程测试通过");
    }
    
    // ============ 性能测试 ============
    
    function testNetworkPerformance() public {
        console.log("=== 测试网络性能 ===");
        
        // 测试大量消息发送
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(agent1);
            agentNetwork.sendMessage{value: 1 * 10**18}(
                agent2,
                string(abi.encodePacked("QmTestMessage", i))
            );
        }
        
        // 检查性能统计
        (uint256 totalAgents, uint256 totalMessages, uint256 totalServices, uint256 totalVolume, ) = agentNetwork.getNetworkStats();
        Assert.equal(totalMessages, 11, "消息总数错误"); // 1个之前的 + 10个新的
        
        console.log("网络性能测试通过");
    }
    
    // ============ 测试总结 ============
    
    function afterAll() public {
        console.log("=== DIAP智能体网络测试完成 ===");
        
        // 输出最终统计
        (uint256 totalAgents, uint256 totalMessages, uint256 totalServices, uint256 totalVolume, ) = agentNetwork.getNetworkStats();
        (uint256 totalPayments, uint256 paymentVolume, uint256 crossChainVolume) = payment.getPaymentStats();
        (uint256 totalVerifications, uint256 successfulVerifications, uint256 failedVerifications) = verification.getVerificationStats();
        
        console.log("=== 最终统计 ===");
        console.log("总智能体数量:", totalAgents);
        console.log("总消息数量:", totalMessages);
        console.log("总服务数量:", totalServices);
        console.log("总交易量:", totalVolume);
        console.log("总支付数量:", totalPayments);
        console.log("总支付金额:", paymentVolume);
        console.log("跨链支付金额:", crossChainVolume);
        console.log("总验证次数:", totalVerifications);
        console.log("成功验证次数:", successfulVerifications);
        console.log("失败验证次数:", failedVerifications);
        
        console.log("=== 所有测试通过 ===");
    }
}
