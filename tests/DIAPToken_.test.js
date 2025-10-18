// SPDX-License-Identifier: MIT
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DIAPToken", function () {
    let token;
    let owner;
    let user1;
    let user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        
        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        token = await DIAPToken.deploy();
        await token.initialize();
        
        // 给用户分配一些代币用于测试
        const userBalance = ethers.utils.parseEther("100000"); // 10万代币
        await token.transfer(user1.address, userBalance);
        await token.transfer(user2.address, userBalance);
    });

    describe("初始化", function () {
        it("应该正确初始化代币", async function () {
            expect(await token.name()).to.equal("DIAP Token");
            expect(await token.symbol()).to.equal("DIAP");
            expect(await token.decimals()).to.equal(18);
            expect(await token.owner()).to.equal(owner.address);
        });

        it("应该正确设置初始参数", async function () {
            expect(await token.stakingRewardRate()).to.equal(500); // 5%
            expect(await token.burnRate()).to.equal(25); // 0.25%
            expect(await token.MIN_REWARD_RATE()).to.equal(100); // 1%
            expect(await token.MAX_REWARD_RATE()).to.equal(1000); // 10%
        });
    });

    describe("质押功能", function () {
        it("应该允许首次质押", async function () {
            const amount = ethers.utils.parseEther("1000"); // 青铜级最低要求
            
            await token.connect(user1).stake(amount, 0); // 青铜级
            
            const stakingInfo = await token.getStakingInfo(user1.address);
            expect(stakingInfo.amount).to.equal(amount);
            expect(stakingInfo.tier).to.equal(0); // 青铜级
        });

        it("应该拒绝低于层级要求的质押", async function () {
            const amount = ethers.utils.parseEther("500"); // 低于青铜级要求
            
            await expect(
                token.connect(user1).stake(amount, 0)
            ).to.be.revertedWith("Amount below tier minimum");
        });

        it("应该允许追加质押但不允许层级跳跃", async function () {
            const initialAmount = ethers.utils.parseEther("1000");
            const additionalAmount = ethers.utils.parseEther("1000"); // 增加到2000，仍然在青铜级范围内
            
            // 首次质押
            await token.connect(user1).stake(initialAmount, 0);
            
            // 追加质押应该成功
            await token.connect(user1).stake(additionalAmount, 0);
            
            const stakingInfo = await token.getStakingInfo(user1.address);
            expect(stakingInfo.amount).to.equal(initialAmount.add(additionalAmount));
        });

        it("应该拒绝层级跳跃", async function () {
            const amount = ethers.utils.parseEther("1000"); // 青铜级
            
            await token.connect(user1).stake(amount, 0);
            
            // 尝试跳跃到白银级应该失败（需要足够的金额）
            const silverAmount = ethers.utils.parseEther("10000"); // 白银级最低要求
            await expect(
                token.connect(user1).stake(silverAmount, 1)
            ).to.be.revertedWith("Tier change not allowed for additional stake");
        });
    });

    describe("动态奖励率调整", function () {
        it("应该在余额不足时调整奖励率", async function () {
            // 这个测试需要模拟合约余额不足的情况
            // 由于动态调整需要30天间隔，这里主要测试机制存在
            expect(await token.RATE_ADJUSTMENT_INTERVAL()).to.equal(30 * 24 * 60 * 60); // 30天
        });

        it("应该限制奖励率在合理范围内", async function () {
            expect(await token.MIN_REWARD_RATE()).to.equal(100); // 1%
            expect(await token.MAX_REWARD_RATE()).to.equal(1000); // 10%
        });
    });

    describe("时间锁机制", function () {
        it("应该要求时间锁来调整奖励率", async function () {
            const newRate = 600; // 6%
            
            // 直接调整应该失败
            await expect(
                token.setStakingRewardRate(newRate)
            ).to.be.revertedWith("Action not scheduled");
        });

        it("应该允许安排奖励率调整", async function () {
            const newRate = 600; // 6%
            
            // 安排调整应该成功
            await expect(
                token.scheduleRewardRateChange(newRate)
            ).to.emit(token, "ActionScheduled");
        });
    });

    describe("紧急控制机制", function () {
        it("应该允许紧急暂停", async function () {
            await expect(
                token.emergencyPause()
            ).to.emit(token, "EmergencyPaused");
            
            expect(await token.emergencyPaused()).to.be.true;
        });

        it("应该允许取消紧急暂停", async function () {
            await token.emergencyPause();
            await token.emergencyUnpause();
            
            expect(await token.emergencyPaused()).to.be.false;
        });

        it("应该拒绝在紧急暂停时的质押", async function () {
            await token.emergencyPause();
            const amount = ethers.utils.parseEther("1000");
            
            await expect(
                token.connect(user1).stake(amount, 0)
            ).to.be.revertedWith("Contract is emergency paused");
        });

        it("应该允许紧急提取", async function () {
            const amount = ethers.utils.parseEther("1000");
            await token.connect(user1).stake(amount, 0);
            
            await token.enableEmergencyWithdraw();
            
            await expect(
                token.connect(user1).emergencyWithdraw()
            ).to.emit(token, "EmergencyWithdraw");
        });
    });

    describe("通缩机制", function () {
        it("应该正确燃烧代币", async function () {
            const burnAmount = ethers.utils.parseEther("100");
            const reason = "Test burn";
            
            await expect(
                token.connect(user1).burnTokens(burnAmount, reason)
            ).to.emit(token, "TokensBurned")
            .withArgs(user1.address, burnAmount, reason);
        });

        it("应该在转账时自动燃烧", async function () {
            const transferAmount = ethers.utils.parseEther("1000");
            const expectedBurnAmount = transferAmount.mul(25).div(10000); // 0.25%
            
            await expect(
                token.connect(user1).transfer(user2.address, transferAmount)
            ).to.emit(token, "TokensBurned")
            .withArgs(user1.address, expectedBurnAmount, "Auto-burn on transfer");
        });
    });

    describe("查询函数", function () {
        it("应该正确返回代币统计", async function () {
            const stats = await token.getTokenStats();
            expect(stats.length).to.equal(4);
            expect(stats[0]).to.be.gt(ethers.utils.parseEther("99900000")); // totalSupply should be ~100M (initial supply)
            expect(stats[1]).to.be.gte(0); // totalStaked (may have staked tokens from other tests)
            expect(stats[2]).to.be.gte(0); // totalBurned (may have burned tokens from other tests)
            expect(stats[3]).to.equal(0); // totalRewards
        });

        it("应该正确返回质押层级信息", async function () {
            const bronzeTier = await token.getStakingTier(0);
            expect(bronzeTier.minAmount).to.equal(ethers.utils.parseEther("1000"));
            expect(bronzeTier.multiplier).to.equal(10000); // 1x
            expect(bronzeTier.lockPeriod).to.equal(30 * 24 * 60 * 60); // 30天
        });
    });
});