import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 处理私钥格式
function getPrivateKey() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || privateKey === "your_private_key_here") {
    return [];
  }
  // 移除可能的引号和空白字符，确保格式正确
  const cleaned = privateKey.trim().replace(/^["']|["']$/g, "");
  // 如果没有0x前缀，确保是有效的64字符十六进制
  if (!cleaned.startsWith("0x")) {
    if (cleaned.length === 64) {
      return [`0x${cleaned}`];
    }
    return [];
  }
  // 有0x前缀，验证长度（应该是66字符：0x + 64位十六进制）
  if (cleaned.length === 66) {
    return [cleaned];
  }
  return [];
}

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 10  // 极低runs值以最小化合约大小
      },
      viaIR: false  // 禁用IR优化以减小合约大小
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: getPrivateKey(),
      chainId: 11155111,
      timeout: 180000, // 180秒超时（Sepolia节点较慢）
      gasPrice: "auto",
      httpHeaders: {}
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: getPrivateKey(),
      chainId: 84532
    }
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      baseSepolia: process.env.BASESCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./tests",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};