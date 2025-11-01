import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("=== 部署DIAPGovernance和TimelockController ===");
    
    // 从之前的部署中获取已部署的地址
    const TOKEN_ADDRESS = "0xFBD843F3ECDd5398639d849763088BF9Cd36f2Be";
    const NETWORK_ADDRESS = "0xA960cf9053FA76278e16f9D4BA35225f7634DC54";
    
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("部署者余额:", ethers.utils.formatEther(balance), "ETH");
    
    if (balance.lt(ethers.utils.parseEther("0.001"))) {
        console.warn("⚠️  警告: 余额可能不足以支付Gas费用！");
    }
    
    try {
        // 1. 部署TimelockController
        console.log("\n" + "=".repeat(60));
        console.log("1. 部署TimelockController");
        console.log("=".repeat(60));
        console.log("TimelockController用于安全延迟执行提案");
        
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const timelock = await TimelockController.deploy(
            1, // 最小延迟（秒）- 测试网使用1秒，主网建议2-7天
            [deployer.address], // 管理员列表
            [deployer.address], // 执行者列表
            deployer.address // 取消者
        );
        
        console.log("   交易已发送，等待确认... (哈希:", timelock.deployTransaction.hash + ")");
        const timelockTx = await timelock.deployTransaction.wait(2);
        
        console.log("✅ TimelockController地址:", timelock.address);
        console.log("   交易哈希:", timelockTx.transactionHash);
        
        // 2. 部署DIAPGovernance
        console.log("\n" + "=".repeat(60));
        console.log("2. 部署DIAPGovernance");
        console.log("=".repeat(60));
        console.log("DIAPGovernance用于去中心化治理和提案投票");
        
        const DIAPGovernance = await ethers.getContractFactory("DIAPGovernance");
        const governance = await DIAPGovernance.deploy(
            TOKEN_ADDRESS,    // DIAPToken地址（用于投票）
            timelock.address, // TimelockController地址
            NETWORK_ADDRESS   // DIAPAgentNetwork地址
        );
        
        console.log("   交易已发送，等待确认... (哈希:", governance.deployTransaction.hash + ")");
        const governanceTx = await governance.deployTransaction.wait(2);
        
        console.log("✅ DIAPGovernance地址:", governance.address);
        console.log("   交易哈希:", governanceTx.transactionHash);
        
        // 验证部署
        const votingDelay = await governance.votingDelay();
        const votingPeriod = await governance.votingPeriod();
        const proposalThreshold = await governance.proposalThreshold();
        
        console.log("\n✅ 部署验证:");
        console.log("   所有者:", await governance.owner());
        console.log("   投票延迟:", votingDelay.toString(), "秒");
        console.log("   投票周期:", votingPeriod.toString(), "秒");
        console.log("   提案门槛:", ethers.utils.formatEther(proposalThreshold), "DAT");
        
        // 保存部署信息
        const deploymentInfo = {
            network: "baseSepolia",
            chainId: "84532",
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                TimelockController: {
                    address: timelock.address,
                    minDelay: "1",
                    admin: deployer.address,
                    executor: deployer.address,
                    canceller: deployer.address
                },
                DIAPGovernance: {
                    address: governance.address,
                    tokenAddress: TOKEN_ADDRESS,
                    timelockAddress: timelock.address,
                    networkAddress: NETWORK_ADDRESS,
                    votingDelay: votingDelay.toString(),
                    votingPeriod: votingPeriod.toString(),
                    proposalThreshold: proposalThreshold.toString()
                }
            }
        };
        
        const deploymentDir = path.join(process.cwd(), "deployments");
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        const fileName = `deployment_governance_${Date.now()}.json`;
        const filePath = path.join(deploymentDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(60));
        console.log("✅ 治理合约部署成功！");
        console.log("=".repeat(60));
        console.log("\n部署信息已保存:", filePath);
        console.log("\n请更新.env文件:");
        console.log(`DIAP_GOVERNANCE_ADDRESS=${governance.address}`);
        
        console.log("\n📋 治理合约功能:");
        console.log("  - 创建提案：网络升级、参数调整、资金管理等");
        console.log("  - 代币投票：持有DAT代币的用户可以投票");
        console.log("  - 安全执行：通过Timelock延迟执行，防止恶意提案");
        console.log("  - 法定人数：需要4%的代币参与投票");
        
        const network = await ethers.provider.getNetwork();
        const chainIdStr = network.chainId.toString();
        if (chainIdStr === "84532") {
            console.log("\n验证合约源码:");
            console.log(`npx hardhat verify --network baseSepolia ${timelock.address} 1 "[\"${deployer.address}\"]" "[\"${deployer.address}\"]" "${deployer.address}"`);
            console.log(`npx hardhat verify --network baseSepolia ${governance.address} "${TOKEN_ADDRESS}" "${timelock.address}" "${NETWORK_ADDRESS}"`);
        }
        
    } catch (error) {
        console.error("\n❌ 部署失败:", error.message);
        if (error.message.includes("insufficient funds")) {
            console.error("余额不足，请充值后重试");
        }
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署脚本错误:", error);
        process.exit(1);
    });

