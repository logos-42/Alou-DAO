/**
 * 部署前检查清单
 * 
 * 用途：在部署到主网前进行全面检查
 * 使用：npx hardhat run scripts/deployment/pre_deploy_checklist.js
 */

const hre = require("hardhat");
const fs = require('fs');

async function main() {
    console.log("📋 DIAP 部署前检查清单\n");
    console.log("=".repeat(60));
    
    const checks = [];
    let passed = 0;
    let failed = 0;

    // 1. 环境检查
    console.log("\n1️⃣ 环境检查");
    console.log("-".repeat(60));
    
    // 检查网络
    const network = hre.network.name;
    console.log(`网络: ${network}`);
    if (network === "hardhat" || network === "localhost") {
        console.log("❌ 不能在本地网络部署到生产环境");
        checks.push({ category: "环境", item: "网络配置", status: "failed", message: "本地网络" });
        failed++;
    } else {
        console.log("✅ 网络配置正确");
        checks.push({ category: "环境", item: "网络配置", status: "passed" });
        passed++;
    }
    
    // 检查环境变量
    const requiredEnvVars = [
        'PRIVATE_KEY',
        'ETHERSCAN_API_KEY',
    ];
    
    const optionalEnvVars = [
        'TELEGRAM_BOT_TOKEN',
        'TELEGRAM_CHAT_ID',
    ];
    
    console.log("\n必需的环境变量:");
    requiredEnvVars.forEach(varName => {
        if (process.env[varName]) {
            console.log(`✅ ${varName}`);
            checks.push({ category: "环境", item: varName, status: "passed" });
            passed++;
        } else {
            console.log(`❌ ${varName} 未设置`);
            checks.push({ category: "环境", item: varName, status: "failed", message: "未设置" });
            failed++;
        }
    });
    
    console.log("\n可选的环境变量:");
    optionalEnvVars.forEach(varName => {
        if (process.env[varName]) {
            console.log(`✅ ${varName}`);
        } else {
            console.log(`⚠️  ${varName} 未设置（建议设置）`);
        }
    });

    // 2. 代码检查
    console.log("\n2️⃣ 代码检查");
    console.log("-".repeat(60));
    
    // 检查编译
    try {
        console.log("编译合约...");
        await hre.run("compile");
        console.log("✅ 合约编译成功");
        checks.push({ category: "代码", item: "编译", status: "passed" });
        passed++;
    } catch (error) {
        console.log("❌ 合约编译失败:", error.message);
        checks.push({ category: "代码", item: "编译", status: "failed", message: error.message });
        failed++;
    }
    
    // 检查测试
    console.log("\n运行测试...");
    try {
        await hre.run("test");
        console.log("✅ 所有测试通过");
        checks.push({ category: "代码", item: "测试", status: "passed" });
        passed++;
    } catch (error) {
        console.log("❌ 测试失败");
        checks.push({ category: "代码", item: "测试", status: "failed", message: "测试未通过" });
        failed++;
    }

    // 3. 安全检查
    console.log("\n3️⃣ 安全检查");
    console.log("-".repeat(60));
    
    // 检查是否有审计报告
    if (fs.existsSync('SECURITY_AUDIT_REPORT.md')) {
        console.log("✅ 安全审计报告存在");
        checks.push({ category: "安全", item: "审计报告", status: "passed" });
        passed++;
    } else {
        console.log("⚠️  未找到安全审计报告");
        checks.push({ category: "安全", item: "审计报告", status: "warning", message: "建议进行专业审计" });
    }
    
    // 检查 Solhint
    console.log("\n运行 Solhint...");
    try {
        const { execSync } = require('child_process');
        const output = execSync('npx solhint "contracts/**/*.sol"', { encoding: 'utf-8' });
        
        if (output.includes('0 errors')) {
            console.log("✅ Solhint 检查通过（0 错误）");
            checks.push({ category: "安全", item: "Solhint", status: "passed" });
            passed++;
        } else {
            console.log("⚠️  Solhint 发现问题");
            console.log(output);
            checks.push({ category: "安全", item: "Solhint", status: "warning" });
        }
    } catch (error) {
        console.log("⚠️  Solhint 检查失败");
    }

    // 4. 文档检查
    console.log("\n4️⃣ 文档检查");
    console.log("-".repeat(60));
    
    const requiredDocs = [
        'README.md',
        'TOKEN_ALLOCATION.md',
        'SECURITY_AUDIT_REPORT.md'
    ];
    
    requiredDocs.forEach(doc => {
        if (fs.existsSync(doc)) {
            console.log(`✅ ${doc}`);
            checks.push({ category: "文档", item: doc, status: "passed" });
            passed++;
        } else {
            console.log(`❌ ${doc} 不存在`);
            checks.push({ category: "文档", item: doc, status: "failed", message: "文件不存在" });
            failed++;
        }
    });

    // 5. 部署准备
    console.log("\n5️⃣ 部署准备");
    console.log("-".repeat(60));
    
    // 检查部署脚本
    if (fs.existsSync('scripts/deploy_diap_full.js')) {
        console.log("✅ 部署脚本存在");
        checks.push({ category: "部署", item: "部署脚本", status: "passed" });
        passed++;
    } else {
        console.log("❌ 部署脚本不存在");
        checks.push({ category: "部署", item: "部署脚本", status: "failed" });
        failed++;
    }
    
    // 检查紧急脚本
    const emergencyScripts = [
        'scripts/emergency/pause_all.js',
        'scripts/emergency/unpause_all.js'
    ];
    
    emergencyScripts.forEach(script => {
        if (fs.existsSync(script)) {
            console.log(`✅ ${script}`);
            checks.push({ category: "部署", item: script, status: "passed" });
            passed++;
        } else {
            console.log(`❌ ${script} 不存在`);
            checks.push({ category: "部署", item: script, status: "failed" });
            failed++;
        }
    });
    
    // 检查监控脚本
    if (fs.existsSync('scripts/monitoring/health_check.js')) {
        console.log("✅ 健康检查脚本存在");
        checks.push({ category: "部署", item: "健康检查脚本", status: "passed" });
        passed++;
    } else {
        console.log("❌ 健康检查脚本不存在");
        checks.push({ category: "部署", item: "健康检查脚本", status: "failed" });
        failed++;
    }

    // 6. 账户检查
    console.log("\n6️⃣ 账户检查");
    console.log("-".repeat(60));
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("部署账户:", deployer.address);
    
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("账户余额:", hre.ethers.formatEther(balance), "ETH");
    
    // 估算部署成本（粗略估计）
    const estimatedCost = hre.ethers.parseEther("0.1"); // 假设需要 0.1 ETH
    if (balance > estimatedCost) {
        console.log("✅ 账户余额充足");
        checks.push({ category: "账户", item: "余额", status: "passed" });
        passed++;
    } else {
        console.log("❌ 账户余额不足");
        checks.push({ category: "账户", item: "余额", status: "failed", message: "余额不足" });
        failed++;
    }

    // 7. 最终总结
    console.log("\n" + "=".repeat(60));
    console.log("检查总结");
    console.log("=".repeat(60));
    
    console.log(`\n✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`📊 总计: ${passed + failed}`);
    
    const passRate = (passed / (passed + failed) * 100).toFixed(1);
    console.log(`\n通过率: ${passRate}%`);
    
    if (failed === 0) {
        console.log("\n🎉 所有检查通过！可以准备部署。");
    } else {
        console.log("\n⚠️  有检查项未通过，请修复后再部署。");
        console.log("\n失败的检查项:");
        checks.filter(c => c.status === "failed").forEach(c => {
            console.log(`  • ${c.category} - ${c.item}: ${c.message || '失败'}`);
        });
    }
    
    // 保存检查报告
    const report = {
        timestamp: new Date().toISOString(),
        network: network,
        deployer: deployer.address,
        balance: hre.ethers.formatEther(balance),
        passed: passed,
        failed: failed,
        passRate: passRate,
        checks: checks
    };
    
    const reportFile = `logs/pre_deploy_check_${Date.now()}.json`;
    if (!fs.existsSync('logs')) {
        fs.mkdirSync('logs', { recursive: true });
    }
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📝 检查报告已保存: ${reportFile}`);
    
    // 如果有失败项，退出码为 1
    if (failed > 0) {
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ 检查失败:", error);
        process.exit(1);
    });
