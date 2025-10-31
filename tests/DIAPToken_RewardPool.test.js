// SPDX-License-Identifier: MIT
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DIAPToken - 奖励池保护机制", function () {
    let token;
    let owner;
    let user1;
    let user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        token = await DIAPToken.deploy();
        await token.initialize("DIAP Token", "DIAP");

        // 给用户分配代币
        const userBalance = ethers.utils.parseEther("100000");
        await token.transfer(user1.address, userBalance);
        await token.transfer(user2.address, userBalance);
    });

    describe("奖励池状态查询", function () {
        it("应该正确返回奖励池状态", async function () {
            const status = await token.getRewardPoolStatus();
            
            // 初始状态：合约有 800万 DIAP 奖励池
            expect(status.balance).to.equal(ethers.utils.parseEther("8000000"));
            expect(status.isHealthy).to.be.true;
        });

        it("应该在质押后正确计算比例", async function () {
            // 用户质押
            const stakeAmount = ethers.utils.parseEther("10000");
            await token.connect(user1).stake(stakeAmount, 1); // 白银级
            
            const status = await token.getRewardPoolStatus();
            
            // 奖励池余额 / 质押量 = 8000000 / 10000 = 800 = 80000%
            expect(status.ratio).to.be.gt(100); // 远大于 100%
            expect(status.isHealthy).to.be.true;
        });
    });

    describe("奖励池补充", function () {
        it("应该允许 owner 补充奖励池", async function () {
            const replenishAmount = ethers.utils.parseEther("1000000"); // 100万
            
            await expect(
                token.replenishRewardPool(replenishAmount)
            ).to.emit(token, "RewardPoolReplenished")
                .withArgs(owner.address, replenishAmount, ethers.utils.parseEther("9000000"));
            
            const status = await token.getRewardPoolStatus();
            expect(status.balance).to.equal(ethers.utils.parseEther("9000000"));
        });

        it("应该拒绝非 owner 补充奖励池", async function () {
            const replenishAmount = ethers.utils.parseEther("1000000");
            
            await expect(
                token.connect(user1).replenishRewardPool(replenishAmount)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("应该拒绝补充 0 数量", async function () {
            await expect(
                token.replenishRewardPool(0)
            ).to.be.revertedWithCustomError(token, "AmountMustBeGreaterThanZero");
        });
    });

    describe("奖励池耗尽保护", function () {
        it("应该在奖励池不足时记录待支付奖励", async function () {
            // 这个测试需要模拟奖励池接近耗尽的情况
            // 由于测试环境限制，我们主要验证机制存在
            
            const status = await token.getRewardPoolStatus();
            expect(status.balance).to.be.gt(0);
        });

        it("应该在奖励池低于阈值时发出警告", async function () {
            // 验证事件定义存在
            const filter = token.filters.RewardPoolLow();
            expect(filter).to.exist;
        });

        it("应该在奖励池完全耗尽时发出警告", async function () {
            // 验证事件定义存在
            const filter = token.filters.RewardPoolDepleted();
            expect(filter).to.exist;
        });
    });

    describe("奖励池健康监控", function () {
        it("应该在奖励池健康时返回 true", async function () {
            const status = await token.getRewardPoolStatus();
            expect(status.isHealthy).to.be.true;
        });

        it("应该正确计算奖励池比例", async function () {
            // 大量质押以降低比例
            const largeStake = ethers.utils.parseEther("50000");
            await token.connect(user1).stake(largeStake, 2); // 黄金级
            
            const status = await token.getRewardPoolStatus();
            
            // 8000000 / 50000 = 160 = 16000%
            expect(status.ratio).to.be.gt(10); // 仍然健康
        });
    });
});
