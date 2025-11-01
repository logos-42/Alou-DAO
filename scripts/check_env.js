import * as dotenv from "dotenv";
dotenv.config();

console.log("=== 环境变量检查 ===");
console.log("PRIVATE_KEY:", process.env.PRIVATE_KEY ? `${process.env.PRIVATE_KEY.substring(0, 10)}...` : "未设置");
console.log("SEPOLIA_RPC_URL:", process.env.SEPOLIA_RPC_URL ? (process.env.SEPOLIA_RPC_URL.includes("your_api_key") ? "需要配置" : "已配置") : "未设置");
console.log("BASE_SEPOLIA_RPC_URL:", process.env.BASE_SEPOLIA_RPC_URL ? "已配置" : "未设置");

if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === "your_private_key_here") {
    console.log("\n❌ 错误: PRIVATE_KEY未正确配置");
}

if (!process.env.SEPOLIA_RPC_URL || process.env.SEPOLIA_RPC_URL.includes("your_api_key")) {
    console.log("\n❌ 错误: SEPOLIA_RPC_URL未正确配置");
    console.log("可以使用公共RPC: https://rpc.sepolia.org");
}

