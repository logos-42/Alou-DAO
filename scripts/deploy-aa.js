// 部署 ERC-4337 相关合约的脚本
const hre = require("hardhat");

async function main() {
    console.log("开始部署 DIAP ERC-4337 合约...\n");

    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    console.log("账户余额:", (await deployer.getBalance()).toString(), "\n");

    // EntryPoint 地址（使用官方部署的地址）
    // 主网和测试网都使用相同的地址
    const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
    console.log("使用 EntryPoint 地址:", ENTRY_POINT_ADDRESS, "\n");

    // 1. 部署 DIAPAccountFactory
    console.log("1. 部署 DIAPAccountFactory...");
    const DIAPAccountFactory = await ethers.getContractFactory("DIAPAccountFactory");
    const accountFactory = await DIAPAccountFactory.deploy(ENTRY_POINT_ADDRESS);
    await accountFactory.deployed();
    console.log("✓ DIAPAccountFactory 部署到:", accountFactory.address);
    
    // 获取 accountImplementation 地址
    const accountImplementation = await accountFactory.accountImplementation();
    console.log("✓ DIAPAccount 实现合约:", accountImplementation, "\n");

    // 2. 部署 DIAPPaymaster
    console.log("2. 部署 DIAPPaymaster...");
    const DIAPPaymaster = await ethers.getContractFactory("DIAPPaymaster");
    const paymaster = await DIAPPaymaster.deploy(ENTRY_POINT_ADDRESS);
    await paymaster.deployed();
    console.log("✓ DIAPPaymaster 部署到:", paymaster.address, "\n");

    // 3. 配置 Paymaster
    console.log("3. 配置 Paymaster...");
    
    // 设置默认每日配额（0.01 ETH）
    const defaultQuota = ethers.utils.parseEther("0.01");
    await paymaster.setDefaultDailyQuota(defaultQuota);
    console.log("✓ 设置默认每日配额:", ethers.utils.formatEther(defaultQuota), "ETH");
    
    // 添加存款到 EntryPoint（用于支付 Gas）
    const depositAmount = ethers.utils.parseEther("0.1");
    await paymaster.addDeposit({ value: depositAmount });
    console.log("✓ 添加存款到 EntryPoint:", ethers.utils.formatEther(depositAmount), "ETH\n");

    // 4. 部署摘要
    console.log("=" .repeat(60));
    console.log("部署完成！\n");
    console.log("合约地址:");
    console.log("  EntryPoint:           ", ENTRY_POINT_ADDRESS);
    console.log("  DIAPAccountFactory:   ", accountFactory.address);
    console.log("  DIAPAccount (实现):   ", accountImplementation);
    console.log("  DIAPPaymaster:        ", paymaster.address);
    console.log("=" .repeat(60));
    console.log("\n下一步:");
    console.log("1. 在 DIAPAgentNetwork 中设置 AccountFactory 地址:");
    console.log(`   agentNetwork.setAccountFactory("${accountFactory.address}")`);
    console.log("\n2. 配置 Paymaster 白名单:");
    console.log("   - 添加 DIAP 生态合约到目标白名单");
    console.log("   - 添加智能体账户到账户白名单");
    console.log("\n3. 配置前端 SDK:");
    console.log("   - EntryPoint:", ENTRY_POINT_ADDRESS);
    console.log("   - Factory:", accountFactory.address);
    console.log("   - Paymaster:", paymaster.address);
    console.log("=" .repeat(60));

    // 保存部署信息到文件
    const deploymentInfo = {
        network: hre.network.name,
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            entryPoint: ENTRY_POINT_ADDRESS,
            accountFactory: accountFactory.address,
            accountImplementation: accountImplementation,
            paymaster: paymaster.address
        },
        configuration: {
            defaultDailyQuota: ethers.utils.formatEther(defaultQuota),
            initialDeposit: ethers.utils.formatEther(depositAmount)
        }
    };

    const fs = require("fs");
    const path = require("path");
    const deploymentsDir = path.join(__dirname, "../deployments");
    
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir, { recursive: true });
    }
    
    const filename = `aa-deployment-${hre.network.name}-${Date.now()}.json`;
    fs.writeFileSync(
        path.join(deploymentsDir, filename),
        JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(`\n部署信息已保存到: deployments/${filename}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
