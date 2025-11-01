import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

// ERC1967Proxy ABI (minimal)
const ERC1967_PROXY_ABI = [
    "function implementation() external view returns (address)",
    "function upgradeTo(address newImplementation) external",
    "function upgradeToAndCall(address newImplementation, bytes memory data) external payable"
];

async function main() {
    console.log("=== DIAP智能合约测试网部署开始 ===");
    console.log("正在连接网络...");
    
    try {
        // 先测试网络连接
        const blockNumber = await ethers.provider.getBlockNumber();
        console.log("✅ 网络连接成功，当前区块:", blockNumber);
    } catch (error) {
        console.error("❌ 网络连接失败:", error.message);
        throw error;
    }
    
    console.log("正在获取部署者账户...");
    // 获取部署者账户（必须在getNetwork之前）
    const [deployer] = await ethers.getSigners();
    console.log("✅ 部署者地址:", deployer.address);
    
    console.log("正在获取网络信息...");
    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    console.log("✅ 部署网络:", network.name, "(Chain ID:", network.chainId.toString() + ")");
    
    console.log("正在查询余额...");
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("✅ 部署者余额:", ethers.utils.formatEther(balance), "ETH");
    
    // 检查余额是否足够
    if (balance.lt(ethers.utils.parseEther("0.01"))) {
        console.warn("⚠️  警告: 余额可能不足以支付Gas费用！");
    }
    
    // 代币配置
    const TOKEN_NAME = "DIAP Alou Token";
    const TOKEN_SYMBOL = "DAT";
    
    let tokenAddress = null;
    let tokenImplementationAddress = null;
    let agentNetworkAddress = null;
    let agentNetworkImplementationAddress = null;
    
    try {
        // 1. 部署DIAPToken实现合约
        console.log("\n1. 部署DIAPToken实现合约...");
        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        const tokenImplementation = await DIAPToken.deploy();
        await tokenImplementation.deployed();
        tokenImplementationAddress = tokenImplementation.address;
        console.log("✅ DIAPToken实现地址:", tokenImplementationAddress);
        
        // 2. 编码初始化数据
        console.log("\n2. 编码DIAPToken初始化数据...");
        const tokenInitData = DIAPToken.interface.encodeFunctionData("initialize", [TOKEN_NAME, TOKEN_SYMBOL]);
        
        // 3. 部署ERC1967Proxy
        console.log("\n3. 部署ERC1967Proxy (DIAPToken)...");
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const tokenProxy = await ERC1967Proxy.deploy(tokenImplementationAddress, tokenInitData);
        await tokenProxy.deployed();
        tokenAddress = tokenProxy.address;
        console.log("✅ DIAPToken代理地址:", tokenAddress);
        
        // 4. 连接到代理合约
        const token = DIAPToken.attach(tokenAddress);
        
        // 5. 部署DIAPAgentNetwork实现合约
        console.log("\n4. 部署DIAPAgentNetwork实现合约...");
        const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
        const agentNetworkImplementation = await DIAPAgentNetwork.deploy();
        await agentNetworkImplementation.deployed();
        agentNetworkImplementationAddress = agentNetworkImplementation.address;
        console.log("✅ DIAPAgentNetwork实现地址:", agentNetworkImplementationAddress);
        
        // 6. 编码初始化数据
        console.log("\n5. 编码DIAPAgentNetwork初始化数据...");
        const networkInitData = DIAPAgentNetwork.interface.encodeFunctionData("initialize", [tokenAddress]);
        
        // 7. 部署ERC1967Proxy
        console.log("\n6. 部署ERC1967Proxy (DIAPAgentNetwork)...");
        const networkProxy = await ERC1967Proxy.deploy(agentNetworkImplementationAddress, networkInitData);
        await networkProxy.deployed();
        agentNetworkAddress = networkProxy.address;
        console.log("✅ DIAPAgentNetwork代理地址:", agentNetworkAddress);
        
        // 8. 连接到代理合约
        const agentNetwork = DIAPAgentNetwork.attach(agentNetworkAddress);
        
        // 9. 验证部署
        console.log("\n=== 验证部署 ===");
        const tokenName = await token.name();
        const tokenSymbol = await token.symbol();
        const tokenSupply = await token.totalSupply();
        
        console.log("代币名称:", tokenName);
        console.log("代币符号:", tokenSymbol);
        console.log("代币总供应量:", ethers.utils.formatEther(tokenSupply), "DAT");
        
        const networkOwner = await agentNetwork.owner();
        const registrationFee = await agentNetwork.registrationFee();
        const tokenContract = await agentNetwork.token();
        
        console.log("网络合约所有者:", networkOwner);
        console.log("注册费用:", ethers.utils.formatEther(registrationFee), "DAT");
        console.log("关联代币合约:", tokenContract);
        
        // 验证代币地址匹配
        if (tokenContract.toLowerCase() !== tokenAddress.toLowerCase()) {
            throw new Error("代币地址不匹配！");
        }
        console.log("✅ 代币地址验证通过");
        
        // 10. 保存部署信息
        const deploymentInfo = {
            network: network.name,
            chainId: network.chainId.toString(),
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                DIAPToken: {
                    proxyAddress: tokenAddress,
                    implementationAddress: tokenImplementationAddress,
                    name: tokenName,
                    symbol: tokenSymbol,
                    totalSupply: tokenSupply.toString()
                },
                DIAPAgentNetwork: {
                    proxyAddress: agentNetworkAddress,
                    implementationAddress: agentNetworkImplementationAddress,
                    owner: networkOwner,
                    registrationFee: registrationFee.toString(),
                    tokenAddress: tokenContract
                }
            }
        };
        
        // 保存到文件
        const deploymentDir = path.join(process.cwd(), "deployments");
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        
        const fileName = `deployment_${network.name}_${Date.now()}.json`;
        const filePath = path.join(deploymentDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n=== 部署信息已保存 ===");
        console.log("文件路径:", filePath);
        console.log("\n=== 部署摘要 ===");
        console.log(JSON.stringify(deploymentInfo, null, 2));
        
        console.log("\n✅ 部署成功！");
        console.log("\n📝 下一步:");
        console.log("1. 在区块浏览器验证合约源码:");
        const chainIdStr = network.chainId.toString();
        if (chainIdStr === "11155111") {
            console.log(`   DIAPToken实现: https://sepolia.etherscan.io/address/${tokenImplementationAddress}`);
            console.log(`   DIAPToken代理: https://sepolia.etherscan.io/address/${tokenAddress}`);
            console.log(`   DIAPAgentNetwork实现: https://sepolia.etherscan.io/address/${agentNetworkImplementationAddress}`);
            console.log(`   DIAPAgentNetwork代理: https://sepolia.etherscan.io/address/${agentNetworkAddress}`);
            console.log(`   运行验证: npx hardhat verify --network sepolia ${tokenImplementationAddress}`);
            console.log(`   运行验证: npx hardhat verify --network sepolia ${agentNetworkImplementationAddress}`);
        } else if (chainIdStr === "84532") {
            console.log(`   DIAPToken实现: https://sepolia.basescan.org/address/${tokenImplementationAddress}`);
            console.log(`   DIAPToken代理: https://sepolia.basescan.org/address/${tokenAddress}`);
            console.log(`   DIAPAgentNetwork实现: https://sepolia.basescan.org/address/${agentNetworkImplementationAddress}`);
            console.log(`   DIAPAgentNetwork代理: https://sepolia.basescan.org/address/${agentNetworkAddress}`);
            console.log(`   运行验证: npx hardhat verify --network baseSepolia ${tokenImplementationAddress}`);
            console.log(`   运行验证: npx hardhat verify --network baseSepolia ${agentNetworkImplementationAddress}`);
        }
        console.log("2. 将代理地址添加到前端配置");
        console.log("3. 测试合约功能");
        
    } catch (error) {
        console.error("\n❌ 部署失败:", error);
        
        // 如果部分部署成功，保存部分信息
        if (tokenAddress || agentNetworkAddress) {
            const partialInfo = {
                network: network.name,
                chainId: network.chainId.toString(),
                timestamp: new Date().toISOString(),
                deployer: deployer.address,
                error: error.message,
                partialDeployment: {
                    tokenAddress,
                    tokenImplementationAddress,
                    agentNetworkAddress,
                    agentNetworkImplementationAddress
                }
            };
            
            const deploymentDir = path.join(process.cwd(), "deployments");
            if (!fs.existsSync(deploymentDir)) {
                fs.mkdirSync(deploymentDir, { recursive: true });
            }
            
            const fileName = `deployment_error_${network.name}_${Date.now()}.json`;
            const filePath = path.join(deploymentDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(partialInfo, null, 2));
            console.log("部分部署信息已保存到:", filePath);
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
