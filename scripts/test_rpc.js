import * as dotenv from "dotenv";
dotenv.config();
import pkg from "hardhat";
const { ethers } = pkg;

async function testRPC() {
    console.log("=== 测试RPC节点连接 ===");
    
    const rpcUrls = [
        process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
        "https://rpc.sepolia.org",
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://sepolia.gateway.tenderly.co"
    ];
    
    for (const url of rpcUrls) {
        console.log(`\n测试: ${url}`);
        try {
            const provider = new ethers.JsonRpcProvider(url);
            const startTime = Date.now();
            const blockNumber = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("超时")), 10000))
            ]);
            const elapsed = Date.now() - startTime;
            console.log(`✅ 成功! 区块号: ${blockNumber}, 耗时: ${elapsed}ms`);
            return url;
        } catch (error) {
            console.log(`❌ 失败: ${error.message}`);
        }
    }
    
    console.log("\n所有RPC节点测试失败，请检查网络连接");
    return null;
}

testRPC().then(url => {
    if (url) {
        console.log(`\n建议使用的RPC: ${url}`);
    }
    process.exit(0);
}).catch(error => {
    console.error("错误:", error);
    process.exit(1);
});

