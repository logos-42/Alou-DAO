import * as dotenv from "dotenv";
dotenv.config();

console.log("=== 环境变量诊断 ===\n");

// 检查私钥
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey || privateKey === "your_private_key_here") {
    console.log("❌ PRIVATE_KEY: 未正确配置");
    console.log("   请确保.env文件中PRIVATE_KEY已设置，格式: 0x开头，66个字符\n");
} else {
    const cleaned = privateKey.trim().replace(/^["']|["']$/g, "");
    const isValid = (cleaned.startsWith("0x") && cleaned.length === 66) || 
                   (!cleaned.startsWith("0x") && cleaned.length === 64);
    if (isValid) {
        console.log("✅ PRIVATE_KEY: 格式正确");
    } else {
        console.log("❌ PRIVATE_KEY: 格式错误");
        console.log(`   当前长度: ${cleaned.length}, 应该: 66 (带0x) 或 64 (不带0x)`);
        console.log(`   当前值: ${cleaned.substring(0, 10)}...\n`);
    }
}

// 检查Sepolia RPC
const sepoliaUrl = process.env.SEPOLIA_RPC_URL;
if (!sepoliaUrl || sepoliaUrl.includes("your_api_key")) {
    console.log("❌ SEPOLIA_RPC_URL: 未正确配置");
    console.log("   建议使用以下公共RPC之一:");
    console.log("   - https://rpc.sepolia.org");
    console.log("   - https://ethereum-sepolia-rpc.publicnode.com");
    console.log("   - https://sepolia.gateway.tenderly.co\n");
} else if (sepoliaUrl.includes("infura.io") && sepoliaUrl.includes("your_api_key")) {
    console.log("❌ SEPOLIA_RPC_URL: 包含占位符'your_api_key'");
    console.log("   请替换为真实的API key，或使用公共RPC: https://rpc.sepolia.org\n");
} else {
    console.log("✅ SEPOLIA_RPC_URL: 已配置");
    console.log(`   URL: ${sepoliaUrl.replace(/([a-zA-Z0-9]{20,})/g, '***')}\n`);
}

console.log("=== 修复建议 ===");
console.log("如果使用公共RPC，请在.env文件中设置:");
console.log("SEPOLIA_RPC_URL=https://rpc.sepolia.org\n");

