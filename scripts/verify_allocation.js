/**
 * 验证 DIAP Token 初始分配
 * 
 * 分配方案:
 * - 社区: 40% = 4000万 DIAP
 * - 国库: 22% = 2200万 DIAP
 * - 开发者: 15% = 1500万 DIAP
 * - 投资人: 15% = 1500万 DIAP
 * - 质押奖励池: 8% = 800万 DIAP
 * 总计: 100% = 1亿 DIAP
 */

const INITIAL_SUPPLY = 100_000_000; // 1亿代币

const allocations = {
    community: { percent: 40, amount: 40_000_000 },
    treasury: { percent: 22, amount: 22_000_000 },
    team: { percent: 15, amount: 15_000_000 },
    investor: { percent: 15, amount: 15_000_000 },
    staking: { percent: 8, amount: 8_000_000 }
};

console.log('='.repeat(60));
console.log('DIAP Token 初始分配验证');
console.log('='.repeat(60));
console.log();

let totalPercent = 0;
let totalAmount = 0;

for (const [key, value] of Object.entries(allocations)) {
    const name = {
        community: '社区',
        treasury: '国库',
        team: '开发者',
        investor: '投资人',
        staking: '质押奖励池'
    }[key];
    
    console.log(`${name.padEnd(12, ' ')}: ${value.percent}% = ${value.amount.toLocaleString()} DIAP`);
    totalPercent += value.percent;
    totalAmount += value.amount;
}

console.log('-'.repeat(60));
console.log(`总计${' '.repeat(10)}: ${totalPercent}% = ${totalAmount.toLocaleString()} DIAP`);
console.log();

// 验证
if (totalPercent === 100 && totalAmount === INITIAL_SUPPLY) {
    console.log('✅ 分配验证通过！');
} else {
    console.log('❌ 分配验证失败！');
    console.log(`   预期: 100% = ${INITIAL_SUPPLY.toLocaleString()} DIAP`);
    console.log(`   实际: ${totalPercent}% = ${totalAmount.toLocaleString()} DIAP`);
}

console.log('='.repeat(60));
