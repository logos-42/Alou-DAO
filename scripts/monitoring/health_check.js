/**
 * 健康检查脚本
 * 
 * 用途：定期检查合约状态，发现异常
 * 使用：npx hardhat run scripts/monitoring/health_check.js --network <network>
 * 建议：每 5-10 分钟运行一次（使用 cron 或 GitHub Actions）
 */

import pkg from "hardhat";
const hre = pkg;
const { ethers } = hre;
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

// 配置阈值
const THRESHOLDS = {
    balanceDropPercent: 10,      // 余额下降超过 10% 告警
    largeTransferAmount: 100000, // 大额转账告警（100k DIAP）
    stakingDropPercent: 15,      // 质押量下降超过 15% 告警
    failedTxPercent: 5,          // 失败交易超过 5% 告警
};

async function main() {
    console.log("🏥 DIAP 健康检查开始...\n");
    console.log("检查时间:", new Date().toISOString());
    console.log("网络:", hre.network.name);
    console.log();

    const contracts = {
        token: process.env.DIAP_TOKEN_ADDRESS,
        network: process.env.DIAP_NETWORK_ADDRESS,
        paymentCore: process.env.DIAP_PAYMENT_CORE_ADDRESS,
    };

    const alerts = [];
    const warnings = [];
    const info = [];

    try {
        // 1. 检查 Token 合约
        console.log("1️⃣ 检查 DIAPToken 合约...");
        const token = await hre.ethers.getContractAt("DIAPToken", contracts.token);
        
        // 基本状态
        const isPaused = await token.paused();
        const totalSupply = await token.totalSupply();
        const contractBalance = await token.balanceOf(contracts.token);
        const totalStaked = await token.totalStaked();
        const totalBurned = await token.totalBurned();
        const stakingRewardRate = await token.stakingRewardRate();
        
        console.log("   状态:", isPaused ? "⏸️  已暂停" : "✅ 正常运行");
        console.log("   总供应量:", ethers.utils.formatEther(totalSupply), "DIAP");
        console.log("   合约余额:", ethers.utils.formatEther(contractBalance), "DIAP");
        console.log("   总质押量:", ethers.utils.formatEther(totalStaked), "DIAP");
        console.log("   总燃烧量:", ethers.utils.formatEther(totalBurned), "DIAP");
        console.log("   质押奖励率:", stakingRewardRate.toString(), "基点");
        
        if (isPaused) {
            alerts.push("⚠️ DIAPToken 合约已暂停");
        }
        
        // 检查合约余额是否充足
        const minBalance = totalStaked.div(10); // 至少应该有质押量的 10%
        if (contractBalance.lt(minBalance)) {
            alerts.push(`⚠️ 合约余额不足：${ethers.utils.formatEther(contractBalance)} DIAP（建议 > ${ethers.utils.formatEther(minBalance)} DIAP）`);
        }
        
        // 🆕 检查奖励池余额（关键告警）
        if (totalStaked.gt(0)) {
            const rewardPoolRatio = Number(contractBalance.mul(100).div(totalStaked));
            console.log("   奖励池比例:", rewardPoolRatio.toFixed(2), "% (余额/质押量)");
            
            if (rewardPoolRatio < 5) {
                alerts.push(`🚨 严重：奖励池余额不足 5% 质押量！当前: ${rewardPoolRatio.toFixed(2)}%`);
            } else if (rewardPoolRatio < 10) {
                alerts.push(`⚠️ 警告：奖励池余额低于 10% 质押量，当前: ${rewardPoolRatio.toFixed(2)}%`);
            } else if (rewardPoolRatio < 15) {
                warnings.push(`⚠️ 注意：奖励池余额低于 15% 质押量，当前: ${rewardPoolRatio.toFixed(2)}%`);
            }
        }
        
        // 检查质押率
        const stakingRatio = Number(totalStaked.mul(10000).div(totalSupply)) / 100;
        console.log("   质押率:", stakingRatio.toFixed(2), "%");
        if (stakingRatio < 5) {
            warnings.push(`⚠️ 质押率较低：${stakingRatio.toFixed(2)}%`);
        }

        // 2. 检查 Network 合约
        console.log("\n2️⃣ 检查 DIAPAgentNetwork 合约...");
        const network = await hre.ethers.getContractAt("DIAPAgentNetwork", contracts.network);
        
        const networkPaused = await network.paused();
        const totalAgents = await network.totalAgents();
        const totalVolume = await network.totalVolume();
        
        console.log("   状态:", networkPaused ? "⏸️  已暂停" : "✅ 正常运行");
        console.log("   总智能体数:", totalAgents.toString());
        console.log("   总交易量:", ethers.utils.formatEther(totalVolume), "DIAP");
        
        if (networkPaused) {
            alerts.push("⚠️ DIAPAgentNetwork 合约已暂停");
        }

        // 3. 检查 PaymentCore 合约
        console.log("\n3️⃣ 检查 DIAPPaymentCore 合约...");
        const paymentCore = await hre.ethers.getContractAt("DIAPPaymentCore", contracts.paymentCore);
        
        const paymentPaused = await paymentCore.paused();
        const paymentVolume = await paymentCore.totalVolume();
        
        console.log("   状态:", paymentPaused ? "⏸️  已暂停" : "✅ 正常运行");
        console.log("   总支付量:", ethers.utils.formatEther(paymentVolume), "DIAP");
        
        if (paymentPaused) {
            alerts.push("⚠️ DIAPPaymentCore 合约已暂停");
        }

        // 4. 检查最近的事件
        console.log("\n4️⃣ 检查最近的事件...");
        const currentBlock = await hre.ethers.provider.getBlockNumber();
        const fromBlock = currentBlock - 1000; // 检查最近 1000 个区块
        
        // 检查大额转账
        const transferFilter = token.filters.Transfer();
        const transfers = await token.queryFilter(transferFilter, fromBlock, currentBlock);
        
        const largeTransfers = transfers.filter(event => {
            const amount = event.args.value;
            return amount.gt(ethers.utils.parseEther(THRESHOLDS.largeTransferAmount.toString()));
        });
        
        if (largeTransfers.length > 0) {
            console.log(`   ⚠️ 发现 ${largeTransfers.length} 笔大额转账`);
            largeTransfers.forEach(event => {
                warnings.push(`大额转账: ${ethers.utils.formatEther(event.args.value)} DIAP (区块 ${event.blockNumber})`);
            });
        } else {
            console.log("   ✅ 未发现异常大额转账");
        }

        // 5. 检查 Gas 价格
        console.log("\n5️⃣ 检查 Gas 价格...");
        const feeData = await hre.ethers.provider.getFeeData();
        const gasPrice = feeData.gasPrice;
        console.log("   当前 Gas 价格:", ethers.utils.formatUnits(gasPrice, "gwei"), "Gwei");
        
        if (gasPrice.gt(ethers.utils.parseUnits("100", "gwei"))) {
            warnings.push(`⚠️ Gas 价格较高：${ethers.utils.formatUnits(gasPrice, "gwei")} Gwei`);
        }

        // 6. 生成报告
        console.log("\n" + "=".repeat(60));
        console.log("健康检查报告");
        console.log("=".repeat(60));
        
        if (alerts.length === 0 && warnings.length === 0) {
            console.log("\n✅ 所有检查通过，系统运行正常");
        } else {
            if (alerts.length > 0) {
                console.log("\n🚨 严重告警:");
                alerts.forEach(alert => console.log("   " + alert));
            }
            
            if (warnings.length > 0) {
                console.log("\n⚠️  警告:");
                warnings.forEach(warning => console.log("   " + warning));
            }
        }

        // 7. 保存报告
        const report = {
            timestamp: new Date().toISOString(),
            network: hre.network.name,
            status: alerts.length === 0 ? "healthy" : "unhealthy",
            alerts: alerts,
            warnings: warnings,
            metrics: {
                totalSupply: ethers.utils.formatEther(totalSupply),
                contractBalance: ethers.utils.formatEther(contractBalance),
                totalStaked: ethers.utils.formatEther(totalStaked),
                stakingRatio: stakingRatio,
                totalAgents: totalAgents.toString(),
                totalVolume: ethers.utils.formatEther(totalVolume),
                gasPrice: ethers.utils.formatUnits(gasPrice, "gwei")
            }
        };

        const logDir = 'logs/health';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = `${logDir}/health_${Date.now()}.json`;
        fs.writeFileSync(logFile, JSON.stringify(report, null, 2));
        console.log(`\n📝 报告已保存: ${logFile}`);

        // 8. 发送告警（如果有）
        if (alerts.length > 0) {
            console.log("\n🔔 建议立即检查系统！");
            // 这里可以集成 Telegram/Discord/Email 通知
            // await sendAlert(alerts);
        }

        return report;

    } catch (error) {
        console.error("\n❌ 健康检查失败:", error.message);
        
        const errorReport = {
            timestamp: new Date().toISOString(),
            network: hre.network.name,
            status: "error",
            error: error.message
        };
        
        // 保存错误报告
        const logDir = 'logs/health';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const logFile = `${logDir}/health_error_${Date.now()}.json`;
        fs.writeFileSync(logFile, JSON.stringify(errorReport, null, 2));
        
        throw error;
    }
}

// 如果直接运行脚本
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
