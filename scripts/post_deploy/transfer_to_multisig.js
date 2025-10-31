/**
 * 转移代币到多签钱包
 * 
 * 用途：部署后立即将代币转移到 Gnosis Safe
 * 使用：npx hardhat run scripts/post_deploy/transfer_to_multisig.js --network <network>
 */

const hre = require("hardhat");

async function main() {
    console.log("💰 代币转移到多签钱包\n");
    console.log("=".repeat(60));
    
    const [deployer] = await hre.ethers.getSigners();
    console.log("操作账户:", deployer.address);
    
    // 配置
    const TOKEN_ADDRESS = process.env.DIAP_TOKEN_ADDRESS;
    const SAFE_ADDRESS = process.env.GNOSIS_SAFE_ADDRESS;
    
    if (!TOKEN_ADDRESS || !SAFE_ADDRESS) {
        console.log("❌ 请在 .env 中配置:");
        console.log("   DIAP_TOKEN_ADDRESS=0x...");
        console.log("   GNOSIS_SAFE_ADDRESS=0x...");
        process.exit(1);
    }
    
    console.log("Token 地址:", TOKEN_ADDRESS);
    console.log("Safe 地址:", SAFE_ADDRESS);
    console.log();
    
    // 获取合约
    const token = await hre.ethers.getContractAt("DIAPToken", TOKEN_ADDRESS);
    
    // 检查余额
    const balance = await token.balanceOf(deployer.address);
    console.log("当前余额:", hre.ethers.formatEther(balance), "DIAP\n");
    
    // 分配计划
    const allocations = {
        community: hre.ethers.parseEther("40000000"),  // 40%
        treasury: hre.ethers.parseEther("22000000"),   // 22%
        team: hre.ethers.parseEther("15000000"),       // 15%
        investor: hre.ethers.parseEther("15000000")    // 15%
    };
    
    const total = Object.values(allocations).reduce((a, b) => a + b, 0n);
    
    console.log("转移计划:");
    console.log("- 社区份额:", hre.ethers.formatEther(allocations.community), "DIAP");
    console.log("- 国库份额:", hre.ethers.formatEther(allocations.treasury), "DIAP");
    console.log("- 开发者份额:", hre.ethers.formatEther(allocations.team), "DIAP");
    console.log("- 投资人份额:", hre.ethers.formatEther(allocations.investor), "DIAP");
    console.log("- 总计:", hre.ethers.formatEther(total), "DIAP");
    console.log();
    
    // 确认
    if (hre.network.name === "mainnet") {
        console.log("❌ 主网操作需要额外确认");
        console.log("   请使用多签钱包直接操作");
        process.exit(1);
    }
    
    console.log("⚠️  警告：即将转移 92% 的代币到多签钱包");
    console.log("⚠️  请确认 Safe 地址正确！");
    console.log();
    
    // 执行转移
    console.log("开始转移...\n");
    
    try {
        // 1. 转移社区份额
        console.log("1️⃣ 转移社区份额...");
        const tx1 = await token.transfer(SAFE_ADDRESS, allocations.community);
        await tx1.wait();
        console.log("✅ 社区份额已转移");
        console.log("   交易:", tx1.hash);
        
        // 2. 转移国库份额
        console.log("\n2️⃣ 转移国库份额...");
        const tx2 = await token.transfer(SAFE_ADDRESS, allocations.treasury);
        await tx2.wait();
        console.log("✅ 国库份额已转移");
        console.log("   交易:", tx2.hash);
        
        // 3. 转移开发者份额
        console.log("\n3️⃣ 转移开发者份额...");
        const tx3 = await token.transfer(SAFE_ADDRESS, allocations.team);
        await tx3.wait();
        console.log("✅ 开发者份额已转移");
        console.log("   交易:", tx3.hash);
        
        // 4. 转移投资人份额
        console.log("\n4️⃣ 转移投资人份额...");
        const tx4 = await token.transfer(SAFE_ADDRESS, allocations.investor);
        await tx4.wait();
        console.log("✅ 投资人份额已转移");
        console.log("   交易:", tx4.hash);
        
        // 验证
        console.log("\n" + "=".repeat(60));
        console.log("验证转移结果");
        console.log("=".repeat(60));
        
        const safeBalance = await token.balanceOf(SAFE_ADDRESS);
        const deployerBalance = await token.balanceOf(deployer.address);
        
        console.log("\nSafe 余额:", hre.ethers.formatEther(safeBalance), "DIAP");
        console.log("部署者余额:", hre.ethers.formatEther(deployerBalance), "DIAP");
        
        if (safeBalance === total) {
            console.log("\n✅ 转移成功！所有代币已安全转移到多签钱包");
        } else {
            console.log("\n⚠️  警告：余额不匹配，请检查");
        }
        
        // 保存记录
        const fs = require('fs');
        const record = {
            timestamp: new Date().toISOString(),
            network: hre.network.name,
            tokenAddress: TOKEN_ADDRESS,
            safeAddress: SAFE_ADDRESS,
            allocations: {
                community: hre.ethers.formatEther(allocations.community),
                treasury: hre.ethers.formatEther(allocations.treasury),
                team: hre.ethers.formatEther(allocations.team),
                investor: hre.ethers.formatEther(allocations.investor)
            },
            transactions: [tx1.hash, tx2.hash, tx3.hash, tx4.hash],
            finalBalance: hre.ethers.formatEther(safeBalance)
        };
        
        if (!fs.existsSync('logs')) {
            fs.mkdirSync('logs', { recursive: true });
        }
        
        fs.writeFileSync(
            `logs/transfer_to_multisig_${Date.now()}.json`,
            JSON.stringify(record, null, 2)
        );
        
        console.log("\n📝 转移记录已保存到 logs/");
        
        console.log("\n📋 下一步操作:");
        console.log("1. 在 Etherscan 上验证所有交易");
        console.log("2. 在 Gnosis Safe UI 中确认余额");
        console.log("3. 更新 emergency/contract_addresses.txt");
        console.log("4. 通知团队成员");
        console.log("5. 转移合约所有权到 Safe");
        
    } catch (error) {
        console.error("\n❌ 转移失败:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
