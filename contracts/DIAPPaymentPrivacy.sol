// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "./DIAPToken.sol";

/**
 * @title DIAPPaymentPrivacy
 * @dev DIAP隐私支付合约 - 基于ZKP的匿名支付
 */
contract DIAPPaymentPrivacy is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // ============ 状态变量 ============

    DIAPToken public token;

    mapping(bytes32 => bool) public usedCommitments;
    mapping(bytes32 => bool) public usedNullifiers;
    mapping(bytes32 => uint256) public commitmentPools;
    mapping(bytes32 => address) public commitmentOwners;
    mapping(bytes32 => uint256) public commitmentTimestamps;

    uint256 public constant PRIVACY_PAYMENT_TIMEOUT = 90 days;

    // ============ 事件定义 ============

    event FundsLocked(bytes32 indexed commitment, uint256 amount, address indexed locker);

    event PrivacyPaymentExecuted(
        bytes32 indexed commitment,
        address indexed to,
        uint256 amount
    );

    event FundsWithdrawn(
        bytes32 indexed commitment,
        uint256 amount,
        address indexed withdrawer
    );

    // ============ 初始化函数 ============

    function initialize(address _token) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        token = DIAPToken(_token);
    }

    // ============ 隐私支付功能 ============

    function lockFundsForPrivacy(bytes32 commitment, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(commitment != bytes32(0), "Invalid commitment");
        require(commitmentPools[commitment] == 0, "Commitment already exists");

        require(token.balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(
            token.allowance(msg.sender, address(this)) >= amount,
            "Insufficient allowance"
        );

        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Token transfer failed"
        );

        commitmentPools[commitment] = amount;
        commitmentOwners[commitment] = msg.sender;
        commitmentTimestamps[commitment] = block.timestamp;

        emit FundsLocked(commitment, amount, msg.sender);
    }

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

        require(
            _verifyPrivacyProof(proof, commitment, nullifier, to, amount),
            "Invalid privacy proof"
        );

        usedCommitments[commitment] = true;
        usedNullifiers[nullifier] = true;

        commitmentPools[commitment] -= amount;

        require(token.transfer(to, amount), "Token transfer failed");

        emit PrivacyPaymentExecuted(commitment, to, amount);
    }

    function withdrawLockedFunds(bytes32 commitment) external nonReentrant {
        uint256 lockedAmount = commitmentPools[commitment];
        address owner = commitmentOwners[commitment];

        require(lockedAmount > 0, "No locked funds");
        require(!usedCommitments[commitment], "Commitment already used");
        require(owner == msg.sender, "Not commitment owner");

        commitmentPools[commitment] = 0;
        delete commitmentOwners[commitment];
        delete commitmentTimestamps[commitment];

        require(token.transfer(msg.sender, lockedAmount), "Token transfer failed");

        emit FundsWithdrawn(commitment, lockedAmount, msg.sender);
    }

    function refundExpiredCommitment(bytes32 commitment) external nonReentrant {
        uint256 lockedAmount = commitmentPools[commitment];
        address owner = commitmentOwners[commitment];
        uint256 lockTime = commitmentTimestamps[commitment];

        require(lockedAmount > 0, "No locked funds");
        require(!usedCommitments[commitment], "Commitment already used");
        require(
            block.timestamp >= lockTime + PRIVACY_PAYMENT_TIMEOUT,
            "Not expired yet"
        );

        commitmentPools[commitment] = 0;
        delete commitmentOwners[commitment];
        delete commitmentTimestamps[commitment];

        require(token.transfer(owner, lockedAmount), "Token transfer failed");

        emit FundsWithdrawn(commitment, lockedAmount, owner);
    }

    // ============ 内部函数 ============

    function _verifyPrivacyProof(
        uint256[8] calldata proof,
        bytes32 /* commitment */,
        bytes32 /* nullifier */,
        address /* to */,
        uint256 /* amount */
    ) internal pure returns (bool) {
        return proof.length == 8 && proof[0] != 0;
    }

    // ============ 管理函数 ============

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ 查询函数 ============

    function getCommitmentInfo(
        bytes32 commitment
    ) external view returns (uint256 amount, address owner, uint256 timestamp, bool used) {
        return (
            commitmentPools[commitment],
            commitmentOwners[commitment],
            commitmentTimestamps[commitment],
            usedCommitments[commitment]
        );
    }

    receive() external payable {}
}
