/**
 * 恢复合约脚本
 * 
 * 用途：在问题解决后恢复合约功能
 * 使用：npx hardhat run scripts/emergency/unpause_all.js --network <network>
 */

const hre = require("hardhat");

async function main() {
    console.log("🔄 合约恢复程序启动...\n");
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("操作账户:", deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH\n");

    // 合约地址
    const contracts = {
        token: process.env.DIAP_TOKEN_ADDRESS,
        network: process.env.DIAP_NETWORK_ADDRESS,
        paymentCore: process.env.DIAP_PAYMENT_CORE_ADDRESS,
        paymentChannel: process.env.DIAP_PAYMENT_CHANNEL_ADDRESS,
        governance: process.env.DIAP_GOVERNANCE_ADDRESS
    };

    console.log("⚠️  警告：请确认以下事项后再继续：");
    console.log("1. ✅ 安全问题已完全解决");
    console.log("2. ✅ 代码已审计和测试");
    console.log("3. ✅ 已通知用户即将恢复");
    console.log("4. ✅ 监控系统已就绪");
    console.log();

    if (hre.network.name === "mainnet") {
        console.log("❌ 主网操作需要手动确认，请使用多签钱包");
        process.exit(1);
    }

    const results = [];

    // 1. 恢复 Token 合约
    try {
        console.log("1️⃣ 恢复 DIAPToken...");
        const token = await hre.ethers.getContractAt("DIAPToken", contracts.token);
        const tx1 = await token.unpause();
        await tx1.wait();
        console.log("✅ DIAPToken 已恢复");
        results.push({ contract: "DIAPToken", status: "success", tx: tx1.hash });
    } catch (error) {
        console.log("❌ DIAPToken 恢复失败:", error.message);
        results.push({ contract: "DIAPToken", status: "failed", error: error.message });
    }

    // 2. 恢复 Network 合约
    try {
        console.log("\n2️⃣ 恢复 DIAPAgentNetwork...");
        const network = await hre.ethers.getContractAt("DIAPAgentNetwork", contracts.network);
        const tx2 = await network.unpause();
        await tx2.wait();
        console.log("✅ DIAPAgentNetwork 已恢复");
        results.push({ contract: "DIAPAgentNetwork", status: "success", tx: tx2.hash });
    } catch (error) {
        console.log("❌ DIAPAgentNetwork 恢复失败:", error.message);
        results.push({ contract: "DIAPAgentNetwork", status: "failed", error: error.message });
    }

    // 3. 恢复 PaymentCore 合约
    try {
        console.log("\n3️⃣ 恢复 DIAPPaymentCore...");
        const paymentCore = await hre.ethers.getContractAt("DIAPPaymentCore", contracts.paymentCore);
        const tx3 = await paymentCore.unpause();
        await tx3.wait();
        console.log("✅ DIAPPaymentCore 已恢复");
        results.push({ contract: "DIAPPaymentCore", status: "success", tx: tx3.hash });
    } catch (error) {
        console.log("❌ DIAPPaymentCore 恢复失败:", error.message);
        results.push({ contract: "DIAPPaymentCore", status: "failed", error: error.message });
    }

    // 4. 恢复 PaymentChannel 合约
    try {
        console.log("\n4️⃣ 恢复 DIAPPaymentChannel...");
        const paymentChannel = await hre.ethers.getContractAt("DIAPPaymentChannel", contracts.paymentChannel);
        const tx4 = await paymentChannel.unpause();
        await tx4.wait();
        console.log("✅ DIAPPaymentChannel 已恢复");
        results.push({ contract: "DIAPPaymentChannel", status: "success", tx: tx4.hash });
    } catch (error) {
        console.log("❌ DIAPPaymentChannel 恢复失败:", error.message);
        results.push({ contract: "DIAPPaymentChannel", status: "failed", error: error.message });
    }

    // 5. 恢复 Governance 合约
    try {
        console.log("\n5️⃣ 恢复 DIAPGovernance...");
        const governance = await hre.ethers.getContractAt("DIAPGovernance", contracts.governance);
        const tx5 = await governance.unpause();
        await tx5.wait();
        console.log("✅ DIAPGovernance 已恢复");
        results.push({ contract: "DIAPGovernance", status: "success", tx: tx5.hash });
    } catch (error) {
        console.log("❌ DIAPGovernance 恢复失败:", error.message);
        results.push({ contract: "DIAPGovernance", status: "failed", error: error.message });
    }

    // 总结
    console.log("\n" + "=".repeat(60));
    console.log("合约恢复操作完成");
    console.log("=".repeat(60));
    
    const successful = results.filter(r => r.status === "success").length;
    const failed = results.filter(r => r.status === "failed").length;
    
    console.log(`\n✅ 成功: ${successful}/${results.length}`);
    console.log(`❌ 失败: ${failed}/${results.length}`);

    console.log("\n📢 下一步操作:");
    console.log("1. 发布恢复公告");
    console.log("2. 密切监控合约状态");
    console.log("3. 准备应对用户问题");
    console.log("4. 记录事件报告");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 脚本执行失败:", error);
        process.exit(1);
    });
