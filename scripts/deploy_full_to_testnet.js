import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

async function updateEmergencyAddresses(deploymentInfo) {
    const emergencyDir = path.join(process.cwd(), "emergency");
    const targetFile = path.join(emergencyDir, "contract_addresses.txt");

    const contracts = deploymentInfo.contracts || {};
    const token = contracts.DIAPToken || {};
    const agentNetwork = contracts.DIAPAgentNetwork || {};
    const verification = contracts.DIAPVerification || {};
    const paymentCore = contracts.DIAPPaymentCore || {};
    const paymentChannel = contracts.DIAPPaymentChannel || {};
    const paymentPrivacy = contracts.DIAPPaymentPrivacy || {};
    const governance = contracts.DIAPGovernance || {};
    const timelock = contracts.TimelockController || {};
    const accountFactory = contracts.DIAPAccountFactory || {};
    const paymaster = contracts.DIAPPaymaster || {};

    const timestamp = deploymentInfo.timestamp || new Date().toISOString();
    const dateStr = timestamp.split("T")[0];

    const explorer = (address) =>
        address ? `https://sepolia.etherscan.io/address/${address}` : "N/A";

    const sepoliaCoreSection = [
        "--- 核心合约 (Sepolia) ---",
        "",
        "DIAPToken:",
        `代理地址: ${token.proxyAddress || "N/A"}`,
        `实现地址: ${token.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(token.proxyAddress)}`,
        "",
        "DIAPAgentNetwork:",
        `代理地址: ${agentNetwork.proxyAddress || "N/A"}`,
        `实现地址: ${agentNetwork.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(agentNetwork.proxyAddress)}`,
        "",
        "DIAPVerification:",
        `代理地址: ${verification.proxyAddress || "N/A"}`,
        `实现地址: ${verification.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(verification.proxyAddress)}`,
        "",
        "DIAPPaymentCore:",
        `代理地址: ${paymentCore.proxyAddress || "N/A"}`,
        `实现地址: ${paymentCore.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(paymentCore.proxyAddress)}`,
        "",
        "DIAPPaymentChannel:",
        `代理地址: ${paymentChannel.proxyAddress || "N/A"}`,
        `实现地址: ${paymentChannel.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(paymentChannel.proxyAddress)}`,
        "",
        "DIAPPaymentPrivacy:",
        `代理地址: ${paymentPrivacy.proxyAddress || "N/A"}`,
        `实现地址: ${paymentPrivacy.implementationAddress || "N/A"}`,
        `区块浏览器: ${explorer(paymentPrivacy.proxyAddress)}`,
        "",
        "DIAPGovernance:",
        `地址: ${governance.address || "N/A"}`,
        `区块浏览器: ${explorer(governance.address)}`,
        "",
        "TimelockController:",
        `地址: ${timelock.address || "N/A"}`,
        `区块浏览器: ${explorer(timelock.address)}`
    ].join("\n");

    const accountImplementation = accountFactory.accountImplementation || "N/A";
    const erc4337Section = [
        "--- ERC-4337 合约 ---",
        "",
        "DIAPAccountFactory:",
        `地址: ${accountFactory.address || "N/A"}`,
        `DIAPAccount实现: ${accountImplementation}`,
        `EntryPoint: ${accountFactory.entryPoint || "N/A"}`,
        `区块浏览器: ${explorer(accountFactory.address)}`,
        "",
        "DIAPPaymaster:",
        `地址: ${paymaster.address || "N/A"}`,
        `EntryPoint: ${paymaster.entryPoint || "N/A"}`,
        `区块浏览器: ${explorer(paymaster.address)}`
    ].join("\n");

    let baseSection = "";

    try {
        const original = await fs.promises.readFile(targetFile, "utf8");
        const baseIndex = original.indexOf("--- 核心合约 (Base Sepolia) ---");
        if (baseIndex !== -1) {
            baseSection = original.slice(baseIndex).trimEnd();
            baseSection = baseSection
                .replace(/Sepolia 部署时间:\s*.*/, `Sepolia 部署时间: ${timestamp}`)
                .replace(/日期:\s*.*/, `日期: ${dateStr}`);
        }
    } catch (error) {
        // 如果文件不存在，则保留空的 baseSection
    }

    const header = [
        "=== DIAP 合约地址 ===",
        "",
        "网络: Sepolia 测试网 (Ethereum)",
        "Chain ID: 11155111",
        `部署者: ${deploymentInfo.deployer || "N/A"}`,
        `部署时间: ${timestamp}`,
        ""
    ].join("\n");

    let finalContent = [
        header,
        sepoliaCoreSection,
        "",
        erc4337Section
    ].join("\n");

    if (baseSection) {
        finalContent = `${finalContent}\n\n${baseSection}`;
    }

    // 如果 baseSection 原本为空，生成一个默认尾部
    if (!baseSection) {
        finalContent = `${finalContent}\n\n--- 部署信息 ---\n\n部署者地址: ${
            deploymentInfo.deployer || "N/A"
        }\n\nSepolia 部署时间: ${timestamp}\n\n--- RPC URLs ---\n\nSepolia: https://ethereum-sepolia-rpc.publicnode.com (推荐)\n\n--- 区块浏览器 ---\n\nSepolia Etherscan: https://sepolia.etherscan.io\n\n--- 最后更新 ---\n\n日期: ${dateStr}\n版本: v0.4.0 (包含ERC-4337)\n状态: 测试网部署完成\n`;
    }

    await fs.promises.writeFile(targetFile, `${finalContent}\n`);
    console.log("✅ 已更新 emergency/contract_addresses.txt");
}

