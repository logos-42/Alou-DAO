/**
 * 紧急暂停脚本
 * 
 * 用途：在发现安全问题时立即暂停所有合约
 * 使用：npx hardhat run scripts/emergency/pause_all.js --network <network>
 */

const hre = require("hardhat");

async function main() {
    console.log("🚨 紧急暂停程序启动...\n");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("操作账户:", deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // 合约地址（需要根据实际部署更新）
    const contracts = {
        token: process.env.DIAP_TOKEN_ADDRESS,
        network: process.env.DIAP_NETWORK_ADDRESS,
        paymentCore: process.env.DIAP_PAYMENT_CORE_ADDRESS,
        paymentChannel: process.env.DIAP_PAYMENT_CHANNEL_ADDRESS,
        governance: process.env.DIAP_GOVERNANCE_ADDRESS
    };

    console.log("目标合约:");
    console.log("- Token:", contracts.token);
    console.log("- Network:", contracts.network);
    console.log("- PaymentCore:", contracts.paymentCore);
    console.log("- PaymentChannel:", contracts.paymentChannel);
    console.log("- Governance:", contracts.governance);
    console.log();

    // 确认操作
    console.log("⚠️  警告：此操作将暂停所有合约功能！");
    console.log("⚠️  用户将无法进行新的操作（但可以提取资金）");
    console.log();
    
    // 在生产环境需要手动确认
    if (hre.network.name === "mainnet") {
        console.log("❌ 主网操作需要手动确认，请使用多签钱包");
        process.exit(1);
    }

    const results = [];

    // 1. 暂停 Token 合约
    try {
        console.log("1️⃣ 暂停 DIAPToken...");
        const token = await hre.ethers.getContractAt("DIAPToken", contracts.token);
        const tx1 = await token.pause();
        await tx1.wait();
        console.log("✅ DIAPToken 已暂停");
        console.log("   交易哈希:", tx1.hash);
        results.push({ contract: "DIAPToken", status: "success", tx: tx1.hash });
    } catch (error) {
        console.log("❌ DIAPToken 暂停失败:", error.message);
        results.push({ contract: "DIAPToken", status: "failed", error: error.message });
    }

    // 2. 暂停 Network 合约
    try {
        console.log("\n2️⃣ 暂停 DIAPAgentNetwork...");
        const network = await hre.ethers.getContractAt("DIAPAgentNetwork", contracts.network);
        const tx2 = await network.pause();
        await tx2.wait();
        console.log("✅ DIAPAgentNetwork 已暂停");
        console.log("   交易哈希:", tx2.hash);
        results.push({ contract: "DIAPAgentNetwork", status: "success", tx: tx2.hash });
    } catch (error) {
        console.log("❌ DIAPAgentNetwork 暂停失败:", error.message);
        results.push({ contract: "DIAPAgentNetwork", status: "failed", error: error.message });
    }

    // 3. 暂停 PaymentCore 合约
    try {
        console.log("\n3️⃣ 暂停 DIAPPaymentCore...");
        const paymentCore = await hre.ethers.getContractAt("DIAPPaymentCore", contracts.paymentCore);
        const tx3 = await paymentCore.pause();
        await tx3.wait();
        console.log("✅ DIAPPaymentCore 已暂停");
        console.log("   交易哈希:", tx3.hash);
        results.push({ contract: "DIAPPaymentCore", status: "success", tx: tx3.hash });
    } catch (error) {
        console.log("❌ DIAPPaymentCore 暂停失败:", error.message);
        results.push({ contract: "DIAPPaymentCore", status: "failed", error: error.message });
    }

    // 4. 暂停 PaymentChannel 合约
    try {
        console.log("\n4️⃣ 暂停 DIAPPaymentChannel...");
        const paymentChannel = await hre.ethers.getContractAt("DIAPPaymentChannel", contracts.paymentChannel);
        const tx4 = await paymentChannel.pause();
        await tx4.wait();
        console.log("✅ DIAPPaymentChannel 已暂停");
        console.log("   交易哈希:", tx4.hash);
        results.push({ contract: "DIAPPaymentChannel", status: "success", tx: tx4.hash });
    } catch (error) {
        console.log("❌ DIAPPaymentChannel 暂停失败:", error.message);
        results.push({ contract: "DIAPPaymentChannel", status: "failed", error: error.message });
    }

    // 5. 暂停 Governance 合约
    try {
        console.log("\n5️⃣ 暂停 DIAPGovernance...");
        const governance = await hre.ethers.getContractAt("DIAPGovernance", contracts.governance);
        const tx5 = await governance.pause();
        await tx5.wait();
        console.log("✅ DIAPGovernance 已暂停");
        console.log("   交易哈希:", tx5.hash);
        results.push({ contract: "DIAPGovernance", status: "success", tx: tx5.hash });
    } catch (error) {
        console.log("❌ DIAPGovernance 暂停失败:", error.message);
        results.push({ contract: "DIAPGovernance", status: "failed", error: error.message });
    }

    // 总结
    console.log("\n" + "=".repeat(60));
    console.log("紧急暂停操作完成");
    console.log("=".repeat(60));
    
    const successful = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    
    console.log(`\n✅ 成功: ${successful}/${results.length}`);
    console.log(`❌ 失败: ${failed}/${results.length}`);
    
    if (failed > 0) {
        console.log("\n失败的合约:");
        results.filter(r => r.status === "failed").forEach(r => {
            console.log(`- ${r.contract}: ${r.error}`);
        });
    }

    console.log("\n⚠️  下一步操作:");
    console.log("1. 通知用户（Discord/Telegram/Twitter）");
    console.log("2. 分析问题原因");
    console.log("3. 准备修复方案");
    console.log("4. 考虑是否启用紧急提取");
    console.log("5. 准备公告和补偿方案");
    
    // 保存日志
    const fs = require('fs');
    const logFile = `emergency_pause_${Date.now()}.json`;
    fs.writeFileSync(
        `logs/${logFile}`,
        JSON.stringify({
            timestamp: new Date().toISOString(),
            network: hre.network.name,
            operator: deployer.address,
            results: results
        }, null, 2)
    );
    console.log(`\n📝 日志已保存: logs/${logFile}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 脚本执行失败:", error);
        process.exit(1);
    });
