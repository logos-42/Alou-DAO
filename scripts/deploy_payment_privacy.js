import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

async function main() {
    console.log("=== 部署DIAPPaymentPrivacy ===");
    
    // 从之前的部署中获取已部署的地址
    // 这些地址来自上次成功的部署
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
        // 部署实现合约
        console.log("\n部署DIAPPaymentPrivacy实现合约...");
        const DIAPPaymentPrivacy = await ethers.getContractFactory("DIAPPaymentPrivacy");
        const implementation = await DIAPPaymentPrivacy.deploy();
        console.log("   交易已发送，等待确认... (哈希:", implementation.deployTransaction.hash + ")");
        
        const implTx = await implementation.deployTransaction.wait(2);
        const implementationAddress = implementation.address;
        console.log("✅ DIAPPaymentPrivacy实现地址:", implementationAddress);
        console.log("   交易哈希:", implTx.transactionHash);
        
        // 验证实现合约已部署
        let code = await ethers.provider.getCode(implementationAddress);
        let retries = 5;
        while (code === "0x" && retries > 0) {
            console.log(`   等待合约代码... (剩余重试: ${retries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            code = await ethers.provider.getCode(implementationAddress);
            retries--;
        }
        
        if (code === "0x") {
            throw new Error("实现合约部署失败：地址没有代码");
        }
        
        // 编码初始化数据
        console.log("\n编码DIAPPaymentPrivacy初始化数据...");
        const initData = DIAPPaymentPrivacy.interface.encodeFunctionData("initialize", [TOKEN_ADDRESS]);
        
        // 部署代理
        console.log("部署ERC1967Proxy (DIAPPaymentPrivacy)...");
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const proxy = await ERC1967Proxy.deploy(implementationAddress, initData);
        console.log("   交易已发送，等待确认... (哈希:", proxy.deployTransaction.hash + ")");
        
        const proxyTx = await proxy.deployTransaction.wait(2);
        const proxyAddress = proxy.address;
        console.log("✅ DIAPPaymentPrivacy代理地址:", proxyAddress);
        console.log("   交易哈希:", proxyTx.transactionHash);
        
        // 验证部署
        const privacyContract = DIAPPaymentPrivacy.attach(proxyAddress);
        const owner = await privacyContract.owner();
        console.log("\n✅ 部署验证:");
        console.log("   所有者:", owner);
        console.log("   代理地址:", proxyAddress);
        console.log("   实现地址:", implementationAddress);
        
        // 保存部署信息
        const deploymentInfo = {
            network: "baseSepolia",
            chainId: "84532",
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                DIAPPaymentPrivacy: {
                    proxyAddress: proxyAddress,
                    implementationAddress: implementationAddress,
                    tokenAddress: TOKEN_ADDRESS
                }
            }
        };
        
        const deploymentDir = path.join(process.cwd(), "deployments");
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        const fileName = `deployment_payment_privacy_${Date.now()}.json`;
        const filePath = path.join(deploymentDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n" + "=".repeat(60));
        console.log("✅ DIAPPaymentPrivacy部署成功！");
        console.log("=".repeat(60));
        console.log("\n部署信息已保存:", filePath);
        console.log("\n请更新.env文件:");
        console.log(`DIAP_PAYMENT_PRIVACY_ADDRESS=${proxyAddress}`);
        
        const network = await ethers.provider.getNetwork();
        const chainIdStr = network.chainId.toString();
        if (chainIdStr === "84532") {
            console.log("\n验证合约源码:");
            console.log(`npx hardhat verify --network baseSepolia ${implementationAddress}`);
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

