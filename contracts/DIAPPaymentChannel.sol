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
 * @title DIAPPaymentChannel
 * @dev DIAP支付通道合约 - 状态通道和链下支付
 */
contract DIAPPaymentChannel is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    // ============ 结构体定义 ============

    struct PaymentChannel {
        address participant1;
        address participant2;
        uint256 balance1;
        uint256 balance2;
        uint256 totalDeposited;
        uint256 nonce;
        bool isActive;
        uint256 lastUpdate;
        uint256 challengeDeadline;
        string channelId;
    }

    // ============ 状态变量 ============

    DIAPToken public token;
    DIAPAgentNetwork public agentNetwork;

    mapping(string => PaymentChannel) public paymentChannels;

    uint256 public channelFeeRate;
    uint256 public constant CHALLENGE_PERIOD = 24 hours;

    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant CHANNEL_STATE_TYPEHASH =
        keccak256(
            "ChannelState(string channelId,uint256 balance1,uint256 balance2,uint256 nonce)"
        );

    // ============ 事件定义 ============

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

    event ChannelChallenged(
        string indexed channelId,
        uint256 newNonce,
        uint256 newBalance1,
        uint256 newBalance2
    );

    // ============ 初始化函数 ============

    function initialize(address _token, address _agentNetwork) public initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        token = DIAPToken(_token);
        agentNetwork = DIAPAgentNetwork(payable(_agentNetwork));

        channelFeeRate = 5; // 0.05%

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("DIAP Payment Channel")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ 支付通道功能 ============

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

        require(agentNetwork.getAgent(msg.sender).isActive, "Sender not registered");
        require(agentNetwork.getAgent(participant2).isActive, "Participant2 not registered");

        require(token.balanceOf(msg.sender) >= deposit, "Insufficient balance");
        require(
            token.allowance(msg.sender, address(this)) >= deposit,
            "Insufficient allowance"
        );

        paymentChannels[channelId] = PaymentChannel({
            participant1: msg.sender,
            participant2: participant2,
            balance1: deposit,
            balance2: 0,
            totalDeposited: deposit,
            nonce: 0,
            isActive: true,
            lastUpdate: block.timestamp,
            challengeDeadline: 0,
            channelId: channelId
        });

        require(token.transferFrom(msg.sender, address(this), deposit), "Transfer failed");

        emit PaymentChannelOpened(channelId, msg.sender, participant2, deposit);
    }

    function initiateChannelClose(
        string calldata channelId,
        uint256 finalBalance1,
        uint256 finalBalance2,
        uint256 nonce,
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

        require(nonce > channel.nonce, "Nonce must be greater than current");
        require(
            finalBalance1 + finalBalance2 <= channel.totalDeposited,
            "Invalid balance distribution"
        );

        require(
            _verifyChannelSignatures(
                channelId,
                finalBalance1,
                finalBalance2,
                nonce,
                channel.participant1,
                channel.participant2,
                signature1,
                signature2
            ),
            "Invalid signatures"
        );

        channel.balance1 = finalBalance1;
        channel.balance2 = finalBalance2;
        channel.nonce = nonce;
        channel.challengeDeadline = block.timestamp + CHALLENGE_PERIOD;

        emit PaymentChannelClosed(channelId, finalBalance1, finalBalance2);
    }

    function challengeChannelClose(
        string calldata channelId,
        uint256 newBalance1,
        uint256 newBalance2,
        uint256 newNonce,
        bytes calldata signature1,
        bytes calldata signature2
    ) external nonReentrant whenNotPaused {
        PaymentChannel storage channel = paymentChannels[channelId];
        require(channel.lastUpdate > 0, "Channel not found");
        require(channel.isActive, "Channel not active");
        require(channel.challengeDeadline > 0, "No active challenge period");
        require(block.timestamp < channel.challengeDeadline, "Challenge period expired");
        require(
            msg.sender == channel.participant1 || msg.sender == channel.participant2,
            "Not channel participant"
        );

        require(newNonce > channel.nonce, "New nonce must be greater");
        require(
            newBalance1 + newBalance2 <= channel.totalDeposited,
            "Invalid balance distribution"
        );

        require(
            _verifyChannelSignatures(
                channelId,
                newBalance1,
                newBalance2,
                newNonce,
                channel.participant1,
                channel.participant2,
                signature1,
                signature2
            ),
            "Invalid signatures"
        );

        channel.balance1 = newBalance1;
        channel.balance2 = newBalance2;
        channel.nonce = newNonce;

        emit ChannelChallenged(channelId, newNonce, newBalance1, newBalance2);
    }

    function finalizeChannelClose(string calldata channelId) external nonReentrant {
        PaymentChannel storage channel = paymentChannels[channelId];
        require(channel.lastUpdate > 0, "Channel not found");
        require(channel.isActive, "Channel not active");
        require(channel.challengeDeadline > 0, "No active challenge period");
        require(block.timestamp >= channel.challengeDeadline, "Challenge period not ended");

        uint256 fee = (channel.totalDeposited * channelFeeRate) / 10000;
        uint256 totalToDistribute = channel.balance1 + channel.balance2;
        require(totalToDistribute + fee <= channel.totalDeposited, "Insufficient funds");

        if (channel.balance1 > 0) {
            require(
                token.transfer(channel.participant1, channel.balance1),
                "Transfer to participant1 failed"
            );
        }
        if (channel.balance2 > 0) {
            require(
                token.transfer(channel.participant2, channel.balance2),
                "Transfer to participant2 failed"
            );
        }

        channel.isActive = false;
    }

    // ============ 内部函数 ============

    function _verifyChannelSignatures(
        string calldata channelId,
        uint256 balance1,
        uint256 balance2,
        uint256 nonce,
        address participant1,
        address participant2,
        bytes calldata signature1,
        bytes calldata signature2
    ) internal view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(
                CHANNEL_STATE_TYPEHASH,
                keccak256(bytes(channelId)),
                balance1,
                balance2,
                nonce
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        address signer1 = _recoverSigner(digest, signature1);
        address signer2 = _recoverSigner(digest, signature2);

        return
            (signer1 == participant1 && signer2 == participant2) ||
            (signer1 == participant2 && signer2 == participant1);
    }

    function _recoverSigner(
        bytes32 digest,
        bytes calldata signature
    ) internal pure returns (address) {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (
            uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        ) {
            return address(0);
        }

        if (v != 27 && v != 28) {
            return address(0);
        }

        return ecrecover(digest, v, r, s);
    }

    // ============ 管理函数 ============

    function setChannelFeeRate(uint256 _rate) external onlyOwner {
        require(_rate <= 100, "Rate too high");
        channelFeeRate = _rate;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ============ 查询函数 ============

    function getPaymentChannel(
        string calldata channelId
    ) external view returns (PaymentChannel memory) {
        return paymentChannels[channelId];
    }

    receive() external payable {}
}
