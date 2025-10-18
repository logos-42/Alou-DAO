const { ethers } = require("hardhat");

async function main() {
    console.log("=== DIAP智能体网络部署开始 ===");
    
    // 获取部署者账户
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("部署者余额:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    
    // 部署DIAPTokenSimple
    console.log("\n1. 部署DIAPTokenSimple...");
    const DIAPTokenSimple = await ethers.getContractFactory("DIAPTokenSimple");
    const token = await DIAPTokenSimple.deploy();
    await token.deployed();
    console.log("DIAPTokenSimple部署地址:", token.address);
    
    // 部署DIAPAgentNetworkSimple
    console.log("\n2. 部署DIAPAgentNetworkSimple...");
    const DIAPAgentNetworkSimple = await ethers.getContractFactory("DIAPAgentNetworkSimple");
    const agentNetwork = await DIAPAgentNetworkSimple.deploy();
    await agentNetwork.deployed();
    console.log("DIAPAgentNetworkSimple部署地址:", agentNetwork.address);
    
    // 输出部署信息
    console.log("\n=== 部署完成 ===");
    console.log("代币合约地址:", token.address);
    console.log("智能体网络合约地址:", agentNetwork.address);
    
    // 验证部署
    console.log("\n=== 验证部署 ===");
    const tokenName = await token.name();
    const tokenSymbol = await token.symbol();
    const tokenSupply = await token.totalSupply();
    
    console.log("代币名称:", tokenName);
    console.log("代币符号:", tokenSymbol);
    console.log("代币总供应量:", ethers.utils.formatEther(tokenSupply), "DIAP");
    
    const networkOwner = await agentNetwork.owner();
    const registrationFee = await agentNetwork.registrationFee();
    
    console.log("网络合约所有者:", networkOwner);
    console.log("注册费用:", ethers.utils.formatEther(registrationFee), "ETH");
    
    // 保存部署信息
    const deploymentInfo = {
        network: "hardhat",
        timestamp: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            DIAPTokenSimple: {
                address: token.address,
                name: tokenName,
                symbol: tokenSymbol,
                totalSupply: tokenSupply.toString()
            },
            DIAPAgentNetworkSimple: {
                address: agentNetwork.address,
                owner: networkOwner,
                registrationFee: registrationFee.toString()
            }
        }
    };
    
    console.log("\n=== 部署信息 ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));
    
    console.log("\n=== 部署成功 ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });
