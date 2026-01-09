import pkg from "hardhat";
const { ethers } = pkg;
import * as fs from "fs";
import * as path from "path";

// 从 emergency/contract_addresses.txt 读取合约地址
async function getContractAddresses(network) {
    const addressesPath = path.join(process.cwd(), "emergency", "contract_addresses.txt");
    const content = fs.readFileSync(addressesPath, "utf-8");
    
    const addresses = {};
    const lines = content.split("\n");
    
    let currentNetwork = null;
    let currentContract = null;
    
    for (const line of lines) {
        if (line.includes("网络:") || line.includes("Chain ID")) {
            if (network === "sepolia" && line.includes("Sepolia")) {
                currentNetwork = "sepolia";
            } else if (network === "baseSepolia" && line.includes("Base Sepolia")) {
                currentNetwork = "baseSepolia";
            } else {
                currentNetwork = null;
            }
        }
        
        if (currentNetwork === network) {
            // 匹配合约名称和地址
            const contractMatch = line.match(/(\w+):/);
            if (contractMatch) {
                currentContract = contractMatch[1];
                addresses[currentContract] = {};
            }
            
            // 匹配代理地址
            if (currentContract && line.includes("代理地址:")) {
                const addrMatch = line.match(/0x[a-fA-F0-9]{40}/);
                if (addrMatch) {
                    addresses[currentContract].proxy = addrMatch[0];
                }
            }
            
            // 匹配实现地址
            if (currentContract && line.includes("实现地址:") || line.includes("地址:")) {
                const addrMatch = line.match(/0x[a-fA-F0-9]{40}/);
                if (addrMatch && !addresses[currentContract].proxy) {
                    addresses[currentContract].implementation = addrMatch[0];
                } else if (addrMatch) {
                    addresses[currentContract].implementation = addrMatch[0];
                }
            }
            
            // 处理非代理合约（只有地址）
            if (currentContract && line.includes("地址:") && !line.includes("代理") && !line.includes("实现")) {
                const addrMatch = line.match(/0x[a-fA-F0-9]{40}/);
                if (addrMatch && currentContract) {
                    addresses[currentContract].address = addrMatch[0];
                }
            }
        }
    }
    
    return addresses;
}

async function getTransactionReceipt(txHash, provider, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const receipt = await provider.getTransactionReceipt(txHash);
            if (receipt) return receipt;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return null;
}

async function findDeploymentTransactions(contractAddress, provider, deployerAddress) {
    console.log(`  查找 ${contractAddress} 的部署交易...`);
    
    // 通过创建者地址查找交易
    const txHashes = [];
    const maxBlocks = 50000; // 查找最近50000个区块
    
    try {
        const currentBlock = await provider.getBlockNumber();
        const startBlock = Math.max(0, currentBlock - maxBlocks);
        
        // 查找从部署者地址发出的交易
        let found = false;
        let checked = 0;
        
        // 先检查合约创建者交易（合约地址就是to字段为空）
        for (let blockNum = currentBlock; blockNum >= startBlock && !found; blockNum -= 1000) {
            try {
                const block = await provider.getBlockWithTransactions(blockNum);
                if (!block || !block.transactions) continue;
                
                for (const tx of block.transactions) {
                    if (tx.from && tx.from.toLowerCase() === deployerAddress.toLowerCase()) {
                        if (!tx.to || tx.to === null) {
                            // 合约创建交易
                            try {
                                const receipt = await getTransactionReceipt(tx.hash, provider);
                                if (receipt && receipt.contractAddress && 
                                    receipt.contractAddress.toLowerCase() === contractAddress.toLowerCase()) {
                                    txHashes.push({
                                        hash: tx.hash,
                                        block: blockNum,
                                        type: "creation"
                                    });
                                    found = true;
                                    break;
                                }
                            } catch (e) {
                                // 忽略错误，继续查找
                            }
                        }
                    }
                    checked++;
                    if (checked > 10000) break; // 限制检查数量
                }
            } catch (error) {
                // 如果区块不存在，继续
                continue;
            }
        }
    } catch (error) {
        console.log(`    警告: 无法搜索区块历史: ${error.message}`);
    }
    
    return txHashes;
}

