import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DIAPAccount - ERC-4337 集成测试", function () {
    let entryPoint;
    let accountFactory;
    let accountImplementation;
    let paymaster;
    let token;
    let agentNetwork;
    let owner;
    let agent;
    let sessionKey;
    let aaAccount;

    const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

    beforeEach(async function () {
        [owner, agent, sessionKey] = await ethers.getSigners();

        // 部署 AccountFactory
        const DIAPAccountFactory = await ethers.getContractFactory("DIAPAccountFactory");
        accountFactory = await DIAPAccountFactory.deploy(ENTRY_POINT_ADDRESS);
        await accountFactory.deployed();

        accountImplementation = await accountFactory.ACCOUNT_IMPLEMENTATION();

        // 部署 Paymaster（不调用需要 EntryPoint 的函数）
        const DIAPPaymaster = await ethers.getContractFactory("DIAPPaymaster");
        paymaster = await DIAPPaymaster.deploy(ENTRY_POINT_ADDRESS);
        await paymaster.deployed();

        // 部署 DIAPToken
        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        token = await DIAPToken.deploy();
        await token.initialize("DIAP Token", "DIAP");

        // 部署 DIAPAgentNetwork
        const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
        agentNetwork = await DIAPAgentNetwork.deploy();
        await agentNetwork.initialize(token.address);

        // 设置 AccountFactory 地址
        await agentNetwork.setAccountFactory(accountFactory.address);

        // 给 owner 分配代币用于测试
        const initialBalance = ethers.utils.parseEther("100000");
        await token.mint(owner.address, initialBalance);
    });

    describe("账户创建", function () {
        it("应该能够创建 AA 账户", async function () {
            const salt = 1;
            const tx = await accountFactory.createAccount(owner.address, salt);
            const receipt = await tx.wait();

            const accountAddress = await accountFactory.getAddress(owner.address, salt);
            expect(accountAddress).to.not.equal(ethers.constants.AddressZero);

            aaAccount = await ethers.getContractAt("DIAPAccount", accountAddress);
            expect(await aaAccount.owner()).to.equal(owner.address);
        });

        it("应该能够预计算账户地址", async function () {
            const salt = 2;
            const predictedAddress = await accountFactory.getAddress(owner.address, salt);
            
            await accountFactory.createAccount(owner.address, salt);
            const actualAddress = await accountFactory.getAddress(owner.address, salt);
            
            expect(predictedAddress).to.equal(actualAddress);
        });
    });

    describe("Session Key 管理", function () {
        beforeEach(async function () {
            const salt = 3;
            await accountFactory.createAccount(owner.address, salt);
            const accountAddress = await accountFactory.getAddress(owner.address, salt);
            aaAccount = await ethers.getContractAt("DIAPAccount", accountAddress);
        });

        it("应该能够添加 Session Key", async function () {
            const validUntil = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 天
            const dailyLimit = ethers.utils.parseEther("1000");
            const perTxLimit = ethers.utils.parseEther("100");

            await aaAccount.addSessionKey(
                sessionKey.address,
                validUntil,
                dailyLimit,
                perTxLimit
            );

            const info = await aaAccount.getSessionKeyInfo(sessionKey.address);
            expect(info.isActive).to.be.true;
            expect(info.dailyLimit).to.equal(dailyLimit);
            expect(info.perTxLimit).to.equal(perTxLimit);
        });

        it("应该能够移除 Session Key", async function () {
            const validUntil = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
            await aaAccount.addSessionKey(
                sessionKey.address,
                validUntil,
                ethers.utils.parseEther("1000"),
                ethers.utils.parseEther("100")
            );

            await aaAccount.removeSessionKey(sessionKey.address);

            const info = await aaAccount.getSessionKeyInfo(sessionKey.address);
            expect(info.isActive).to.be.false;
        });

        it("应该能够获取所有 Session Keys", async function () {
            const validUntil = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
            
            await aaAccount.addSessionKey(
                sessionKey.address,
                validUntil,
                ethers.utils.parseEther("1000"),
                ethers.utils.parseEther("100")
            );

            const keys = await aaAccount.getAllSessionKeys();
            expect(keys.length).to.equal(1);
            expect(keys[0]).to.equal(sessionKey.address);
        });
    });

    describe("限额管理", function () {
        beforeEach(async function () {
            const salt = 4;
            await accountFactory.createAccount(owner.address, salt);
            const accountAddress = await accountFactory.getAddress(owner.address, salt);
            aaAccount = await ethers.getContractAt("DIAPAccount", accountAddress);
        });

        it("应该能够设置每日限额", async function () {
            const newLimit = ethers.utils.parseEther("2000");
            await aaAccount.setDefaultDailyLimit(newLimit);
            
            expect(await aaAccount.defaultDailyLimit()).to.equal(newLimit);
        });

        it("应该能够设置单笔限额", async function () {
            const newLimit = ethers.utils.parseEther("200");
            await aaAccount.setDefaultPerTxLimit(newLimit);
            
            expect(await aaAccount.defaultPerTxLimit()).to.equal(newLimit);
        });
    });

    describe("白名单管理", function () {
        beforeEach(async function () {
            const salt = 5;
            await accountFactory.createAccount(owner.address, salt);
            const accountAddress = await accountFactory.getAddress(owner.address, salt);
            aaAccount = await ethers.getContractAt("DIAPAccount", accountAddress);
        });

        it("应该能够添加到白名单", async function () {
            await aaAccount.addToWhitelist(owner.address);
            expect(await aaAccount.isWhitelisted(owner.address)).to.be.true;
        });

        it("应该能够从白名单移除", async function () {
            await aaAccount.addToWhitelist(owner.address);
            await aaAccount.removeFromWhitelist(owner.address);
            expect(await aaAccount.isWhitelisted(owner.address)).to.be.false;
        });

        it("应该能够批量添加到白名单", async function () {
            const addresses = [owner.address, agent.address];
            await aaAccount.batchAddToWhitelist(addresses);
            
            expect(await aaAccount.isWhitelisted(owner.address)).to.be.true;
            expect(await aaAccount.isWhitelisted(agent.address)).to.be.true;
        });

        it("应该能够获取白名单", async function () {
            await aaAccount.addToWhitelist(owner.address);
            const whitelist = await aaAccount.getWhitelist();
            
            expect(whitelist.length).to.equal(1);
            expect(whitelist[0]).to.equal(owner.address);
        });
    });

    describe("账户控制", function () {
        beforeEach(async function () {
            const salt = 6;
            await accountFactory.createAccount(owner.address, salt);
            const accountAddress = await accountFactory.getAddress(owner.address, salt);
            aaAccount = await ethers.getContractAt("DIAPAccount", accountAddress);
        });

        it("应该能够冻结账户", async function () {
            await aaAccount.freeze();
            expect(await aaAccount.isFrozen()).to.be.true;
        });

        it("应该能够解冻账户", async function () {
            await aaAccount.freeze();
            await aaAccount.unfreeze();
            expect(await aaAccount.isFrozen()).to.be.false;
        });

        it("应该能够转移所有权", async function () {
            await aaAccount.transferOwnership(agent.address);
            expect(await aaAccount.owner()).to.equal(agent.address);
        });
    });

    describe.skip("代币操作", function () {
        // 跳过：需要 token 合约
    });

    describe("AgentNetwork 集成", function () {
        it("应该能够通过 AA 账户注册智能体", async function () {
            const didDocument = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8";
            const publicKey = "0x1234567890abcdef";
            const stakedAmount = ethers.utils.parseEther("1000");
            const salt = 8;

            // 授权（质押金额 + 注册费，注册费通常是 100 DIAP）
            const registrationFee = ethers.utils.parseEther("100");
            const totalCost = stakedAmount.add(registrationFee);
            await token.approve(agentNetwork.address, totalCost);

            // 注册
            const tx = await agentNetwork.registerAgentWithAA(
                didDocument,
                publicKey,
                stakedAmount,
                salt
            );
            const receipt = await tx.wait();

            // 验证
            const agentInfo = await agentNetwork.getAgent(owner.address);
            expect(agentInfo.isActive).to.be.true;
            expect(agentInfo.isAAAccount).to.be.true;
            expect(agentInfo.aaAccount).to.not.equal(ethers.constants.AddressZero);
        });

        it("应该能够查询 AA 账户地址", async function () {
            const didDocument = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v9";
            const publicKey = "0x1234567890abcdef";
            const stakedAmount = ethers.utils.parseEther("1000");
            const salt = 9;

            const registrationFee = ethers.utils.parseEther("100");
            const totalCost = stakedAmount.add(registrationFee);
            await token.approve(agentNetwork.address, totalCost);
            
            await agentNetwork.registerAgentWithAA(didDocument, publicKey, stakedAmount, salt);

            const aaAccountAddress = await agentNetwork.getAgentAAAccount(owner.address);
            expect(aaAccountAddress).to.not.equal(ethers.constants.AddressZero);
        });

        it("应该能够检查是否使用 AA 账户", async function () {
            const didDocument = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v10";
            const publicKey = "0x1234567890abcdef";
            const stakedAmount = ethers.utils.parseEther("1000");
            const salt = 10;

            const registrationFee = ethers.utils.parseEther("100");
            const totalCost = stakedAmount.add(registrationFee);
            await token.approve(agentNetwork.address, totalCost);
            
            await agentNetwork.registerAgentWithAA(didDocument, publicKey, stakedAmount, salt);

            const isAA = await agentNetwork.isAgentUsingAA(owner.address);
            expect(isAA).to.be.true;
        });
    });

    describe("Paymaster", function () {
        it("应该能够设置 Gas 配额", async function () {
            const quota = ethers.utils.parseEther("0.02");
            await paymaster.setGasQuota(owner.address, quota);

            const info = await paymaster.getGasQuotaInfo(owner.address);
            expect(info.dailyQuota).to.equal(quota);
            expect(info.isActive).to.be.true;
        });

        it("应该能够批量设置配额", async function () {
            const accounts = [owner.address, agent.address];
            const quotas = [
                ethers.utils.parseEther("0.01"),
                ethers.utils.parseEther("0.02")
            ];

            await paymaster.batchSetGasQuota(accounts, quotas);

            const info1 = await paymaster.getGasQuotaInfo(owner.address);
            const info2 = await paymaster.getGasQuotaInfo(agent.address);

            expect(info1.dailyQuota).to.equal(quotas[0]);
            expect(info2.dailyQuota).to.equal(quotas[1]);
        });

        it("应该能够添加账户到白名单", async function () {
            await paymaster.addAccountToWhitelist(owner.address);
            expect(await paymaster.isAccountWhitelisted(owner.address)).to.be.true;
        });

        it("应该能够添加目标到白名单", async function () {
            await paymaster.addTargetToWhitelist(owner.address);
            expect(await paymaster.isTargetWhitelisted(owner.address)).to.be.true;
        });

        it("应该能够查询统计信息", async function () {
            const totalSponsored = await paymaster.totalSponsored();
            const totalOperations = await paymaster.totalOperations();
            
            expect(totalSponsored).to.equal(0);
            expect(totalOperations).to.equal(0);
        });
    });
});
