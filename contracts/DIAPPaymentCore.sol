// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./DIAPToken.sol";
import "./DIAPAgentNetwork.sol";

/**
 * @title DIAPPaymentCore
 * @dev DIAP核心支付合约 - 基础支付和服务托管
 */
contract DIAPPaymentCore is
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
        string paymentId;
        string description;
        uint256 timestamp;
        PaymentStatus status;
        string metadata;
    }

    struct Service {
        address provider;
        address consumer;
        uint256 price;
        uint256 escrowedAmount;
        uint256 timestamp;
        uint256 completionTime;
        ServiceStatus status;
        string serviceTypeCID;
        string resultCID;
    }

    enum PaymentStatus {
        PENDING,
        CONFIRMED,
        FAILED,
        CANCELLED
    }

    enum ServiceStatus {
        Created,
        Escrowed,
        Active,
        Completed,
        Cancelled
    }

    // ============ 状态变量 ============

    DIAPToken public token;
    DIAPAgentNetwork public agentNetwork;

    mapping(string => Payment) public payments;
    mapping(uint256 => Service) public services;

    uint256 public totalPayments;
    uint256 public totalServices;
    uint256 public totalVolume;

    uint256 public paymentFeeRate; // 支付费用率 (基点)

    // ============ 事件定义 ============

    event PaymentCreated(
        string indexed paymentId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    event PaymentConfirmed(string indexed paymentId, uint256 timestamp);

    event PaymentFailed(string indexed paymentId, string reason);

    event ServiceCreated(
        uint256 indexed serviceId,
        address indexed provider,
        address indexed consumer,
        uint256 price
    );

    event ServiceCompleted(
        uint256 indexed serviceId,
        address indexed provider,
        uint256 amount
    );

    event ServiceCancelled(uint256 indexed serviceId, uint256 refundAmount);

    // ============ 初始化函数 ============

    function initialize(address _token, address _agentNetwork) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        token = DIAPToken(_token);
        agentNetwork = DIAPAgentNetwork(payable(_agentNetwork));

        paymentFeeRate = 10; // 0.1%
    }

    // ============ 基础支付功能 ============

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

        uint256 fee = (amount * paymentFeeRate) / 10000;
        uint256 totalAmount = amount + fee;

        require(token.balanceOf(msg.sender) >= totalAmount, "Insufficient balance");

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

    function confirmPayment(string calldata paymentId) external nonReentrant whenNotPaused {
        Payment storage payment = payments[paymentId];
        require(payment.timestamp > 0, "Payment not found");
        require(payment.status == PaymentStatus.PENDING, "Payment not pending");
        require(payment.to == msg.sender, "Not payment recipient");
        require(block.timestamp <= payment.timestamp + 24 hours, "Payment expired");

        uint256 fee = (payment.amount * paymentFeeRate) / 10000;
        uint256 totalAmount = payment.amount + fee;

        require(token.balanceOf(payment.from) >= totalAmount, "Insufficient balance");
        require(
            token.allowance(payment.from, address(this)) >= totalAmount,
            "Insufficient allowance"
        );

        require(
            token.transferFrom(payment.from, payment.to, payment.amount),
            "Transfer to recipient failed"
        );
        if (fee > 0) {
            require(
                token.transferFrom(payment.from, address(this), fee),
                "Transfer fee failed"
            );
        }

        payment.status = PaymentStatus.CONFIRMED;
        totalVolume += payment.amount;

        emit PaymentConfirmed(paymentId, block.timestamp);
    }

    function cancelPayment(string calldata paymentId) external {
        Payment storage payment = payments[paymentId];
        require(payment.timestamp > 0, "Payment not found");
        require(payment.status == PaymentStatus.PENDING, "Payment not pending");
        require(payment.from == msg.sender, "Not payment sender");

        payment.status = PaymentStatus.CANCELLED;

        emit PaymentFailed(paymentId, "Cancelled by sender");
    }

    // ============ 服务托管支付功能 ============

    function createServiceOrder(
        address provider,
        string calldata serviceTypeCID,
        uint256 price
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(provider != address(0), "Invalid provider address");
        require(provider != msg.sender, "Cannot create service for self");
        require(price > 0, "Invalid price");
        require(bytes(serviceTypeCID).length > 0, "Service type CID required");

        require(agentNetwork.getAgent(msg.sender).isActive, "Consumer not registered");
        require(agentNetwork.getAgent(provider).isActive, "Provider not registered");

        uint256 fee = (price * paymentFeeRate) / 10000;
        uint256 totalAmount = price + fee;

        require(token.balanceOf(msg.sender) >= totalAmount, "Insufficient balance");
        require(
            token.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient allowance"
        );

        require(
            token.transferFrom(msg.sender, address(this), totalAmount),
            "Token transfer failed"
        );

        uint256 serviceId = totalServices;
        services[serviceId] = Service({
            provider: provider,
            consumer: msg.sender,
            price: price,
            escrowedAmount: totalAmount,
            timestamp: block.timestamp,
            completionTime: 0,
            status: ServiceStatus.Escrowed,
            serviceTypeCID: serviceTypeCID,
            resultCID: ""
        });

        totalServices++;

        emit ServiceCreated(serviceId, provider, msg.sender, price);

        return serviceId;
    }

    function completeServiceOrder(
        uint256 serviceId,
        string calldata resultCID
    ) external nonReentrant whenNotPaused {
        Service storage service = services[serviceId];
        require(service.timestamp > 0, "Service not found");
        require(service.provider == msg.sender, "Not service provider");
        require(service.status == ServiceStatus.Escrowed, "Service not escrowed");
        require(bytes(resultCID).length > 0, "Invalid result CID");
        require(block.timestamp <= service.timestamp + 30 days, "Service expired");

        service.status = ServiceStatus.Completed;
        service.completionTime = block.timestamp;
        service.resultCID = resultCID;

        uint256 providerAmount = service.price;

        require(
            token.transfer(service.provider, providerAmount),
            "Transfer to provider failed"
        );

        totalVolume += service.price;

        emit ServiceCompleted(serviceId, service.provider, providerAmount);
    }

    function cancelServiceOrder(uint256 serviceId) external nonReentrant {
        Service storage service = services[serviceId];
        require(service.timestamp > 0, "Service not found");
        require(service.consumer == msg.sender, "Not service consumer");
        require(service.status == ServiceStatus.Escrowed, "Service not escrowed");
        require(
            block.timestamp <= service.timestamp + 24 hours,
            "Cancellation period expired"
        );

        service.status = ServiceStatus.Cancelled;

        uint256 refundAmount = service.escrowedAmount;
        require(token.transfer(service.consumer, refundAmount), "Refund transfer failed");

        emit ServiceCancelled(serviceId, refundAmount);
    }

    // ============ 管理函数 ============

    function setPaymentFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high");
        paymentFeeRate = _rate;
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

    function getServiceOrder(uint256 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    function getPaymentStats()
        external
        view
        returns (uint256 _totalPayments, uint256 _totalServices, uint256 _totalVolume)
    {
        return (totalPayments, totalServices, totalVolume);
    }

    receive() external payable {}
}