async function getGasUsageForAddress(address, provider, deployerAddress) {
    try {
        // 方法1: 直接查询合约创建代码交易
        // 通过检查合约创建者的第一个交易
        const code = await provider.getCode(address);
        if (code === "0x" || code === "0x0") {
            return null; // 地址没有合约代码
        }
        
        // 方法2: 使用区块浏览器API（如果可用）
        // 这里我们尝试从最近的区块中找到创建交易
        
        // 简单方法：尝试通过区块号估算（需要知道部署大概时间）
        // 由于这比较复杂，我们使用另一种方法：
        // 获取创建者最近的所有交易，找到创建该合约的交易
        
        const currentBlock = await provider.getBlockNumber();
        
        // 尝试从最近1000个区块中查找
        for (let i = 0; i < 100; i++) {
            try {
                const block = await provider.getBlock(currentBlock - i, true);
                if (!block || !block.transactions) continue;
                
                for (const tx of block.transactions) {
                    if (tx.from && tx.from.toLowerCase() === deployerAddress.toLowerCase() && !tx.to) {
                        try {
                            const receipt = await provider.getTransactionReceipt(tx.hash);
                            if (receipt && receipt.contractAddress && 
                                receipt.contractAddress.toLowerCase() === address.toLowerCase()) {
                                return {
                                    hash: tx.hash,
                                    gasUsed: receipt.gasUsed.toString(),
                                    gasPrice: tx.gasPrice ? tx.gasPrice.toString() : "0",
                                    blockNumber: receipt.blockNumber
                                };
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    } catch (error) {
        console.log(`    错误: ${error.message}`);
        return null;
    }
}

async function main() {
    const network = process.argv[2] || "sepolia";
    console.log(`\n=== 查询 ${network.toUpperCase()} 部署Gas使用情况 ===\n`);
    
    const hre = pkg;
    await hre.config;
    
    const provider = ethers.getDefaultProvider(hre.config.networks[network].url);
    const deployerAddress = "0x308339a0C2fA14475EC42fbF0b8Fae239b293b52";
    
    console.log("部署者地址:", deployerAddress);
    console.log("网络:", network);
    console.log("");
    
    const addresses = await getContractAddresses(network);
    
    let totalGas = ethers.BigNumber.from(0);
    let totalTransactions = 0;
    const gasDetails = [];
    
    console.log("正在查询各合约的部署交易...\n");
    
    for (const [contractName, addressInfo] of Object.entries(addresses)) {
        if (!addressInfo) continue;
        
        console.log(`📋 ${contractName}:`);
        
        // 查询实现合约的gas（如果存在）
        if (addressInfo.implementation) {
            const implGas = await getGasUsageForAddress(
                addressInfo.implementation,
                provider,
                deployerAddress
            );
            if (implGas) {
                const gasBN = ethers.BigNumber.from(implGas.gasUsed);
                const gasPriceBN = implGas.gasPrice ? ethers.BigNumber.from(implGas.gasPrice) : ethers.BigNumber.from(0);
                const cost = gasBN.mul(gasPriceBN);
                
                totalGas = totalGas.add(gasBN);
                totalTransactions++;
                
                gasDetails.push({
                    contract: `${contractName} (实现)`,
                    hash: implGas.hash,
                    gasUsed: implGas.gasUsed,
                    gasPrice: implGas.gasPrice,
                    cost: cost.toString(),
                    blockNumber: implGas.blockNumber
                });
                
                console.log(`  ✅ 实现合约部署`);
                console.log(`     交易哈希: ${implGas.hash}`);
                console.log(`     Gas使用: ${ethers.utils.formatUnits(gasBN, 0)}`);
                console.log(`     Gas价格: ${ethers.utils.formatUnits(gasPriceBN, "gwei")} Gwei`);
                console.log(`     成本: ${ethers.utils.formatEther(cost)} ETH`);
            } else {
                console.log(`  ⚠️  无法找到实现合约部署交易`);
            }
        }
        
        // 查询代理合约的gas（如果存在）
        if (addressInfo.proxy) {
            const proxyGas = await getGasUsageForAddress(
                addressInfo.proxy,
                provider,
                deployerAddress
            );
            if (proxyGas) {
                const gasBN = ethers.BigNumber.from(proxyGas.gasUsed);
                const gasPriceBN = proxyGas.gasPrice ? ethers.BigNumber.from(proxyGas.gasPrice) : ethers.BigNumber.from(0);
                const cost = gasBN.mul(gasPriceBN);
                
                totalGas = totalGas.add(gasBN);
                totalTransactions++;
                
                gasDetails.push({
                    contract: `${contractName} (代理)`,
                    hash: proxyGas.hash,
                    gasUsed: proxyGas.gasUsed,
                    gasPrice: proxyGas.gasPrice,
                    cost: cost.toString(),
                    blockNumber: proxyGas.blockNumber
                });
                
                console.log(`  ✅ 代理合约部署`);
                console.log(`     交易哈希: ${proxyGas.hash}`);
                console.log(`     Gas使用: ${ethers.utils.formatUnits(gasBN, 0)}`);
                console.log(`     Gas价格: ${ethers.utils.formatUnits(gasPriceBN, "gwei")} Gwei`);
                console.log(`     成本: ${ethers.utils.formatEther(cost)} ETH`);
            } else {
                console.log(`  ⚠️  无法找到代理合约部署交易`);
            }
        }
        
        // 处理非代理合约（只有address）
        if (addressInfo.address && !addressInfo.proxy && !addressInfo.implementation) {
            const directGas = await getGasUsageForAddress(
                addressInfo.address,
                provider,
                deployerAddress
            );
            if (directGas) {
                const gasBN = ethers.BigNumber.from(directGas.gasUsed);
                const gasPriceBN = directGas.gasPrice ? ethers.BigNumber.from(directGas.gasPrice) : ethers.BigNumber.from(0);
                const cost = gasBN.mul(gasPriceBN);
                
                totalGas = totalGas.add(gasBN);
                totalTransactions++;
                
                gasDetails.push({
                    contract: contractName,
                    hash: directGas.hash,
                    gasUsed: directGas.gasUsed,
                    gasPrice: directGas.gasPrice,
                    cost: cost.toString(),
                    blockNumber: directGas.blockNumber
                });
                
                console.log(`  ✅ 合约部署`);
                console.log(`     交易哈希: ${directGas.hash}`);
                console.log(`     Gas使用: ${ethers.utils.formatUnits(gasBN, 0)}`);
                console.log(`     Gas价格: ${ethers.utils.formatUnits(gasPriceBN, "gwei")} Gwei`);
                console.log(`     成本: ${ethers.utils.formatEther(cost)} ETH`);
            } else {
                console.log(`  ⚠️  无法找到合约部署交易`);
            }
        }
        
        console.log("");
    }
    
    // 计算总成本（需要当前gas price）
    const feeData = await provider.getFeeData();
    const currentGasPrice = feeData.gasPrice || ethers.BigNumber.from(0);
    const estimatedCost = totalGas.mul(currentGasPrice);
    
    console.log("=".repeat(60));
    console.log("📊 Gas使用汇总:");
    console.log(`   总交易数: ${totalTransactions}`);
    console.log(`   总Gas使用: ${ethers.utils.formatUnits(totalGas, 0)}`);
    console.log(`   当前Gas价格: ${ethers.utils.formatUnits(currentGasPrice, "gwei")} Gwei`);
    console.log(`   估算总成本: ${ethers.utils.formatEther(estimatedCost)} ETH`);
    console.log("=".repeat(60));
    
    // 保存详细报告
    const reportPath = path.join(process.cwd(), `gas_report_${network}.json`);
    const report = {
        network,
        deployerAddress,
        timestamp: new Date().toISOString(),
        summary: {
            totalTransactions,
            totalGasUsed: totalGas.toString(),
            currentGasPrice: currentGasPrice.toString(),
            estimatedCost: estimatedCost.toString()
        },
        details: gasDetails
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✅ 详细报告已保存到: ${reportPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


