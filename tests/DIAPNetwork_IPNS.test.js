import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DIAP Network - IPNS Support", function () {
  let agentNetwork;
  let token;
  let owner, agent1, agent2, agent3;
  let INITIAL_BALANCE, STAKE_AMOUNT, REGISTRATION_FEE;
  
  // 测试用标识符
  const TEST_IPNS = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8";
  const TEST_CID_V0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
  const TEST_CID_V1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const TEST_PUBLIC_KEY = "0x1234567890abcdef";
  
  beforeEach(async function () {
    [owner, agent1, agent2, agent3] = await ethers.getSigners();
    
    INITIAL_BALANCE = ethers.utils.parseEther("10000");
    STAKE_AMOUNT = ethers.utils.parseEther("1000");
    REGISTRATION_FEE = ethers.utils.parseEther("100");
    
    // 部署代币合约
    const DIAPToken = await ethers.getContractFactory("DIAPToken");
    token = await DIAPToken.deploy();
    await token.initialize("DIAP Token", "DIAP");
    
    // 部署智能体网络合约
    const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
    agentNetwork = await DIAPAgentNetwork.deploy();
    await agentNetwork.initialize(token.address);
    
    // 分配代币
    await token.mint(agent1.address, INITIAL_BALANCE);
    await token.mint(agent2.address, INITIAL_BALANCE);
    await token.mint(agent3.address, INITIAL_BALANCE);
  });
  
  describe("标识符格式验证", function () {
    it("应该接受有效的IPNS名称", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      await agentNetwork.connect(agent1).registerAgent(
        TEST_IPNS,
        TEST_PUBLIC_KEY,
        STAKE_AMOUNT
      );
      
      const agent = await agentNetwork.agents(agent1.address);
      expect(agent.didDocument).to.equal(TEST_IPNS);
      expect(agent.isActive).to.be.true;
    });
    
    it("应该接受有效的CIDv0格式", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent2).approve(agentNetwork.address, totalCost);
      
      await agentNetwork.connect(agent2).registerAgent(
        TEST_CID_V0,
        TEST_PUBLIC_KEY,
        STAKE_AMOUNT
      );
      
      const agent = await agentNetwork.agents(agent2.address);
      expect(agent.didDocument).to.equal(TEST_CID_V0);
      expect(agent.isActive).to.be.true;
    });
    
    it("应该接受有效的CIDv1格式", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent3).approve(agentNetwork.address, totalCost);
      
      await agentNetwork.connect(agent3).registerAgent(
        TEST_CID_V1,
        TEST_PUBLIC_KEY,
        STAKE_AMOUNT
      );
      
      const agent = await agentNetwork.agents(agent3.address);
      expect(agent.didDocument).to.equal(TEST_CID_V1);
      expect(agent.isActive).to.be.true;
    });
    
    it("应该拒绝无效的标识符格式", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      await expect(
        agentNetwork.connect(agent1).registerAgent(
          "invalid",
          TEST_PUBLIC_KEY,
          STAKE_AMOUNT
        )
      ).to.be.revertedWith("Invalid identifier format");
    });
    
    it("应该拒绝过短的标识符", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      await expect(
        agentNetwork.connect(agent1).registerAgent(
          "Qm123",
          TEST_PUBLIC_KEY,
          STAKE_AMOUNT
        )
      ).to.be.revertedWith("Invalid identifier format");
    });
    
    it("应该拒绝过长的标识符", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      const tooLong = "k" + "a".repeat(100);
      await expect(
        agentNetwork.connect(agent1).registerAgent(
          tooLong,
          TEST_PUBLIC_KEY,
          STAKE_AMOUNT
        )
      ).to.be.revertedWith("Invalid identifier format");
    });
  });
  
  describe("标识符类型识别", function () {
    beforeEach(async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      
      // 注册三个智能体
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      await agentNetwork.connect(agent1).registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT);
      
      await token.connect(agent2).approve(agentNetwork.address, totalCost);
      await agentNetwork.connect(agent2).registerAgent(TEST_CID_V0, TEST_PUBLIC_KEY, STAKE_AMOUNT);
      
      await token.connect(agent3).approve(agentNetwork.address, totalCost);
      await agentNetwork.connect(agent3).registerAgent(TEST_CID_V1, TEST_PUBLIC_KEY, STAKE_AMOUNT);
    });
    
    it("应该正确识别IPNS名称", async function () {
      const idType = await agentNetwork.getAgentIdentifierType(agent1.address);
      expect(idType).to.equal(2); // IdentifierType.IPNS_NAME
    });
    
    it("应该正确识别IPFS CID", async function () {
      const idType = await agentNetwork.getAgentIdentifierType(agent2.address);
      expect(idType).to.equal(1); // IdentifierType.IPFS_CID
    });
    
    it("应该正确识别CIDv1", async function () {
      const idType = await agentNetwork.getAgentIdentifierType(agent3.address);
      expect(idType).to.equal(1); // IdentifierType.IPFS_CID
    });
  });
  
  describe("向后兼容性", function () {
    beforeEach(async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      
      // 注册IPNS和CID智能体
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      await agentNetwork.connect(agent1).registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT);
      
      await token.connect(agent2).approve(agentNetwork.address, totalCost);
      await agentNetwork.connect(agent2).registerAgent(TEST_CID_V0, TEST_PUBLIC_KEY, STAKE_AMOUNT);
    });
    
    it("IPNS和CID智能体应该能互相发送消息", async function () {
      const messageFee = await agentNetwork.messageFee();
      await token.connect(agent1).approve(agentNetwork.address, messageFee);
      
      await agentNetwork.connect(agent1).sendMessage(
        agent2.address,
        "QmTestMessage123456789012345678901234567890"
      );
      
      const totalMessages = await agentNetwork.totalMessages();
      expect(totalMessages).to.equal(1);
    });
    
    it("didToAgent映射应该正确工作（IPNS）", async function () {
      const mappedAgent = await agentNetwork.didToAgent(TEST_IPNS);
      expect(mappedAgent).to.equal(agent1.address);
    });
    
    it("didToAgent映射应该正确工作（CID）", async function () {
      const mappedAgent = await agentNetwork.didToAgent(TEST_CID_V0);
      expect(mappedAgent).to.equal(agent2.address);
    });
  });
  
  describe("事件发射", function () {
    it("所有注册都应该发射AgentRegistered事件", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      await expect(
        agentNetwork.connect(agent1).registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT)
      ).to.emit(agentNetwork, "AgentRegistered");
    });
  });
  
  describe("Gas成本测试", function () {
    it("IPNS注册的Gas成本应该合理", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent1).approve(agentNetwork.address, totalCost);
      
      const tx = await agentNetwork.connect(agent1).registerAgent(TEST_IPNS, TEST_PUBLIC_KEY, STAKE_AMOUNT);
      const receipt = await tx.wait();
      
      console.log("IPNS注册Gas消耗:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(500000);
    });
    
    it("CID注册的Gas成本应该相似", async function () {
      const totalCost = STAKE_AMOUNT.add(REGISTRATION_FEE);
      await token.connect(agent2).approve(agentNetwork.address, totalCost);
      
      const tx = await agentNetwork.connect(agent2).registerAgent(TEST_CID_V0, TEST_PUBLIC_KEY, STAKE_AMOUNT);
      const receipt = await tx.wait();
      
      console.log("CID注册Gas消耗:", receipt.gasUsed.toString());
      expect(receipt.gasUsed).to.be.lessThan(500000);
    });
  });
});
