// SPDX-License-Identifier: MIT
import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("DIAPVerification", function () {
    let verification;
    let agentNetwork;
    let owner;
    let user1;
    let user2;
    let zkpVerifier;

    beforeEach(async function () {
        [owner, user1, user2, zkpVerifier] = await ethers.getSigners();
        
        // 部署DIAPAgentNetwork
        const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
        agentNetwork = await DIAPAgentNetwork.deploy();
        await agentNetwork.deployed();
        
        // 部署DIAPVerification
        const DIAPVerification = await ethers.getContractFactory("DIAPVerification");
        verification = await DIAPVerification.deploy();
        await verification.deployed();
        
        // 初始化
        await verification.initialize(agentNetwork.address);
    });

    describe("初始化", function () {
        it("应该正确初始化合约", async function () {
            expect(await verification.owner()).to.equal(owner.address);
            expect(await verification.verificationTimeout()).to.equal(3600); // 1 hour
            expect(await verification.maxVerificationAttempts()).to.equal(3);
            expect(await verification.reputationThreshold()).to.equal(1000);
        });

        it("应该拒绝零地址初始化", async function () {
            const DIAPVerification = await ethers.getContractFactory("DIAPVerification");
            const newVerification = await DIAPVerification.deploy();
            
            await expect(
                newVerification.initialize(ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid agent network address");
        });
    });

    describe("权限控制", function () {
        it("只有owner可以设置验证器", async function () {
            await expect(
                verification.connect(user1).setZKPVerifier(zkpVerifier.address)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("owner可以设置验证器", async function () {
            await verification.setZKPVerifier(zkpVerifier.address);
            expect(await verification.zkpVerifier()).to.equal(zkpVerifier.address);
        });
    });

    describe("字符串长度限制", function () {
        it("应该拒绝过长的DID文档", async function () {
            const longString = "a".repeat(1001); // 超过MAX_STRING_LENGTH
            const proof = [1, 2, 3, 4, 5, 6, 7, 8];
            
            await expect(
                verification.connect(user1).initiateIdentityVerification(
                    longString,
                    "publicKey",
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("commitment")),
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("nullifier")),
                    proof
                )
            ).to.be.revertedWith("Invalid DID document length");
        });

        it("应该拒绝过长的公钥", async function () {
            const longString = "a".repeat(1001); // 超过MAX_STRING_LENGTH
            const proof = [1, 2, 3, 4, 5, 6, 7, 8];
            
            await expect(
                verification.connect(user1).initiateIdentityVerification(
                    "didDocument",
                    longString,
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("commitment")),
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("nullifier")),
                    proof
                )
            ).to.be.revertedWith("Invalid public key length");
        });
    });

    describe("nullifier管理", function () {
        it("应该防止nullifier重放", async function () {
            const nullifier = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test-nullifier"));
            const proof = [1, 2, 3, 4, 5, 6, 7, 8];
            
            // 第一次使用
            await verification.connect(user1).initiateIdentityVerification(
                "didDocument",
                "publicKey",
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes("commitment")),
                nullifier,
                proof
            );
            
            // 第二次使用相同的nullifier应该失败
            await expect(
                verification.connect(user2).initiateIdentityVerification(
                    "didDocument2",
                    "publicKey2",
                    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("commitment2")),
                    nullifier, // 相同的nullifier
                    proof
                )
            ).to.be.revertedWith("Nullifier already used");
        });
    });

    describe("管理函数事件", function () {
        it("设置验证超时应该发出事件", async function () {
            await expect(verification.setVerificationTimeout(7200))
                .to.emit(verification, "VerificationTimeoutUpdated")
                .withArgs(3600, 7200);
        });

        it("设置最大验证尝试次数应该发出事件", async function () {
            await expect(verification.setMaxVerificationAttempts(5))
                .to.emit(verification, "MaxVerificationAttemptsUpdated")
                .withArgs(3, 5);
        });

        it("设置声誉阈值应该发出事件", async function () {
            await expect(verification.setReputationThreshold(2000))
                .to.emit(verification, "ReputationThresholdUpdated")
                .withArgs(1000, 2000);
        });
    });

    describe("查询函数", function () {
        it("应该正确返回nullifier使用状态", async function () {
            const nullifier = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("test"));
            
            expect(await verification.isNullifierUsed(nullifier)).to.be.false;
        });

        it("应该正确返回验证器状态", async function () {
            const [verifier, isAvailable] = await verification.getVerifierStatus();
            expect(verifier).to.equal(ethers.constants.AddressZero);
            expect(isAvailable).to.be.false;
        });
    });
});
