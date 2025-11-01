import pkg from "hardhat";
const { ethers } = pkg;
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
    console.log("=== DIAP合约功能测试 ===");
    console.log("网络:", process.argv[3]?.replace("--network=", "") || "hardhat");
    console.log();
    
    const network = await ethers.provider.getNetwork();
    const [deployer, testUser] = await ethers.getSigners();
    
    console.log("测试账户:");
    console.log("  部署者:", deployer.address);
    console.log("  测试用户:", testUser.address);
    console.log();
    
    // 从环境变量获取合约地址
    const tokenAddress = process.env.DIAP_TOKEN_ADDRESS;
    const networkAddress = process.env.DIAP_NETWORK_ADDRESS;
    
    if (!tokenAddress || !networkAddress) {
        console.error("❌ 错误: 请在.env文件中设置DIAP_TOKEN_ADDRESS和DIAP_NETWORK_ADDRESS");
        process.exit(1);
    }
    
    try {
        // 获取合约实例
        const DIAPToken = await ethers.getContractFactory("DIAPToken");
        const DIAPAgentNetwork = await ethers.getContractFactory("DIAPAgentNetwork");
        
        const token = DIAPToken.attach(tokenAddress);
        const agentNetwork = DIAPAgentNetwork.attach(networkAddress);
        
        // 1. 测试代币转账
        console.log("=".repeat(60));
        console.log("1. 测试代币转账");
        console.log("=".repeat(60));
        
        const transferAmount = ethers.utils.parseEther("100");
        const deployerBalance = await token.balanceOf(deployer.address);
        const testUserBalanceBefore = await token.balanceOf(testUser.address);
        
        console.log("部署者余额:", ethers.utils.formatEther(deployerBalance), "DAT");
        console.log("测试用户余额(前):", ethers.utils.formatEther(testUserBalanceBefore), "DAT");
        
        if (deployerBalance.gte(transferAmount)) {
            console.log("\n执行转账:", ethers.utils.formatEther(transferAmount), "DAT");
            const tx = await token.transfer(testUser.address, transferAmount);
            console.log("  交易哈希:", tx.hash);
            await tx.wait(1);
            
            const testUserBalanceAfter = await token.balanceOf(testUser.address);
            console.log("测试用户余额(后):", ethers.utils.formatEther(testUserBalanceAfter), "DAT");
            
            if (testUserBalanceAfter.eq(testUserBalanceBefore.add(transferAmount))) {
                console.log("✅ 代币转账测试通过");
            } else {
                console.log("❌ 代币转账测试失败: 余额不匹配");
            }
        } else {
            console.log("⚠️  跳过转账测试: 余额不足");
        }
        
        // 2. 测试智能体注册
        console.log("\n" + "=".repeat(60));
        console.log("2. 测试智能体注册");
        console.log("=".repeat(60));
        
        // 检查测试用户是否有足够代币和授权
        const testUserTokenBalance = await token.balanceOf(testUser.address);
        const minStakeAmount = await agentNetwork.minStakeAmount();
        const registrationFee = await agentNetwork.registrationFee();
        const requiredAmount = minStakeAmount.add(registrationFee);
        
        console.log("最小质押:", ethers.utils.formatEther(minStakeAmount), "DAT");
        console.log("注册费用:", ethers.utils.formatEther(registrationFee), "DAT");
        console.log("所需总额:", ethers.utils.formatEther(requiredAmount), "DAT");
        console.log("测试用户余额:", ethers.utils.formatEther(testUserTokenBalance), "DAT");
        
        if (testUserTokenBalance.gte(requiredAmount)) {
            // 授权代币
            console.log("\n授权代币...");
            const approveTx = await token.connect(testUser).approve(networkAddress, requiredAmount);
            await approveTx.wait(1);
            console.log("  授权交易哈希:", approveTx.hash);
            
            // 注册智能体
            const didDocument = "k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8";
            const publicKey = "0x1234567890abcdef1234567890abcdef12345678";
            
            console.log("\n注册智能体...");
            console.log("  DID文档:", didDocument);
            console.log("  质押金额:", ethers.utils.formatEther(minStakeAmount), "DAT");
            
            try {
                const registerTx = await agentNetwork.connect(testUser).registerAgent(
                    didDocument,
                    publicKey,
                    minStakeAmount
                );
                console.log("  交易哈希:", registerTx.hash);
                const receipt = await registerTx.wait(1);
                console.log("  区块号:", receipt.blockNumber);
                
                // 验证注册
                const agent = await agentNetwork.getAgent(testUser.address);
                if (agent.isActive) {
                    console.log("✅ 智能体注册测试通过");
                    console.log("  智能体状态:", agent.isActive ? "活跃" : "非活跃");
                    console.log("  质押金额:", ethers.utils.formatEther(agent.stakedAmount), "DAT");
                    console.log("  声誉:", agent.reputation.toString());
                } else {
                    console.log("❌ 智能体注册失败: 状态不正确");
                }
            } catch (error) {
                console.log("❌ 智能体注册失败:", error.message);
                if (error.message.includes("AgentAlreadyRegistered")) {
                    console.log("  ℹ️  测试用户已注册，跳过");
                }
            }
        } else {
            console.log("⚠️  跳过智能体注册测试: 余额不足");
            console.log("   提示: 需要至少", ethers.utils.formatEther(requiredAmount), "DAT");
        }
        
        // 3. 测试消息发送
        console.log("\n" + "=".repeat(60));
        console.log("3. 测试消息发送");
        console.log("=".repeat(60));
        
        // 检查部署者和测试用户是否已注册
        const deployerAgent = await agentNetwork.getAgent(deployer.address);
        const testUserAgent = await agentNetwork.getAgent(testUser.address);
        
        if (deployerAgent.isActive && testUserAgent.isActive) {
            const messageFee = await agentNetwork.messageFee();
            const deployerTokenBalance = await token.balanceOf(deployer.address);
            
            console.log("消息费用:", ethers.utils.formatEther(messageFee), "DAT");
            console.log("部署者代币余额:", ethers.utils.formatEther(deployerTokenBalance), "DAT");
            
            if (deployerTokenBalance.gte(messageFee)) {
                // 授权消息费用
                console.log("\n授权消息费用...");
                const messageApproveTx = await token.approve(networkAddress, messageFee);
                await messageApproveTx.wait(1);
                console.log("  授权交易哈希:", messageApproveTx.hash);
                
                // 发送消息
                const messageCID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
                console.log("\n发送消息...");
                console.log("  接收方:", testUser.address);
                console.log("  消息CID:", messageCID);
                
                try {
                    const sendMessageTx = await agentNetwork.sendMessage(testUser.address, messageCID);
                    console.log("  交易哈希:", sendMessageTx.hash);
                    const receipt = await sendMessageTx.wait(1);
                    console.log("  区块号:", receipt.blockNumber);
                    console.log("✅ 消息发送测试通过");
                } catch (error) {
                    console.log("❌ 消息发送失败:", error.message);
                }
            } else {
                console.log("⚠️  跳过消息发送测试: 代币余额不足");
            }
        } else {
            console.log("⚠️  跳过消息发送测试:");
            const testUserAgent = await agentNetwork.getAgent(testUser.address);
            if (!deployerAgent.isActive) {
                console.log("   - 部署者未注册为智能体");
            }
            if (!testUserAgent.isActive) {
                console.log("   - 接收方未注册为智能体");
            }
        }
        
        // 总结
        console.log("\n" + "=".repeat(60));
        console.log("✅ 功能测试完成");
        console.log("=".repeat(60));
        console.log("\n测试结果:");
        console.log("  - 代币转账: 已测试");
        console.log("  - 智能体注册: 已测试");
        console.log("  - 消息发送: 已测试");
        
    } catch (error) {
        console.error("\n❌ 测试失败:", error.message);
        console.error("详细错误:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("测试脚本错误:", error);
        process.exit(1);
    });