async function deployUUPSProxy(contractFactory, implementationName, initArgs, initFunction) {
    console.log(`\n部署${implementationName}实现合约...`);
    const implementation = await contractFactory.deploy();
    console.log(`   交易已发送，等待确认... (哈希: ${implementation.deployTransaction.hash})`);
    
    let implementationAddress;
    
    try {
        const implTx = await implementation.deployTransaction.wait(2); // 等待2个确认
        implementationAddress = implementation.address;
        console.log(`✅ ${implementationName}实现地址:`, implementationAddress);
        console.log(`   交易哈希: ${implTx.transactionHash}`);
        
        // 验证实现合约已部署（等待并重试）
        let code = await ethers.provider.getCode(implementationAddress);
        let retries = 5;
        while (code === "0x" && retries > 0) {
            console.log(`   等待合约代码... (剩余重试: ${retries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
            code = await ethers.provider.getCode(implementationAddress);
            retries--;
        }
        
        if (code === "0x") {
            throw new Error(`${implementationName}实现合约部署失败：地址没有代码`);
        }
    } catch (error) {
        if (error.message.includes("insufficient funds")) {
            const balance = await ethers.provider.getBalance(implementation.deployTransaction.from);
            throw new Error(`余额不足！无法部署${implementationName}。当前余额: ${ethers.utils.formatEther(balance)} ETH`);
        }
        throw error;
    }
    
    console.log(`编码${implementationName}初始化数据...`);
    const initData = contractFactory.interface.encodeFunctionData(initFunction, initArgs);
    
    console.log(`部署ERC1967Proxy (${implementationName})...`);
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await ERC1967Proxy.deploy(implementationAddress, initData);
    console.log(`   交易已发送，等待确认... (哈希: ${proxy.deployTransaction.hash})`);
    const proxyTx = await proxy.deployTransaction.wait(2); // 等待2个确认
    const proxyAddress = proxy.address;
    console.log(`✅ ${implementationName}代理地址:`, proxyAddress);
    console.log(`   交易哈希: ${proxyTx.transactionHash}`);
    
    return {
        implementationAddress,
        proxyAddress,
        contract: contractFactory.attach(proxyAddress)
    };
}

async function main() {
    console.log("=== DIAP完整智能合约测试网部署开始 ===");
    console.log("正在连接网络...");
    
    try {
        const blockNumber = await ethers.provider.getBlockNumber();
        console.log("✅ 网络连接成功，当前区块:", blockNumber);
    } catch (error) {
        console.error("❌ 网络连接失败:", error.message);
        throw error;
    }
    
    const [deployer] = await ethers.getSigners();
    console.log("✅ 部署者地址:", deployer.address);
    
    const network = await ethers.provider.getNetwork();
    console.log("✅ 部署网络:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("✅ 部署者余额:", ethers.utils.formatEther(balance), "ETH");
    
    if (balance.lt(ethers.utils.parseEther("0.01"))) {
        console.warn("⚠️  警告: 余额可能不足以支付Gas费用！");
    }
    
    const TOKEN_NAME = "DIAP Alou Token";
    const TOKEN_SYMBOL = "DAT";
    
    const deploymentInfo = {
        network: network.name,
        chainId: network.chainId.toString(),
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {}
    };
    
    try {
        // 1. 部署DIAPToken
        console.log("\n" + "=".repeat(60));
        console.log("1. 部署DIAPToken");
        console.log("=".repeat(60));
        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        const tokenDeployment = await deployUUPSProxy(
            DIAPToken,
            "DIAPToken",
            [TOKEN_NAME, TOKEN_SYMBOL],
            "initialize"
        );
        const token = tokenDeployment.contract;
        
        deploymentInfo.contracts.DIAPToken = {
            proxyAddress: tokenDeployment.proxyAddress,
            implementationAddress: tokenDeployment.implementationAddress,
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            totalSupply: (await token.totalSupply()).toString()
        };
        
        // 2. 部署DIAPAgentNetwork
        console.log("\n" + "=".repeat(60));
        console.log("2. 部署DIAPAgentNetwork");
        console.log("=".repeat(60));
        const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
        const networkDeployment = await deployUUPSProxy(
            DIAPAgentNetwork,
            "DIAPAgentNetwork",
            [tokenDeployment.proxyAddress],
            "initialize"
        );
        const agentNetwork = networkDeployment.contract;
        
        deploymentInfo.contracts.DIAPAgentNetwork = {
            proxyAddress: networkDeployment.proxyAddress,
            implementationAddress: networkDeployment.implementationAddress,
            owner: await agentNetwork.owner(),
            registrationFee: (await agentNetwork.registrationFee()).toString(),
            tokenAddress: tokenDeployment.proxyAddress
        };
        
        // 3. 部署DIAPVerification
        console.log("\n" + "=".repeat(60));
        console.log("3. 部署DIAPVerification");
        console.log("=".repeat(60));
        const DIAPVerification = await ethers.getContractFactory("DIAPVerification");
        const verificationDeployment = await deployUUPSProxy(
            DIAPVerification,
            "DIAPVerification",
            [networkDeployment.proxyAddress],
            "initialize"
        );
        
        deploymentInfo.contracts.DIAPVerification = {
            proxyAddress: verificationDeployment.proxyAddress,
            implementationAddress: verificationDeployment.implementationAddress
        };
        
        // 4. 部署DIAPPaymentCore
        console.log("\n" + "=".repeat(60));
        console.log("4. 部署DIAPPaymentCore");
        console.log("=".repeat(60));
        const DIAPPaymentCore = await ethers.getContractFactory("DIAPPaymentCore");
        const paymentCoreDeployment = await deployUUPSProxy(
            DIAPPaymentCore,
            "DIAPPaymentCore",
            [tokenDeployment.proxyAddress, networkDeployment.proxyAddress],
            "initialize"
        );
        
        deploymentInfo.contracts.DIAPPaymentCore = {
            proxyAddress: paymentCoreDeployment.proxyAddress,
            implementationAddress: paymentCoreDeployment.implementationAddress
        };
        
        // 5. 部署DIAPPaymentChannel
        console.log("\n" + "=".repeat(60));
        console.log("5. 部署DIAPPaymentChannel");
        console.log("=".repeat(60));
        const DIAPPaymentChannel = await ethers.getContractFactory("DIAPPaymentChannel");
        const paymentChannelDeployment = await deployUUPSProxy(
            DIAPPaymentChannel,
            "DIAPPaymentChannel",
            [tokenDeployment.proxyAddress, networkDeployment.proxyAddress],
            "initialize"
        );
        
        deploymentInfo.contracts.DIAPPaymentChannel = {
            proxyAddress: paymentChannelDeployment.proxyAddress,
            implementationAddress: paymentChannelDeployment.implementationAddress
        };
        
        // 6. 部署DIAPPaymentPrivacy
        console.log("\n" + "=".repeat(60));
        console.log("6. 部署DIAPPaymentPrivacy");
        console.log("=".repeat(60));
        const DIAPPaymentPrivacy = await ethers.getContractFactory("DIAPPaymentPrivacy");
        const paymentPrivacyDeployment = await deployUUPSProxy(
            DIAPPaymentPrivacy,
            "DIAPPaymentPrivacy",
            [tokenDeployment.proxyAddress],
            "initialize"
        );
        
        deploymentInfo.contracts.DIAPPaymentPrivacy = {
            proxyAddress: paymentPrivacyDeployment.proxyAddress,
            implementationAddress: paymentPrivacyDeployment.implementationAddress
        };
        
        // 7. 部署DIAPGovernance (不是UUPS，需要直接部署)
        console.log("\n" + "=".repeat(60));
        console.log("7. 部署TimelockController");
        console.log("=".repeat(60));
        const TimelockController = await ethers.getContractFactory("TimelockController");
        const timelock = await TimelockController.deploy(
            1, // 最小延迟
            [deployer.address], // 管理员列表
            [deployer.address], // 执行者列表
            deployer.address // 取消者
        );
        await timelock.deployed();
        console.log("✅ TimelockController地址:", timelock.address);
        
        console.log("\n" + "=".repeat(60));
        console.log("8. 部署DIAPGovernance");
        console.log("=".repeat(60));
        const DIAPGovernance = await ethers.getContractFactory("DIAPGovernance");
        const governance = await DIAPGovernance.deploy(
            tokenDeployment.proxyAddress,
            timelock.address,
            networkDeployment.proxyAddress
        );
        await governance.deployed();
        console.log("✅ DIAPGovernance地址:", governance.address);
        
        deploymentInfo.contracts.TimelockController = {
            address: timelock.address
        };
        
        deploymentInfo.contracts.DIAPGovernance = {
            address: governance.address
        };
        
        // 9. 部署ERC-4337相关合约
        console.log("\n" + "=".repeat(60));
        console.log("9. 部署ERC-4337合约");
        console.log("=".repeat(60));
        const ENTRY_POINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
        console.log("使用EntryPoint地址:", ENTRY_POINT_ADDRESS);
        
        console.log("\n9.1 部署DIAPAccountFactory...");
        const DIAPAccountFactory = await ethers.getContractFactory("DIAPAccountFactory");
        const accountFactory = await DIAPAccountFactory.deploy(ENTRY_POINT_ADDRESS);
        await accountFactory.deployed();
        console.log("✅ DIAPAccountFactory地址:", accountFactory.address);
        
        const accountImplementation = await accountFactory.ACCOUNT_IMPLEMENTATION();
        console.log("✅ DIAPAccount实现地址:", accountImplementation);
        
        deploymentInfo.contracts.DIAPAccountFactory = {
            address: accountFactory.address,
            accountImplementation: accountImplementation,
            entryPoint: ENTRY_POINT_ADDRESS
        };
        
        console.log("\n9.2 部署DIAPPaymaster...");
        const DIAPPaymaster = await ethers.getContractFactory("DIAPPaymaster");
        const paymaster = await DIAPPaymaster.deploy(ENTRY_POINT_ADDRESS);
        await paymaster.deployed();
        console.log("✅ DIAPPaymaster地址:", paymaster.address);
        
        deploymentInfo.contracts.DIAPPaymaster = {
            address: paymaster.address,
            entryPoint: ENTRY_POINT_ADDRESS
        };
        
        // 配置AgentNetwork的AccountFactory
        console.log("\n9.3 配置AgentNetwork的AccountFactory...");
        await agentNetwork.setAccountFactory(accountFactory.address);
        console.log("✅ 已设置AccountFactory地址");
        
        // 保存部署信息
        const deploymentDir = path.join(process.cwd(), "deployments");
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        const fileName = `deployment_full_${network.name}_${Date.now()}.json`;
        const filePath = path.join(deploymentDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(60));
        console.log("✅ 所有合约部署完成！");
        console.log("=".repeat(60));
        console.log("\n部署信息已保存:", filePath);
        console.log("\n=== 部署摘要 ===");
        console.log(JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n📝 下一步:");
        console.log("1. 将以下地址填入.env文件:");
        console.log(`   DIAP_TOKEN_ADDRESS=${tokenDeployment.proxyAddress}`);
        console.log(`   DIAP_NETWORK_ADDRESS=${networkDeployment.proxyAddress}`);
        console.log(`   DIAP_VERIFICATION_ADDRESS=${verificationDeployment.proxyAddress}`);
        console.log(`   DIAP_PAYMENT_CORE_ADDRESS=${paymentCoreDeployment.proxyAddress}`);
        console.log(`   DIAP_PAYMENT_CHANNEL_ADDRESS=${paymentChannelDeployment.proxyAddress}`);
        console.log(`   DIAP_PAYMENT_PRIVACY_ADDRESS=${paymentPrivacyDeployment.proxyAddress}`);
        console.log(`   DIAP_GOVERNANCE_ADDRESS=${governance.address}`);
        console.log(`   DIAP_ACCOUNT_FACTORY_ADDRESS=${accountFactory.address}`);
        console.log(`   DIAP_PAYMASTER_ADDRESS=${paymaster.address}`);
        console.log(`   ENTRY_POINT_ADDRESS=${ENTRY_POINT_ADDRESS}`);
        
        // 更新紧急地址文件
        console.log("\n2. 更新紧急地址文件...");
        await updateEmergencyAddresses(deploymentInfo);
        console.log("✅ 已更新emergency/contract_addresses.txt");
        
        const chainIdStr = network.chainId.toString();
        if (chainIdStr === "84532") {
            console.log("\n2. 验证合约源码:");
            console.log(`   npx hardhat verify --network baseSepolia ${tokenDeployment.implementationAddress} "${TOKEN_NAME}" "${TOKEN_SYMBOL}"`);
            console.log(`   npx hardhat verify --network baseSepolia ${networkDeployment.implementationAddress} ${tokenDeployment.proxyAddress}`);
        }
        
    } catch (error) {
        console.error("\n❌ 部署失败:", error);
        console.log("部分部署信息:", JSON.stringify(deploymentInfo, null, 2));
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署脚本错误:", error);
        process.exit(1);
    });

