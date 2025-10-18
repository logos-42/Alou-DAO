// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./DIAPToken.sol";
import "./DIAPAgentNetwork.sol";

/**
 * @title DIAPPayment
 * @dev DIAP智能体网络支付合约
 * @notice 集成MCP协议，支持跨链支付和隐私保护
 */
contract DIAPPayment is 
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    
    // ============ 结构体定义 ============
    
    struct Payment {
        address from;
        address to;
        uint256 amount;
        string paymentId;        // MCP支付ID
        string description;      // 支付描述
        uint256 timestamp;
        PaymentStatus status;
        string metadata;         // 元数据CID
    }
    
    struct CrossChainPayment {
        address from;
        address to;
        uint256 amount;
        uint256 targetChainId;
        string targetAddress;
        string paymentId;
        uint256 timestamp;
        CrossChainStatus status;
    }
    
    struct PaymentChannel {
        address participant1;
        address participant2;
        uint256 balance1;
        uint256 balance2;
        uint256 totalDeposited;
        bool isActive;
        uint256 lastUpdate;
        string channelId;
    }
    
    enum PaymentStatus {
        PENDING,
        CONFIRMED,
        FAILED,
        CANCELLED
    }
    
    enum CrossChainStatus {
        PENDING,
        PROCESSING,
        COMPLETED,
        FAILED
    }
    
    // ============ 状态变量 ============
    
    DIAPToken public token;
    DIAPAgentNetwork public agentNetwork;
    
    mapping(string => Payment) public payments;
    mapping(string => CrossChainPayment) public crossChainPayments;
    mapping(string => PaymentChannel) public paymentChannels;
    
    uint256 public totalPayments;
    uint256 public totalVolume;
    uint256 public totalCrossChainVolume;
    
    // 费用配置
    uint256 public paymentFeeRate;      // 支付费用率 (基点)
    uint256 public crossChainFeeRate;   // 跨链费用率 (基点)
    uint256 public channelFeeRate;      // 通道费用率 (基点)
    
    // 支持的链
    mapping(uint256 => bool) public supportedChains;
    mapping(uint256 => address) public bridgeContracts;
    
    // 隐私保护
    mapping(bytes32 => bool) public usedCommitments;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(bytes32 => uint256) public commitmentPools; // commitment -> 锁定金额
    
    // ============ 事件定义 ============
    
    event PaymentCreated(
        string indexed paymentId,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    
    event PaymentConfirmed(
        string indexed paymentId,
        uint256 timestamp
    );
    
    event PaymentFailed(
        string indexed paymentId,
        string reason
    );
    
    event CrossChainPaymentInitiated(
        string indexed paymentId,
        address indexed from,
        uint256 targetChainId,
        uint256 amount
    );
    
    event CrossChainPaymentCompleted(
        string indexed paymentId,
        uint256 timestamp
    );
    
    event PaymentChannelOpened(
        string indexed channelId,
        address indexed participant1,
        address indexed participant2,
        uint256 totalDeposit
    );
    
    event PaymentChannelClosed(
        string indexed channelId,
        uint256 finalBalance1,
        uint256 finalBalance2
    );
    
    event PrivacyPaymentExecuted(
        bytes32 indexed commitment,
        address indexed to,
        uint256 amount
    );
    
    event FundsLocked(
        bytes32 indexed commitment,
        uint256 amount,
        address indexed locker
    );
    
    event FundsWithdrawn(
        bytes32 indexed commitment,
        uint256 amount,
        address indexed withdrawer
    );
    
    // ============ 初始化函数 ============
    
    function initialize(
        address _token,
        address _agentNetwork
    ) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        token = DIAPToken(_token);
        agentNetwork = DIAPAgentNetwork(payable(_agentNetwork));
        
        // 设置默认费用
        paymentFeeRate = 10;        // 0.1%
        crossChainFeeRate = 50;     // 0.5%
        channelFeeRate = 5;         // 0.05%
        
        // 支持默认链
        supportedChains[1] = true;      // Ethereum
        supportedChains[137] = true;    // Polygon
        supportedChains[42161] = true;  // Arbitrum
        supportedChains[10] = true;     // Optimism
    }
    
    // ============ 基础支付功能 ============
    
    /**
     * @dev 创建支付
     * @param to 接收方
     * @param amount 金额
     * @param paymentId MCP支付ID
     * @param description 支付描述
     * @param metadata 元数据CID
     */
    function createPayment(
        address to,
        uint256 amount,
        string calldata paymentId,
        string calldata description,
        string calldata metadata
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(bytes(paymentId).length > 0, "Payment ID required");
        require(payments[paymentId].timestamp == 0, "Payment ID already exists");
        require(agentNetwork.getAgent(msg.sender).isActive, "Sender not registered");
        require(agentNetwork.getAgent(to).isActive, "Recipient not registered");
        
        // 计算费用
        uint256 fee = amount * paymentFeeRate / 10000;
        uint256 totalAmount = amount + fee;
        
        require(token.balanceOf(msg.sender) >= totalAmount, "Insufficient balance");
        
        // 创建支付记录
        payments[paymentId] = Payment({
            from: msg.sender,
            to: to,
            amount: amount,
            paymentId: paymentId,
            description: description,
            timestamp: block.timestamp,
            status: PaymentStatus.PENDING,
            metadata: metadata
        });
        
        totalPayments++;
        
        emit PaymentCreated(paymentId, msg.sender, to, amount);
    }
    
    /**
     * @dev 确认支付
     * @param paymentId 支付ID
     */
    function confirmPayment(string calldata paymentId) external nonReentrant whenNotPaused {
        Payment storage payment = payments[paymentId];
        require(payment.timestamp > 0, "Payment not found");
        require(payment.status == PaymentStatus.PENDING, "Payment not pending");
        require(payment.to == msg.sender, "Not payment recipient");
        
        // 检查支付是否过期（例如24小时）
        require(block.timestamp <= payment.timestamp + 24 hours, "Payment expired");
        
        // 计算费用
        uint256 fee = payment.amount * paymentFeeRate / 10000;
        uint256 totalAmount = payment.amount + fee;
        
        // 检查发送方余额和授权
        require(token.balanceOf(payment.from) >= totalAmount, "Insufficient balance");
        require(token.allowance(payment.from, address(this)) >= totalAmount, "Insufficient allowance");
        
        // 执行转账
        require(token.transferFrom(payment.from, payment.to, payment.amount), "Transfer to recipient failed");
        if (fee > 0) {
            require(token.transferFrom(payment.from, address(this), fee), "Transfer fee failed");
        }
        
        // 更新状态
        payment.status = PaymentStatus.CONFIRMED;
        totalVolume += payment.amount;
        
        emit PaymentConfirmed(paymentId, block.timestamp);
    }
    
    /**
     * @dev 取消支付
     * @param paymentId 支付ID
     */
    function cancelPayment(string calldata paymentId) external {
        Payment storage payment = payments[paymentId];
        require(payment.timestamp > 0, "Payment not found");
        require(payment.status == PaymentStatus.PENDING, "Payment not pending");
        require(payment.from == msg.sender, "Not payment sender");
        
        payment.status = PaymentStatus.CANCELLED;
        
        emit PaymentFailed(paymentId, "Cancelled by sender");
    }
    
    // ============ 跨链支付功能 ============
    
    /**
     * @dev 发起跨链支付
     * @param to 接收方地址
     * @param amount 金额
     * @param targetChainId 目标链ID
     * @param targetAddress 目标地址
     * @param paymentId 支付ID
     */
    function initiateCrossChainPayment(
        address to,
        uint256 amount,
        uint256 targetChainId,
        string calldata targetAddress,
        string calldata paymentId
    ) external payable nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(supportedChains[targetChainId], "Chain not supported");
        require(bytes(paymentId).length > 0, "Payment ID required");
        require(crossChainPayments[paymentId].timestamp == 0, "Payment ID already exists");
        
        // 计算费用
        uint256 fee = amount * crossChainFeeRate / 10000;
        uint256 totalAmount = amount + fee;
        
        require(token.balanceOf(msg.sender) >= totalAmount, "Insufficient balance");
        
        // 创建跨链支付记录
        crossChainPayments[paymentId] = CrossChainPayment({
            from: msg.sender,
            to: to,
            amount: amount,
            targetChainId: targetChainId,
            targetAddress: targetAddress,
            paymentId: paymentId,
            timestamp: block.timestamp,
            status: CrossChainStatus.PENDING
        });
        
        // 锁定代币
        token.transferFrom(msg.sender, address(this), totalAmount);
        
        emit CrossChainPaymentInitiated(paymentId, msg.sender, targetChainId, amount);
    }
    
    /**
     * @dev 完成跨链支付
     * @param paymentId 支付ID
     * @param proof 跨链证明
     */
    function completeCrossChainPayment(
        string calldata paymentId,
        bytes calldata proof
    ) external onlyOwner {
        CrossChainPayment storage payment = crossChainPayments[paymentId];
        require(payment.timestamp > 0, "Payment not found");
        require(payment.status == CrossChainStatus.PENDING, "Payment not pending");
        
        // 验证跨链证明 (这里需要集成实际的跨链验证逻辑)
        require(_verifyCrossChainProof(proof), "Invalid cross-chain proof");
        
        // 更新状态
        payment.status = CrossChainStatus.COMPLETED;
        totalCrossChainVolume += payment.amount;
        
        emit CrossChainPaymentCompleted(paymentId, block.timestamp);
    }
    
    // ============ 支付通道功能 ============
    
    /**
     * @dev 打开支付通道
     * @param participant2 参与者2
     * @param deposit 存款金额
     * @param channelId 通道ID
     */
    function openPaymentChannel(
        address participant2,
        uint256 deposit,
        string calldata channelId
    ) external nonReentrant whenNotPaused {
        require(deposit > 0, "Deposit must be greater than 0");
        require(bytes(channelId).length > 0, "Channel ID required");
        require(paymentChannels[channelId].lastUpdate == 0, "Channel already exists");
        require(participant2 != msg.sender, "Cannot open channel with self");
        require(participant2 != address(0), "Invalid participant address");
        
        // 检查智能体注册状态
        require(agentNetwork.getAgent(msg.sender).isActive, "Sender not registered");
        require(agentNetwork.getAgent(participant2).isActive, "Participant2 not registered");
        
        // 检查余额和授权
        require(token.balanceOf(msg.sender) >= deposit, "Insufficient balance");
        require(token.allowance(msg.sender, address(this)) >= deposit, "Insufficient allowance");
        
        // 创建支付通道
        paymentChannels[channelId] = PaymentChannel({
            participant1: msg.sender,
            participant2: participant2,
            balance1: deposit,
            balance2: 0,
            totalDeposited: deposit,
            isActive: true,
            lastUpdate: block.timestamp,
            channelId: channelId
        });
        
        // 锁定存款
        require(token.transferFrom(msg.sender, address(this), deposit), "Transfer failed");
        
        emit PaymentChannelOpened(channelId, msg.sender, participant2, deposit);
    }
    
    /**
     * @dev 关闭支付通道
     * @param channelId 通道ID
     * @param finalBalance1 最终余额1
     * @param finalBalance2 最终余额2
     * @param signature1 签名1
     * @param signature2 签名2
     */
    function closePaymentChannel(
        string calldata channelId,
        uint256 finalBalance1,
        uint256 finalBalance2,
        bytes calldata signature1,
        bytes calldata signature2
    ) external nonReentrant whenNotPaused {
        PaymentChannel storage channel = paymentChannels[channelId];
        require(channel.lastUpdate > 0, "Channel not found");
        require(channel.isActive, "Channel not active");
        require(
            msg.sender == channel.participant1 || msg.sender == channel.participant2,
            "Not channel participant"
        );
        
        // 验证余额总和不超过总存款
        require(finalBalance1 + finalBalance2 <= channel.totalDeposited, "Invalid balance distribution");
        require(finalBalance1 <= channel.totalDeposited, "Balance1 exceeds total deposit");
        require(finalBalance2 <= channel.totalDeposited, "Balance2 exceeds total deposit");
        
        // 验证签名 (这里需要集成实际的签名验证逻辑)
        require(_verifyChannelSignatures(channelId, finalBalance1, finalBalance2, signature1, signature2), "Invalid signatures");
        
        // 计算费用
        uint256 fee = channel.totalDeposited * channelFeeRate / 10000;
        uint256 totalToDistribute = finalBalance1 + finalBalance2;
        require(totalToDistribute + fee <= channel.totalDeposited, "Insufficient funds for distribution and fees");
        
        // 分配余额
        if (finalBalance1 > 0) {
            require(token.transfer(channel.participant1, finalBalance1), "Transfer to participant1 failed");
        }
        if (finalBalance2 > 0) {
            require(token.transfer(channel.participant2, finalBalance2), "Transfer to participant2 failed");
        }
        
        // 关闭通道
        channel.isActive = false;
        channel.balance1 = finalBalance1;
        channel.balance2 = finalBalance2;
        
        emit PaymentChannelClosed(channelId, finalBalance1, finalBalance2);
    }
    
    // ============ 隐私支付功能 ============
    
    /**
     * @dev 锁定资金用于隐私支付
     * @param commitment 承诺
     * @param amount 锁定金额
     */
    function lockFundsForPrivacy(
        bytes32 commitment,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(commitmentPools[commitment] == 0, "Commitment already exists");
        
        // 检查用户余额和授权
        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(token.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");
        
        // 转移代币到合约
        require(token.transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        
        // 记录锁定资金
        commitmentPools[commitment] = amount;
        
        emit FundsLocked(commitment, amount, msg.sender);
    }
    
    /**
     * @dev 执行隐私支付（严格预锁定模型）
     * @param commitment 承诺
     * @param nullifier 空值
     * @param proof ZKP证明
     * @param to 接收方
     * @param amount 金额
     */
    function executePrivacyPayment(
        bytes32 commitment,
        bytes32 nullifier,
        uint256[8] calldata proof,
        address to,
        uint256 amount
    ) external nonReentrant {
        require(!usedCommitments[commitment], "Commitment already used");
        require(!usedNullifiers[nullifier], "Nullifier already used");
        require(amount > 0, "Amount must be greater than 0");
        require(commitmentPools[commitment] >= amount, "Insufficient locked funds");
        
        // 验证ZKP证明 (这里需要集成实际的ZKP验证逻辑)
        require(_verifyPrivacyProof(proof, commitment, nullifier, to, amount), "Invalid privacy proof");
        
        // 标记已使用
        usedCommitments[commitment] = true;
        usedNullifiers[nullifier] = true;
        
        // 减少锁定资金池
        commitmentPools[commitment] -= amount;
        
        // 执行转账
        require(token.transfer(to, amount), "Token transfer failed");
        
        emit PrivacyPaymentExecuted(commitment, to, amount);
    }
    
    /**
     * @dev 提取未使用的锁定资金
     * @param commitment 承诺
     */
    function withdrawLockedFunds(bytes32 commitment) external nonReentrant {
        uint256 lockedAmount = commitmentPools[commitment];
        require(lockedAmount > 0, "No locked funds");
        require(!usedCommitments[commitment], "Commitment already used");
        
        // 清零锁定资金
        commitmentPools[commitment] = 0;
        
        // 返还资金
        require(token.transfer(msg.sender, lockedAmount), "Token transfer failed");
        
        emit FundsWithdrawn(commitment, lockedAmount, msg.sender);
    }
    
    // ============ 内部函数 ============
    
    function _verifyCrossChainProof(bytes calldata proof) internal pure returns (bool) {
        // 这里应该集成实际的跨链验证逻辑
        // 简化实现
        return proof.length > 0;
    }
    
    function _verifyChannelSignatures(
        string calldata channelId,
        uint256 finalBalance1,
        uint256 finalBalance2,
        bytes calldata signature1,
        bytes calldata signature2
    ) internal pure returns (bool) {
        // 这里应该集成实际的签名验证逻辑
        // 简化实现
        return signature1.length > 0 && signature2.length > 0;
    }
    
    function _verifyPrivacyProof(
        uint256[8] calldata proof,
        bytes32 commitment,
        bytes32 nullifier,
        address to,
        uint256 amount
    ) internal pure returns (bool) {
        // 这里应该集成实际的ZKP验证逻辑
        // 简化实现
        return proof.length == 8 && proof[0] != 0;
    }
    
    // ============ 管理函数 ============
    
    function setPaymentFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high"); // 最大1%
        paymentFeeRate = _rate;
    }
    
    function setCrossChainFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high"); // 最大1%
        crossChainFeeRate = _rate;
    }
    
    function setChannelFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high"); // 最大1%
        channelFeeRate = _rate;
    }
    
    function addSupportedChain(uint256 chainId, address bridgeContract) external onlyOwner {
        supportedChains[chainId] = true;
        bridgeContracts[chainId] = bridgeContract;
    }
    
    function removeSupportedChain(uint256 chainId) external onlyOwner {
        supportedChains[chainId] = false;
        delete bridgeContracts[chainId];
    }
    
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    // ============ 查询函数 ============
    
    function getPayment(string calldata paymentId) external view returns (Payment memory) {
        return payments[paymentId];
    }
    
    function getCrossChainPayment(string calldata paymentId) external view returns (CrossChainPayment memory) {
        return crossChainPayments[paymentId];
    }
    
    function getPaymentChannel(string calldata channelId) external view returns (PaymentChannel memory) {
        return paymentChannels[channelId];
    }
    
    function getPaymentStats() external view returns (
        uint256 _totalPayments,
        uint256 _totalVolume,
        uint256 _totalCrossChainVolume
    ) {
        return (totalPayments, totalVolume, totalCrossChainVolume);
    }
    
    // 接收ETH
    receive() external payable {}
}
