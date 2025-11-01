import * as dotenv from "dotenv";
dotenv.config();
import pkg from "hardhat";
const { ethers } = pkg;

async function testRPCEndpoints() {
    console.log("=== 测试Sepolia RPC节点 ===");
    
    // 多个可用的Sepolia RPC节点
    const rpcUrls = [
        process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://sepolia.gateway.tenderly.co",
        "https://rpc2.sepolia.org",
        "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Infura公共端点
        "https://eth-sepolia.g.alchemy.com/v2/demo" // Alchemy演示端点（有限制）
    ];
    
    let workingUrl = null;
    
    for (const url of rpcUrls) {
        console.log(`\n测试: ${url.replace(/(\/v3\/|api_key=)[^\s/]+/, '$1***')}`);
        try {
            const provider = new ethers.providers.JsonRpcProvider(url, {
                name: "sepolia",
                chainId: 11155111
            });
            
            const startTime = Date.now();
            // 设置较短的超时
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("超时")), 10000)
            );
            
            const blockNumberPromise = provider.getBlockNumber();
            const blockNumber = await Promise.race([blockNumberPromise, timeoutPromise]);
            
            const elapsed = Date.now() - startTime;
            console.log(`✅ 成功! 区块号: ${blockNumber}, 耗时: ${elapsed}ms`);
            workingUrl = url;
            break; // 找到可用的就退出
        } catch (error) {
            console.log(`❌ 失败: ${error.message.substring(0, 50)}`);
        }
    }
    
    if (workingUrl) {
        console.log(`\n✅ 推荐使用: ${workingUrl.replace(/(\/v3\/|api_key=)[^\s/]+/, '$1***')}`);
        return workingUrl;
    } else {
        console.log("\n❌ 所有RPC节点测试失败，请检查:");
        console.log("  1. 网络连接是否正常");
        console.log("  2. 防火墙是否阻止连接");
        console.log("  3. 是否使用了有效的Infura/Alchemy API key");
        return null;
    }
}

testRPCEndpoints().then(url => {
    if (url) {
        console.log("\n建议: 在.env文件中更新SEPOLIA_RPC_URL");
    }
    process.exit(0);
}).catch(error => {
    console.error("测试错误:", error);
    process.exit(1);
});

