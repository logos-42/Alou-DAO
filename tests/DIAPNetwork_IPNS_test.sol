// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "remix_tests.sol";
import "hardhat/console.sol";
import "../contracts/DIAPAgentNetwork.sol";
import "../contracts/DIAPToken.sol";

/**
 * @title DIAPNetworkIPNSTest
 * @dev IPNS功能测试套件
 * @notice 测试IPNS名称支持和向后兼容性
 */
contract DIAPNetworkIPNSTest {
    
    DIAPAgentNetwork public agentNetwork;
    DIAPToken public token;
    
    address public owner;
    address public agent1;
    address public agent2;
    address public agent3;
    
    uint256 public constant INITIAL_BALANCE = 10000 * 10**18;
    uint256 public constant STAKE_AMOUNT = 1000 * 10**18;
    uint256 public constant REGISTRATION_FEE = 100 * 10**18;
    
    // 测试用标识符
    string constant TEST_IPNS = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8";
    string constant TEST_CID_V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    string constant TEST_CID_V1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    string constant TEST_PUBLIC_KEY = "0x1234567890abcdef";
    
    function beforeAll() public {
        console.log("=== IPNS功能测试开始 ===");
        
        owner = address(this);
        agent1 = address(0x1);
        agent2 = address(0x2);
        agent3 = address(0x3);
        
        // 部署代币合约
        token = new DIAPToken();
        token.initialize();
        console.log("DIAPToken部署:", address(token));
        
        // 部署智能体网络合约
        agentNetwork = new DIAPAgentNetwork();
        agentNetwork.initialize(address(token));
        console.log("DIAPAgentNetwork部署:", address(agentNetwork));
        
        // 分配代币
        token.mint(agent1, INITIAL_BALANCE);
        token.mint(agent2, INITIAL_BALANCE);
        token.mint(agent3, INITIAL_BALANCE);
        console.log("代币分配完成");
    }
    
    // ============ 标识符验证测试 ============
    
    /// #value: 0
    function testValidIPNSFormat() public {
        console.log("=== 测试有效的IPNS格式 ===");
        
        // 准备注册
        vm.prank(agent1);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        // 使用IPNS名称注册
        vm.prank(agent1);
        agentNetwork.registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT);
        
        // 验证注册成功
        (string memory didDoc, , , bool isActive, , , , , , ) = agentNetwork.agents(agent1);
        Assert.equal(didDoc, TEST_IPNS, "IPNS名称存储错误");
        Assert.equal(isActive, true, "智能体应该是活跃的");
        
        console.log("✅ IPNS格式验证通过");
    }
    
    /// #value: 0
    function testValidCIDv0Format() public {
        console.log("=== 测试有效的CIDv0格式 ===");
        
        vm.prank(agent2);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        vm.prank(agent2);
        agentNetwork.registerAgent(TEST_CID_V0, TEST_PUBLIC_KEY, STAKE_AMOUNT);
        
        (string memory didDoc, , , bool isActive, , , , , , ) = agentNetwork.agents(agent2);
        Assert.equal(didDoc, TEST_CID_V0, "CIDv0存储错误");
        Assert.equal(isActive, true, "智能体应该是活跃的");
        
        console.log("✅ CIDv0格式验证通过");
    }
    
    /// #value: 0
    function testValidCIDv1Format() public {
        console.log("=== 测试有效的CIDv1格式 ===");
        
        vm.prank(agent3);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        vm.prank(agent3);
        agentNetwork.registerAgent(TEST_CID_V1, TEST_PUBLIC_KEY, STAKE_AMOUNT);
        
        (string memory didDoc, , , bool isActive, , , , , , ) = agentNetwork.agents(agent3);
        Assert.equal(didDoc, TEST_CID_V1, "CIDv1存储错误");
        Assert.equal(isActive, true, "智能体应该是活跃的");
        
        console.log("✅ CIDv1格式验证通过");
    }
    
    /// #value: 0
    function testInvalidIdentifierFormat() public {
        console.log("=== 测试无效标识符格式 ===");
        
        address testAgent = address(0x4);
        token.mint(testAgent, INITIAL_BALANCE);
        
        vm.prank(testAgent);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        // 尝试使用无效格式注册
        try agentNetwork.registerAgent("invalid", TEST_PUBLIC_KEY, STAKE_AMOUNT) {
            Assert.ok(false, "应该拒绝无效格式");
        } catch Error(string memory reason) {
            Assert.equal(reason, "Invalid identifier format", "错误消息不正确");
            console.log("✅ 正确拒绝无效格式");
        }
    }
    
    /// #value: 0
    function testIdentifierTooShort() public {
        console.log("=== 测试标识符过短 ===");
        
        address testAgent = address(0x5);
        token.mint(testAgent, INITIAL_BALANCE);
        
        vm.prank(testAgent);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        try agentNetwork.registerAgent("Qm123", TEST_PUBLIC_KEY, STAKE_AMOUNT) {
            Assert.ok(false, "应该拒绝过短的标识符");
        } catch Error(string memory reason) {
            Assert.equal(reason, "Invalid identifier format", "错误消息不正确");
            console.log("✅ 正确拒绝过短标识符");
        }
    }
    
    // ============ 标识符类型识别测试 ============
    
    /// #value: 0
    function testGetIdentifierTypeIPNS() public {
        console.log("=== 测试IPNS类型识别 ===");
        
        DIAPAgentNetwork.IdentifierType idType = agentNetwork.getAgentIdentifierType(agent1);
        Assert.equal(uint(idType), uint(DIAPAgentNetwork.IdentifierType.IPNS_NAME), "应该识别为IPNS");
        
        console.log("✅ IPNS类型识别正确");
    }
    
    /// #value: 0
    function testGetIdentifierTypeCID() public {
        console.log("=== 测试CID类型识别 ===");
        
        DIAPAgentNetwork.IdentifierType idType = agentNetwork.getAgentIdentifierType(agent2);
        Assert.equal(uint(idType), uint(DIAPAgentNetwork.IdentifierType.IPFS_CID), "应该识别为IPFS_CID");
        
        console.log("✅ CID类型识别正确");
    }
    
    // ============ 向后兼容性测试 ============
    
    /// #value: 0
    function testMixedIdentifierInteraction() public {
        console.log("=== 测试混合标识符交互 ===");
        
        // Agent1使用IPNS，Agent2使用CID
        // 测试它们可以互相发送消息
        
        uint256 messageFee = agentNetwork.messageFee();
        
        // Agent1给Agent2发消息
        vm.prank(agent1);
        token.approve(address(agentNetwork), messageFee);
        
        vm.prank(agent1);
        agentNetwork.sendMessage(agent2, "QmTestMessage123456789012345678901234567890");
        
        // 验证消息计数增加
        uint256 totalMessages = agentNetwork.totalMessages();
        Assert.equal(totalMessages, 1, "消息应该发送成功");
        
        console.log("✅ 混合标识符交互正常");
    }
    
    /// #value: 0
    function testDIDToAgentMappingIPNS() public {
        console.log("=== 测试IPNS名称映射 ===");
        
        address mappedAgent = agentNetwork.didToAgent(TEST_IPNS);
        Assert.equal(mappedAgent, agent1, "IPNS名称应该映射到agent1");
        
        console.log("✅ IPNS映射正确");
    }
    
    /// #value: 0
    function testDIDToAgentMappingCID() public {
        console.log("=== 测试CID映射 ===");
        
        address mappedAgent = agentNetwork.didToAgent(TEST_CID_V0);
        Assert.equal(mappedAgent, agent2, "CID应该映射到agent2");
        
        console.log("✅ CID映射正确");
    }
    
    // ============ 事件测试 ============
    
    /// #value: 0
    function testIPNSEventEmission() public {
        console.log("=== 测试IPNS事件发射 ===");
        
        address testAgent = address(0x6);
        token.mint(testAgent, INITIAL_BALANCE);
        
        vm.prank(testAgent);
        token.approve(address(agentNetwork), STAKE_AMOUNT + REGISTRATION_FEE);
        
        // 注册时应该发射AgentRegisteredWithIPNS事件
        vm.expectEmit(true, false, false, true);
        emit AgentRegisteredWithIPNS(testAgent, TEST_IPNS, STAKE_AMOUNT, block.timestamp);
        
        vm.prank(testAgent);
        agentNetwork.registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT);
        
        console.log("✅ IPNS事件发射正确");
    }
    
    // 事件定义（用于测试）
    event AgentRegisteredWithIPNS(
        address indexed agent,
        string ipnsName,
        uint256 stakedAmount,
        uint256 timestamp
    );
}
