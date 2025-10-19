// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title DIAPToken
 * @dev DIAP智能体网络代币合约
 * @notice 支持质押、奖励分配、通缩机制
 */
contract DIAPToken is 
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    
    // ============ 代币配置 ============
    
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 10亿代币
    uint256 public constant INITIAL_SUPPLY = 100_000_000 * 10**18; // 1亿初始供应
    
    // 分配比例 (基点)
    uint256 public constant COMMUNITY_ALLOCATION = 4000; // 40%
    uint256 public constant TEAM_ALLOCATION = 2000;      // 20%
    uint256 public constant TREASURY_ALLOCATION = 1500;  // 15%
    uint256 public constant STAKING_ALLOCATION = 1500;   // 15%
    uint256 public constant LIQUIDITY_ALLOCATION = 1000; // 10%
    
    // ============ 质押机制 ============
    
    struct StakingInfo {
        uint256 amount;           // 质押数量
        uint256 startTime;        // 开始时间
        uint256 lockPeriod;       // 锁定期
        uint256 lastClaimTime;    // 上次领取时间
        uint256 pendingRewards;   // 待领取奖励
    }
    
    struct StakingTier {
        uint256 minAmount;        // 最小质押数量
        uint256 multiplier;       // 奖励倍数 (基点)
        uint256 lockPeriod;       // 锁定期
    }
    
    mapping(address => StakingInfo) public stakingInfo;
    mapping(uint256 => StakingTier) public stakingTiers;
    
    uint256 public totalStaked;
    uint256 public totalRewardsDistributed;
    uint256 public stakingRewardRate; // 基础奖励率 (基点)
    uint256 public lastRewardTime;
    
    // 动态奖励率调整相关变量
    uint256 public constant MIN_REWARD_RATE = 100; // 最低1%年化
    uint256 public constant MAX_REWARD_RATE = 1000; // 最高10%年化
    uint256 public constant RATE_ADJUSTMENT_INTERVAL = 30 days; // 30天调整一次
    
    // 奖励率调整历史
    mapping(uint256 => uint256) public rewardRateHistory; // blockNumber => rate
    uint256 public lastRateAdjustment;
    
    // 质押层级
    uint256 public constant TIER_BRONZE = 0;
    uint256 public constant TIER_SILVER = 1;
    uint256 public constant TIER_GOLD = 2;
    uint256 public constant TIER_PLATINUM = 3;
    
    // ============ 通缩机制 ============
    
    uint256 public totalBurned;
    uint256 public burnRate; // 交易燃烧率 (基点)
    address public burnAddress;
    
    // 紧急控制机制
    bool public emergencyPaused = false;
    bool public emergencyWithdrawEnabled = false;
    
    // 时间锁机制
    mapping(bytes32 => uint256) public pendingActions;
    uint256 public constant TIMELOCK_DELAY = 2 days;
    
    // ============ 事件定义 ============
    
    event Staked(
        address indexed user,
        uint256 amount,
        uint256 lockPeriod,
        uint256 tier
    );
    
    event Unstaked(
        address indexed user,
        uint256 amount,
        uint256 rewards
    );
    
    event RewardsClaimed(
        address indexed user,
        uint256 amount
    );
    
    event TokensBurned(
        address indexed from,
        uint256 amount,
        string reason
    );
    
    event InitialDistributionCompleted(
        uint256 communityAmount,
        uint256 teamAmount,
        uint256 treasuryAmount,
        uint256 stakingAmount,
        uint256 liquidityAmount
    );
    
    event StakingRewardRateUpdated(uint256 newRate);
    event BurnRateUpdated(uint256 newRate);
    
    event StakingTierUpdated(
        uint256 tier,
        uint256 minAmount,
        uint256 multiplier,
        uint256 lockPeriod
    );
    
    // 紧急控制事件
    event EmergencyPaused(uint256 timestamp);
    event EmergencyUnpaused(uint256 timestamp);
    event EmergencyWithdrawEnabled(uint256 timestamp);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    
    // 时间锁事件
    event ActionScheduled(bytes32 indexed actionHash, uint256 executeTime);
    event ActionExecuted(bytes32 indexed actionHash);
    
    // ============ 初始化函数 ============
    
    function initialize(string calldata tokenName, string calldata tokenSymbol) public initializer {
        __ERC20_init(tokenName, tokenSymbol);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        // 设置默认参数
        stakingRewardRate = 500; // 5% 年化
        burnRate = 25; // 0.25%
        burnAddress = address(0x000000000000000000000000000000000000dEaD);
        lastRewardTime = block.timestamp;
        lastRateAdjustment = block.timestamp;
        
        // 初始化质押层级
        _initializeStakingTiers();
        
        // 执行初始分配
        _performInitialDistribution();
    }
    
    /**
     * @dev 执行初始代币分配
     */
    function _performInitialDistribution() internal {
        // 社区分配 (40%) - 分配给部署者，后续可转移
        uint256 communityAmount = INITIAL_SUPPLY * COMMUNITY_ALLOCATION / 10000;
        _mint(msg.sender, communityAmount);
        
        // 团队分配 (20%) - 分配给部署者，后续可转移
        uint256 teamAmount = INITIAL_SUPPLY * TEAM_ALLOCATION / 10000;
        _mint(msg.sender, teamAmount);
        
        // 国库分配 (15%) - 分配给部署者，后续可转移
        uint256 treasuryAmount = INITIAL_SUPPLY * TREASURY_ALLOCATION / 10000;
        _mint(msg.sender, treasuryAmount);
        
        // 质押奖励池 (15%)
        uint256 stakingAmount = INITIAL_SUPPLY * STAKING_ALLOCATION / 10000;
        _mint(address(this), stakingAmount);
        
        // 流动性池 (10%) - 分配给部署者，后续可转移
        uint256 liquidityAmount = INITIAL_SUPPLY * LIQUIDITY_ALLOCATION / 10000;
        _mint(msg.sender, liquidityAmount);
        
        // 验证总分配量不超过初始供应量
        uint256 totalAllocated = communityAmount + teamAmount + treasuryAmount + stakingAmount + liquidityAmount;
        require(totalAllocated <= INITIAL_SUPPLY, "Total allocation exceeds initial supply");
        
        emit InitialDistributionCompleted(
            communityAmount,
            teamAmount,
            treasuryAmount,
            stakingAmount,
            liquidityAmount
        );
    }
    
    function _initializeStakingTiers() internal {
        // 青铜级: 1000-9999 代币, 1x 奖励, 30天锁定期
        stakingTiers[TIER_BRONZE] = StakingTier({
            minAmount: 1000 * 10**18,
            multiplier: 10000, // 1x
            lockPeriod: 30 days
        });
        
        // 白银级: 10000-49999 代币, 1.5x 奖励, 90天锁定期
        stakingTiers[TIER_SILVER] = StakingTier({
            minAmount: 10000 * 10**18,
            multiplier: 15000, // 1.5x
            lockPeriod: 90 days
        });
        
        // 黄金级: 50000-99999 代币, 2x 奖励, 180天锁定期
        stakingTiers[TIER_GOLD] = StakingTier({
            minAmount: 50000 * 10**18,
            multiplier: 20000, // 2x
            lockPeriod: 180 days
        });
        
        // 铂金级: 100000+ 代币, 3x 奖励, 365天锁定期
        stakingTiers[TIER_PLATINUM] = StakingTier({
            minAmount: 100000 * 10**18,
            multiplier: 30000, // 3x
            lockPeriod: 365 days
        });
    }
    
    // ============ 质押功能 ============
    
    /**
     * @dev 质押代币
     * @param amount 质押数量
     * @param tier 质押层级
     */
    function stake(uint256 amount, uint256 tier) external nonReentrant whenNotPaused {
        require(!emergencyPaused, "Contract is emergency paused");
        require(amount > 0, "Amount must be greater than 0");
        require(tier <= TIER_PLATINUM, "Invalid tier");
        
        StakingTier memory tierInfo = stakingTiers[tier];
        require(amount >= tierInfo.minAmount, "Amount below tier minimum");
        
        StakingInfo storage info = stakingInfo[msg.sender];
        
        // 支持追加质押
        if (info.amount > 0) {
            // 先计算并累积现有奖励
            uint256 existingRewards = _calculateRewards(msg.sender);
            info.pendingRewards += existingRewards;
            
            // 严格的层级验证
            uint256 newTotalAmount = info.amount + amount;
            uint256 currentTier = _getStakingTier(info.amount);
            uint256 newTier = _getStakingTier(newTotalAmount);
            
            // 不允许层级跳跃
            require(newTier == currentTier, "Tier change not allowed for additional stake");
            require(newTier == tier, "Tier mismatch");
            
            // 检查是否超过当前层级的最大限制
            if (tier < TIER_PLATINUM) {
                require(newTotalAmount < stakingTiers[tier + 1].minAmount, "Amount exceeds current tier limit");
            }
            
            // 更新质押信息
            info.amount = newTotalAmount;
            info.lastClaimTime = block.timestamp;
        } else {
            // 首次质押
            info.amount = amount;
            info.startTime = block.timestamp;
            info.lockPeriod = tierInfo.lockPeriod;
            info.lastClaimTime = block.timestamp;
            info.pendingRewards = 0;
        }
        
        // 转移代币到合约
        _transfer(msg.sender, address(this), amount);
        totalStaked += amount;
        
        emit Staked(msg.sender, amount, tierInfo.lockPeriod, tier);
    }
    
    /**
     * @dev 取消质押
     */
    function unstake() external nonReentrant {
        StakingInfo storage info = stakingInfo[msg.sender];
        require(info.amount > 0, "No staking found");
        require(
            block.timestamp >= info.startTime + info.lockPeriod,
            "Lock period not ended"
        );
        
        // 计算奖励
        uint256 rewards = _calculateRewards(msg.sender);
        
        // 清零质押信息
        totalStaked -= info.amount;
        delete stakingInfo[msg.sender];
        
        // 转移质押代币
        _transfer(address(this), msg.sender, info.amount);
        
        // 使用混合奖励系统分发奖励
        if (rewards > 0) {
            _distributeRewards(msg.sender, rewards);
        }
        
        emit Unstaked(msg.sender, info.amount, rewards);
    }
    
    /**
     * @dev 领取奖励
     */
    function claimRewards() external nonReentrant {
        StakingInfo storage info = stakingInfo[msg.sender];
        require(info.amount > 0, "No staking found");
        
        uint256 rewards = _calculateRewards(msg.sender);
        require(rewards > 0, "No rewards to claim");
        
        // 更新领取时间
        info.lastClaimTime = block.timestamp;
        info.pendingRewards = 0;
        
        // 使用混合奖励系统：优先从staking池支付，不足时铸造
        _distributeRewards(msg.sender, rewards);
        
        emit RewardsClaimed(msg.sender, rewards);
    }
    
    /**
     * @dev 计算奖励
     * @param user 用户地址
     * @return 奖励数量
     */
    function _calculateRewards(address user) internal view returns (uint256) {
        StakingInfo memory info = stakingInfo[user];
        if (info.amount == 0) return 0;
        
        // 确定质押层级
        uint256 tier = _getStakingTier(info.amount);
        StakingTier memory tierInfo = stakingTiers[tier];
        
        // 计算时间差
        uint256 timeElapsed = block.timestamp - info.lastClaimTime;
        if (timeElapsed == 0) return info.pendingRewards;
        
        // 计算基础奖励
        uint256 baseRewards = info.amount * stakingRewardRate * timeElapsed / (365 days * 10000);
        
        // 应用层级倍数
        uint256 tierRewards = baseRewards * tierInfo.multiplier / 10000;
        
        return info.pendingRewards + tierRewards;
    }
    
    /**
     * @dev 获取质押层级
     * @param amount 质押数量
     * @return 层级
     */
    function _getStakingTier(uint256 amount) internal view returns (uint256) {
        if (amount >= stakingTiers[TIER_PLATINUM].minAmount) return TIER_PLATINUM;
        if (amount >= stakingTiers[TIER_GOLD].minAmount) return TIER_GOLD;
        if (amount >= stakingTiers[TIER_SILVER].minAmount) return TIER_SILVER;
        return TIER_BRONZE;
    }
    
    /**
     * @dev 动态奖励分发系统
     * @param recipient 接收者
     * @param amount 奖励数量
     */
    function _distributeRewards(address recipient, uint256 amount) internal {
        uint256 contractBalance = balanceOf(address(this));
        
        if (contractBalance >= amount) {
            // 余额充足，直接转账
            _transfer(address(this), recipient, amount);
            totalRewardsDistributed += amount;
        } else {
            // 余额不足，先调整奖励率
            _adjustRewardRate();
            
            // 重新计算奖励
            uint256 adjustedAmount = _calculateAdjustedRewards(recipient);
            
            if (contractBalance >= adjustedAmount) {
                _transfer(address(this), recipient, adjustedAmount);
                totalRewardsDistributed += adjustedAmount;
            } else {
                // 如果调整后仍不足，使用最低奖励率
                uint256 minReward = adjustedAmount * MIN_REWARD_RATE / stakingRewardRate;
                if (contractBalance >= minReward) {
                    _transfer(address(this), recipient, minReward);
                    totalRewardsDistributed += minReward;
                }
                // 如果连最低奖励都无法支付，则不支付奖励
            }
        }
    }
    
    /**
     * @dev 动态调整奖励率
     * 当合约余额不足时，降低奖励率
     * 当合约余额充足时，适当提高奖励率
     */
    function _adjustRewardRate() internal {
        require(block.timestamp >= lastRateAdjustment + RATE_ADJUSTMENT_INTERVAL, "Rate adjustment too frequent");
        
        uint256 contractBalance = balanceOf(address(this));
        uint256 totalStakedAmount = totalStaked;
        
        if (totalStakedAmount == 0) return;
        
        // 计算余额与质押量的比例
        uint256 balanceRatio = contractBalance * 10000 / totalStakedAmount;
        
        // 根据余额比例调整奖励率
        if (balanceRatio < 1000) { // 余额不足10%
            // 大幅降低奖励率
            stakingRewardRate = stakingRewardRate * 80 / 100; // 降低20%
        } else if (balanceRatio < 2000) { // 余额不足20%
            // 适度降低奖励率
            stakingRewardRate = stakingRewardRate * 90 / 100; // 降低10%
        } else if (balanceRatio > 5000) { // 余额超过50%
            // 适当提高奖励率
            stakingRewardRate = stakingRewardRate * 105 / 100; // 提高5%
        }
        
        // 确保奖励率在合理范围内
        if (stakingRewardRate < MIN_REWARD_RATE) {
            stakingRewardRate = MIN_REWARD_RATE;
        } else if (stakingRewardRate > MAX_REWARD_RATE) {
            stakingRewardRate = MAX_REWARD_RATE;
        }
        
        // 记录调整历史
        rewardRateHistory[block.number] = stakingRewardRate;
        lastRateAdjustment = block.timestamp;
        
        emit StakingRewardRateUpdated(stakingRewardRate);
    }
    
    /**
     * @dev 计算调整后的奖励
     * @param user 用户地址
     * @return 调整后的奖励数量
     */
    function _calculateAdjustedRewards(address user) internal view returns (uint256) {
        // 基于当前调整后的奖励率重新计算奖励
        StakingInfo memory info = stakingInfo[user];
        if (info.amount == 0) return 0;
        
        uint256 tier = _getStakingTier(info.amount);
        StakingTier memory tierInfo = stakingTiers[tier];
        
        uint256 timeElapsed = block.timestamp - info.lastClaimTime;
        if (timeElapsed == 0) return info.pendingRewards;
        
        uint256 baseRewards = info.amount * stakingRewardRate * timeElapsed / (365 days * 10000);
        uint256 tierRewards = baseRewards * tierInfo.multiplier / 10000;
        
        return info.pendingRewards + tierRewards;
    }
    
    // ============ 通缩机制 ============
    
    /**
     * @dev 燃烧代币
     * @param amount 燃烧数量
     * @param reason 燃烧原因
     */
    function burnTokens(uint256 amount, string calldata reason) external {
        require(amount > 0, "Amount must be greater than 0");
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        _burn(msg.sender, amount);
        totalBurned += amount;
        
        emit TokensBurned(msg.sender, amount, reason);
    }
    
    /**
     * @dev 自动燃烧 (在转账时)
     * @param from 发送方
     * @param to 接收方
     * @param amount 数量
     */
    function _transfer(address from, address to, uint256 amount) internal override {
        if (burnRate > 0 && from != address(this) && to != address(this)) {
            uint256 burnAmount = amount * burnRate / 10000;
            if (burnAmount > 0) {
                // 统一使用 _burn 函数，确保减少 totalSupply
                _burn(from, burnAmount);
                totalBurned += burnAmount;
                amount -= burnAmount;
                
                emit TokensBurned(from, burnAmount, "Auto-burn on transfer");
            }
        }
        
        super._transfer(from, to, amount);
    }
    
    // ============ 管理函数 ============
    
    /**
     * @dev 设置质押奖励率 (需要时间锁)
     * @param _rate 奖励率 (基点/年，例如500 = 5% APY)
     */
    function setStakingRewardRate(uint256 _rate) external onlyOwner {
        bytes32 actionHash = keccak256(abi.encodePacked("setStakingRewardRate", _rate));
        require(pendingActions[actionHash] != 0, "Action not scheduled");
        require(pendingActions[actionHash] <= block.timestamp, "Timelock not expired");
        
        require(_rate <= MAX_REWARD_RATE, "Rate too high");
        stakingRewardRate = _rate;
        delete pendingActions[actionHash];
        
        emit StakingRewardRateUpdated(_rate);
        emit ActionExecuted(actionHash);
    }
    
    /**
     * @dev 安排奖励率调整
     * @param _rate 新的奖励率
     */
    function scheduleRewardRateChange(uint256 _rate) external onlyOwner {
        require(_rate <= MAX_REWARD_RATE, "Rate too high");
        bytes32 actionHash = keccak256(abi.encodePacked("setStakingRewardRate", _rate));
        pendingActions[actionHash] = block.timestamp + TIMELOCK_DELAY;
        emit ActionScheduled(actionHash, block.timestamp + TIMELOCK_DELAY);
    }
    
    /**
     * @dev 设置燃烧率
     * @param _rate 燃烧率 (基点，例如25 = 0.25%)
     */
    function setBurnRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high"); // 最大1%
        burnRate = _rate;
        emit BurnRateUpdated(_rate);
    }
    
    /**
     * @dev 更新质押层级
     * @param tier 层级
     * @param minAmount 最小数量
     * @param multiplier 倍数
     * @param lockPeriod 锁定期
     */
    function updateStakingTier(
        uint256 tier,
        uint256 minAmount,
        uint256 multiplier,
        uint256 lockPeriod
    ) external onlyOwner {
        require(tier <= TIER_PLATINUM, "Invalid tier");
        require(multiplier >= 10000, "Multiplier too low"); // 最小1x
        
        stakingTiers[tier] = StakingTier({
            minAmount: minAmount,
            multiplier: multiplier,
            lockPeriod: lockPeriod
        });
        
        emit StakingTierUpdated(tier, minAmount, multiplier, lockPeriod);
    }
    
    /**
     * @dev 铸造代币 (仅限合约调用)
     * @param to 接收方
     * @param amount 数量
     */
    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // ============ 紧急控制函数 ============
    
    /**
     * @dev 紧急暂停合约
     */
    function emergencyPause() external onlyOwner {
        emergencyPaused = true;
        emit EmergencyPaused(block.timestamp);
    }
    
    /**
     * @dev 取消紧急暂停
     */
    function emergencyUnpause() external onlyOwner {
        emergencyPaused = false;
        emit EmergencyUnpaused(block.timestamp);
    }
    
    /**
     * @dev 启用紧急提取
     */
    function enableEmergencyWithdraw() external onlyOwner {
        emergencyWithdrawEnabled = true;
        emit EmergencyWithdrawEnabled(block.timestamp);
    }
    
    /**
     * @dev 紧急提取质押代币
     */
    function emergencyWithdraw() external {
        require(emergencyWithdrawEnabled, "Emergency withdraw not enabled");
        StakingInfo storage info = stakingInfo[msg.sender];
        require(info.amount > 0, "No staking found");
        
        uint256 amount = info.amount;
        delete stakingInfo[msg.sender];
        totalStaked -= amount;
        
        _transfer(address(this), msg.sender, amount);
        emit EmergencyWithdraw(msg.sender, amount);
    }
    
    // ============ 查询函数 ============
    
    /**
     * @dev 获取用户质押信息
     * @param user 用户地址
     * @return amount 质押数量
     * @return startTime 开始时间
     * @return lockPeriod 锁定期
     * @return lastClaimTime 上次领取时间
     * @return pendingRewards 待领取奖励
     * @return tier 质押层级
     */
    function getStakingInfo(address user) external view returns (
        uint256 amount,
        uint256 startTime,
        uint256 lockPeriod,
        uint256 lastClaimTime,
        uint256 pendingRewards,
        uint256 tier
    ) {
        StakingInfo memory info = stakingInfo[user];
        return (
            info.amount,
            info.startTime,
            info.lockPeriod,
            info.lastClaimTime,
            _calculateRewards(user),
            _getStakingTier(info.amount)
        );
    }
    
    /**
     * @dev 获取质押层级信息
     * @param tier 层级
     * @return minAmount 最小质押数量
     * @return multiplier 奖励倍数
     * @return lockPeriod 锁定期
     */
    function getStakingTier(uint256 tier) external view returns (
        uint256 minAmount,
        uint256 multiplier,
        uint256 lockPeriod
    ) {
        StakingTier memory tierInfo = stakingTiers[tier];
        return (tierInfo.minAmount, tierInfo.multiplier, tierInfo.lockPeriod);
    }
    
    /**
     * @dev 获取代币统计信息
     * @return totalSupply_ 总供应量
     * @return totalStaked_ 总质押量
     * @return totalBurned_ 总燃烧量
     * @return totalRewards_ 总奖励
     */
    function getTokenStats() external view returns (
        uint256 totalSupply_,
        uint256 totalStaked_,
        uint256 totalBurned_,
        uint256 totalRewards_
    ) {
        return (totalSupply(), totalStaked, totalBurned, totalRewardsDistributed);
    }
    
    // ============ 重写函数 ============
    
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
