/**
 * 转移合约所有权到多签钱包
 * 
 * 用途：将所有合约的所有权转移到 Gnosis Safe
 * 使用：npx hardhat run scripts/post_deploy/transfer_ownership.js --network <network>
 */

const hre = require("hardhat");

async function main() {
    console.log("🔐 转移合约所有权到多签钱包\n");
    console.log("=".repeat(60));
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("操作账户:", deployer.address);
    
    // 配置
    const SAFE_ADDRESS = process.env.GNOSIS_SAFE_ADDRESS;
    const contracts = {
        token: process.env.DIAP_TOKEN_ADDRESS,
        network: process.env.DIAP_NETWORK_ADDRESS,
        paymentCore: process.env.DIAP_PAYMENT_CORE_ADDRESS,
        paymentChannel: process.env.DIAP_PAYMENT_CHANNEL_ADDRESS,
        governance: process.env.DIAP_GOVERNANCE_ADDRESS,
        verification: process.env.DIAP_VERIFICATION_ADDRESS
    };
    
    if (!SAFE_ADDRESS) {
        console.log("❌ 请在 .env 中配置 GNOSIS_SAFE_ADDRESS");
        process.exit(1);
    }
    
    console.log("Safe 地址:", SAFE_ADDRESS);
    console.log();
    
    console.log("⚠️  警告：即将转移所有合约的所有权");
    console.log("⚠️  转移后，只有多签钱包能管理合约");
    console.log();
    
    if (hre.network.name === "mainnet") {
        console.log("❌ 主网操作需要额外确认");
        process.exit(1);
    }
    
    const results = [];
    
    // 1. 转移 Token 所有权
    if (contracts.token) {
        try {
            console.log("1️⃣ 转移 DIAPToken 所有权...");
            const token = await hre.ethers.getContractAt("DIAPToken", contracts.token);
            const currentOwner = await token.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPToken", status: "already_transferred" });
            } else {
                const tx = await token.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPToken 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPToken", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPToken 转移失败:", error.message);
            results.push({ contract: "DIAPToken", status: "failed", error: error.message });
        }
    }
    
    // 2. 转移 Network 所有权
    if (contracts.network) {
        try {
            console.log("\n2️⃣ 转移 DIAPAgentNetwork 所有权...");
            const network = await hre.ethers.getContractAt("DIAPAgentNetwork", contracts.network);
            const currentOwner = await network.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPAgentNetwork", status: "already_transferred" });
            } else {
                const tx = await network.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPAgentNetwork 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPAgentNetwork", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPAgentNetwork 转移失败:", error.message);
            results.push({ contract: "DIAPAgentNetwork", status: "failed", error: error.message });
        }
    }
    
    // 3. 转移 PaymentCore 所有权
    if (contracts.paymentCore) {
        try {
            console.log("\n3️⃣ 转移 DIAPPaymentCore 所有权...");
            const paymentCore = await hre.ethers.getContractAt("DIAPPaymentCore", contracts.paymentCore);
            const currentOwner = await paymentCore.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPPaymentCore", status: "already_transferred" });
            } else {
                const tx = await paymentCore.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPPaymentCore 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPPaymentCore", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPPaymentCore 转移失败:", error.message);
            results.push({ contract: "DIAPPaymentCore", status: "failed", error: error.message });
        }
    }
    
    // 4. 转移 PaymentChannel 所有权
    if (contracts.paymentChannel) {
        try {
            console.log("\n4️⃣ 转移 DIAPPaymentChannel 所有权...");
            const paymentChannel = await hre.ethers.getContractAt("DIAPPaymentChannel", contracts.paymentChannel);
            const currentOwner = await paymentChannel.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPPaymentChannel", status: "already_transferred" });
            } else {
                const tx = await paymentChannel.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPPaymentChannel 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPPaymentChannel", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPPaymentChannel 转移失败:", error.message);
            results.push({ contract: "DIAPPaymentChannel", status: "failed", error: error.message });
        }
    }
    
    // 5. 转移 Governance 所有权
    if (contracts.governance) {
        try {
            console.log("\n5️⃣ 转移 DIAPGovernance 所有权...");
            const governance = await hre.ethers.getContractAt("DIAPGovernance", contracts.governance);
            const currentOwner = await governance.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPGovernance", status: "already_transferred" });
            } else {
                const tx = await governance.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPGovernance 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPGovernance", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPGovernance 转移失败:", error.message);
            results.push({ contract: "DIAPGovernance", status: "failed", error: error.message });
        }
    }
    
    // 6. 转移 Verification 所有权
    if (contracts.verification) {
        try {
            console.log("\n6️⃣ 转移 DIAPVerification 所有权...");
            const verification = await hre.ethers.getContractAt("DIAPVerification", contracts.verification);
            const currentOwner = await verification.owner();
            
            if (currentOwner === SAFE_ADDRESS) {
                console.log("✅ 已经是 Safe 所有");
                results.push({ contract: "DIAPVerification", status: "already_transferred" });
            } else {
                const tx = await verification.transferOwnership(SAFE_ADDRESS);
                await tx.wait();
                console.log("✅ DIAPVerification 所有权已转移");
                console.log("   交易:", tx.hash);
                results.push({ contract: "DIAPVerification", status: "success", tx: tx.hash });
            }
        } catch (error) {
            console.log("❌ DIAPVerification 转移失败:", error.message);
            results.push({ contract: "DIAPVerification", status: "failed", error: error.message });
        }
    }
    
    // 总结
    console.log("\n" + "=".repeat(60));
    console.log("所有权转移完成");
    console.log("=".repeat(60));
    
    const successful = results.filter(r => r.status === "success" || r.status === "already_transferred").length;
    const failed = results.filter(r => r.status === "failed").length;
    
    console.log(`\n✅ 成功: ${successful}/${results.length}`);
    console.log(`❌ 失败: ${failed}/${results.length}`);
    
    if (failed > 0) {
        console.log("\n失败的合约:");
        results.filter(r => r.status === "failed").forEach(r => {
            console.log(`- ${r.contract}: ${r.error}`);
        });
    }
    
    // 保存记录
    const fs = require('fs');
    const record = {
        timestamp: new Date().toISOString(),
        network: hre.network.name,
        safeAddress: SAFE_ADDRESS,
        results: results
    };
    
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
    }
    
    fs.writeFileSync(
        `logs/transfer_ownership_${Date.now()}.json`,
        JSON.stringify(record, null, 2)
    );
    
    console.log("\n📝 转移记录已保存到 logs/");
    
    console.log("\n📋 下一步操作:");
    console.log("1. 在 Gnosis Safe UI 中验证所有权");
    console.log("2. 测试多签操作（如暂停合约）");
    console.log("3. 更新文档");
    console.log("4. 通知团队成员");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
