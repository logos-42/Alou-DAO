import pkg from "hardhat";
const { ethers } = pkg;

async function testHardhatConnection() {
    console.log("=== 测试Hardhat Sepolia连接 ===");
    
    try {
        console.log("1. 获取signers...");
        const [deployer] = await ethers.getSigners();
        console.log("   ✅ 部署者:", deployer.address);
        
        console.log("2. 测试provider连接...");
        const blockNumber = await Promise.race([
            ethers.provider.getBlockNumber(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("10秒超时")), 10000))
        ]);
        console.log("   ✅ 当前区块:", blockNumber);
        
        console.log("3. 获取网络信息...");
        const network = await ethers.provider.getNetwork();
        console.log("   ✅ 网络:", network.name, "Chain ID:", network.chainId.toString());
        
        console.log("4. 查询余额...");
        const balance = await deployer.provider.getBalance(deployer.address);
        console.log("   ✅ 余额:", ethers.utils.formatEther(balance), "ETH");
        
        console.log("\n✅ Hardhat Sepolia连接正常！");
        return true;
    } catch (error) {
        console.error("\n❌ 连接失败:", error.message);
        console.log("\n可能的原因:");
        console.log("1. .env文件中的SEPOLIA_RPC_URL指向了不可用的节点");
        console.log("2. 请更新.env文件: SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com");
        console.log("3. 或使用Infura/Alchemy的API key");
        return false;
    }
}

testHardhatConnection().then(success => {
    process.exit(success ? 0 : 1);
});

