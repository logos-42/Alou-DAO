const { ethers } = require("hardhat");

async function main() {
    console.log("=== DIAP智能体网络完整部署开始 ===");
    
    // 获取部署者账户
    const [deployer] = await ethers.getSigners();
    console.log("部署者地址:", deployer.address);
    console.log("部署者余额:", ethers.utils.formatEther(await deployer.getBalance()), "ETH");
    
    // 1. 部署DIAPToken
    console.log("\n1. 部署DIAPToken...");
    const DIAPToken = await ethers.getContractFactory("DIAPToken");
    const token = await DIAPToken.deploy();
    await token.deployed();
    console.log("DIAPToken部署地址:", token.address);
    
    // 初始化DIAPToken
    console.log("\n1.1 初始化DIAPToken...");
    await token.initialize();
    console.log("DIAPToken初始化完成");
    
    // 2. 部署DIAPAgentNetwork
    console.log("\n2. 部署DIAPAgentNetwork...");
    const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
    const agentNetwork = await DIAPAgentNetwork.deploy();
    await agentNetwork.deployed();
    console.log("DIAPAgentNetwork部署地址:", agentNetwork.address);
    
    // 初始化DIAPAgentNetwork
    console.log("\n3. 初始化DIAPAgentNetwork...");
    await agentNetwork.initialize(token.address);
    console.log("DIAPAgentNetwork初始化完成");
    
    // 3. 部署DIAPVerification
    console.log("\n4. 部署DIAPVerification...");
    const DIAPVerification = await ethers.getContractFactory("DIAPVerification");
    const verification = await DIAPVerification.deploy();
    await verification.deployed();
    console.log("DIAPVerification部署地址:", verification.address);
    
    // 初始化DIAPVerification
    console.log("\n5. 初始化DIAPVerification...");
    await verification.initialize(agentNetwork.address);
    console.log("DIAPVerification初始化完成");
    
    // 4. 部署DIAPPayment
    console.log("\n6. 部署DIAPPayment...");
    const DIAPPayment = await ethers.getContractFactory("DIAPPayment");
    const payment = await DIAPPayment.deploy();
    await payment.deployed();
    console.log("DIAPPayment部署地址:", payment.address);
    
    // 初始化DIAPPayment
    console.log("\n7. 初始化DIAPPayment...");
    await payment.initialize(token.address, agentNetwork.address);
    console.log("DIAPPayment初始化完成");
    
    // 5. 部署DIAPGovernance (需要TimelockController)
    console.log("\n8. 部署TimelockController...");
    const TimelockController = await ethers.getContractFactory("TimelockController");
    const timelock = await TimelockController.deploy(
        1, // 最小延迟
        [deployer.address], // 管理员列表
        [deployer.address], // 执行者列表
        deployer.address // 取消者
    );
    await timelock.deployed();
    console.log("TimelockController部署地址:", timelock.address);
    
    console.log("\n9. 部署DIAPGovernance...");
    const DIAPGovernance = await ethers.getContractFactory("DIAPGovernance");
    const governance = await DIAPGovernance.deploy(
        token.address,
        timelock.address,
        agentNetwork.address
    );
    await governance.deployed();
    console.log("DIAPGovernance部署地址:", governance.address);
    
    // 输出部署信息
    console.log("\n=== 部署完成 ===");
    console.log("DIAPToken地址:", token.address);
    console.log("DIAPAgentNetwork地址:", agentNetwork.address);
    console.log("DIAPVerification地址:", verification.address);
    console.log("DIAPPayment地址:", payment.address);
    console.log("TimelockController地址:", timelock.address);
    console.log("DIAPGovernance地址:", governance.address);
    
    // 验证部署
    console.log("\n=== 验证部署 ===");
    try {
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
                DIAPToken: {
                    address: token.address,
                    name: tokenName,
                    symbol: tokenSymbol,
                    totalSupply: tokenSupply.toString()
                },
                DIAPAgentNetwork: {
                    address: agentNetwork.address,
                    owner: networkOwner,
                    registrationFee: registrationFee.toString()
                },
                DIAPVerification: {
                    address: verification.address
                },
                DIAPPayment: {
                    address: payment.address
                },
                TimelockController: {
                    address: timelock.address
                },
                DIAPGovernance: {
                    address: governance.address
                }
            }
        };
        
        console.log("\n=== 部署信息 ===");
        console.log(JSON.stringify(deploymentInfo, null, 2));
        
    } catch (error) {
        console.error("验证部署时出错:", error.message);
    }
    
    console.log("\n=== 部署成功 ===");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("部署失败:", error);
        process.exit(1);
    });
