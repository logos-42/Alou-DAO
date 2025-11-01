import * as dotenv from "dotenv";
dotenv.config();

// 测试RPC节点并返回最快的一个
async function testRPCNode(name, url, chainId) {
    const ethers = (await import("ethers")).default;
    
    try {
        const provider = new ethers.providers.JsonRpcProvider(url, {
            name: name,
            chainId: chainId
        });
        
        const startTime = Date.now();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("超时")), 15000)
        );
        
        const blockNumberPromise = provider.getBlockNumber();
        const blockNumber = await Promise.race([blockNumberPromise, timeoutPromise]);
        
        const elapsed = Date.now() - startTime;
        return {
            name,
            url,
            chainId,
            success: true,
            blockNumber,
            latency: elapsed,
            status: elapsed < 1000 ? "优秀" : elapsed < 3000 ? "良好" : "一般"
        };
    } catch (error) {
        return {
            name,
            url,
            chainId,
            success: false,
            error: error.message.substring(0, 50),
            latency: null,
            status: "失败"
        };
    }
}

async function main() {
    console.log("=".repeat(70));
    console.log("RPC节点性能测试");
    console.log("=".repeat(70));
    
    // Sepolia测试节点
    const sepoliaNodes = [
        {
            name: "Sepolia - PublicNode",
            url: "https://ethereum-sepolia-rpc.publicnode.com",
            chainId: 11155111,
            type: "免费公共节点"
        },
        {
            name: "Sepolia - Official",
            url: "https://rpc.sepolia.org",
            chainId: 11155111,
            type: "官方公共节点"
        },
        {
            name: "Sepolia - Tenderly",
            url: "https://sepolia.gateway.tenderly.co",
            chainId: 11155111,
            type: "Tenderly网关"
        },
        {
            name: "Sepolia - 1RPC",
            url: "https://1rpc.io/sepolia",
            chainId: 11155111,
            type: "1RPC免费节点"
        },
        {
            name: "Sepolia - Alchemy Demo",
            url: "https://eth-sepolia.g.alchemy.com/v2/demo",
            chainId: 11155111,
            type: "Alchemy演示（有限制）"
        },
        {
            name: "Sepolia - Infura Public",
            url: "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",
            chainId: 11155111,
            type: "Infura公共端点"
        }
    ];
    
    // Base Sepolia测试节点
    const baseSepoliaNodes = [
        {
            name: "Base Sepolia - Official",
            url: "https://sepolia.base.org",
            chainId: 84532,
            type: "Base官方公共RPC"
        },
        {
            name: "Base Sepolia - PublicNode",
            url: "https://base-sepolia-rpc.publicnode.com",
            chainId: 84532,
            type: "免费公共节点"
        },
        {
            name: "Base Sepolia - 1RPC",
            url: "https://1rpc.io/base-sepolia",
            chainId: 84532,
            type: "1RPC免费节点"
        },
        {
            name: "Base Sepolia - Alchemy Demo",
            url: "https://base-sepolia.g.alchemy.com/v2/demo",
            chainId: 84532,
            type: "Alchemy演示（有限制）"
        }
    ];
    
    console.log("\n📡 测试 Sepolia (Ethereum) 节点...");
    console.log("-".repeat(70));
    
    const sepoliaResults = [];
    for (const node of sepoliaNodes) {
        process.stdout.write(`测试 ${node.name}... `);
        const result = await testRPCNode(node.name, node.url, node.chainId);
        sepoliaResults.push({ ...result, type: node.type });
        
        if (result.success) {
            console.log(`✅ ${result.status} (${result.latency}ms, 区块: ${result.blockNumber})`);
        } else {
            console.log(`❌ ${result.status} (${result.error})`);
        }
    }
    
    console.log("\n📡 测试 Base Sepolia 节点...");
    console.log("-".repeat(70));
    
    const baseResults = [];
    for (const node of baseSepoliaNodes) {
        process.stdout.write(`测试 ${node.name}... `);
        const result = await testRPCNode(node.name, node.url, node.chainId);
        baseResults.push({ ...result, type: node.type });
        
        if (result.success) {
            console.log(`✅ ${result.status} (${result.latency}ms, 区块: ${result.blockNumber})`);
        } else {
            console.log(`❌ ${result.status} (${result.error})`);
        }
    }
    
    // 找出最快的节点
    const workingSepolia = sepoliaResults.filter(r => r.success);
    const workingBase = baseResults.filter(r => r.success);
    
    console.log("\n" + "=".repeat(70));
    console.log("📊 推荐配置（复制到.env文件）");
    console.log("=".repeat(70));
    
    if (workingSepolia.length > 0) {
        workingSepolia.sort((a, b) => a.latency - b.latency);
        const fastestSepolia = workingSepolia[0];
        console.log(`\n# Sepolia RPC (推荐: ${fastestSepolia.name} - ${fastestSepolia.latency}ms)`);
        console.log(`SEPOLIA_RPC_URL=${fastestSepolia.url}`);
        
        console.log(`\n# 其他可用的Sepolia节点（按速度排序）:`);
        workingSepolia.slice(0, 3).forEach((node, idx) => {
            console.log(`# ${idx + 2}. ${node.name} (${node.latency}ms) - ${node.url}`);
        });
    } else {
        console.log("\n❌ Sepolia: 没有可用的节点");
    }
    
    if (workingBase.length > 0) {
        workingBase.sort((a, b) => a.latency - b.latency);
        const fastestBase = workingBase[0];
        console.log(`\n# Base Sepolia RPC (推荐: ${fastestBase.name} - ${fastestBase.latency}ms)`);
        console.log(`BASE_SEPOLIA_RPC_URL=${fastestBase.url}`);
        
        console.log(`\n# 其他可用的Base Sepolia节点（按速度排序）:`);
        workingBase.slice(0, 3).forEach((node, idx) => {
            console.log(`# ${idx + 2}. ${node.name} (${node.latency}ms) - ${node.url}`);
        });
    } else {
        console.log("\n❌ Base Sepolia: 没有可用的节点");
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("💡 提示:");
    console.log("  - 如果推荐节点仍有问题，可以尝试列表中其他节点");
    console.log("  - 对于生产环境，建议使用Alchemy或Infura的付费节点");
    console.log("  - 获取Alchemy API Key: https://www.alchemy.com/");
    console.log("  - 获取Infura API Key: https://www.infura.io/");
    console.log("=".repeat(70));
}

main().catch(error => {
    console.error("测试错误:", error);
    process.exit(1);
});

