// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint128, externalEuint128, eaddress } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title DonateContract – Encrypted Charity Campaign with FHE
contract DonateContract is SepoliaConfig {
    bool public campaignActive;
    address public charityOwner;
    euint128 private _totalDonations;
    euint128 private _targetAmount;
    mapping(address => euint128) private _donorBalances;
    mapping(address => eaddress) private _encryptedDonorAddresses;
    mapping(uint256 => address) private _pendingWithdrawals;

    event CampaignStarted(address indexed owner, euint128 target);
    event CampaignEnded(address indexed owner, uint128 finalAmount);
    event Donation(address indexed donor, euint128 amount);
    event WithdrawalRequested(address indexed owner, euint128 amount);
    event Withdrawn(address indexed owner, uint128 amount);
    event TargetUpdated(euint128 newTarget);
    event CampaignProgress(uint128 total, uint128 target, uint256 percentage);

    constructor() {
        campaignActive = false;
        _totalDonations = FHE.asEuint128(0);
        _targetAmount = FHE.asEuint128(0);
    }

    modifier onlyOwner() {
        require(msg.sender == charityOwner, "Not owner");
        _;
    }

    modifier whenActive() {
        require(campaignActive, "Campaign not active");
        _;
    }

    modifier whenNotActive() {
        require(!campaignActive, "Campaign active");
        _;
    }

    /// @notice Start a new campaign
    function startCampaign(
        externalEuint128 encryptedTarget,
        bytes calldata targetProof
    ) external whenNotActive {
        euint128 target = FHE.fromExternal(encryptedTarget, targetProof);

        charityOwner = msg.sender;
        campaignActive = true;
        _targetAmount = target;
        _totalDonations = FHE.asEuint128(0);

        FHE.allowThis(_targetAmount);
        FHE.allow(_targetAmount, charityOwner);
        FHE.allowThis(_totalDonations);
        FHE.allow(_totalDonations, charityOwner);

        emit CampaignStarted(charityOwner, target);
    }

    /// @notice End campaign and withdraw
    function endCampaign() external onlyOwner whenActive {
        campaignActive = false;

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(_totalDonations);

        uint256 requestId = FHE.requestDecryption(cts, this.callbackEndCampaign.selector);
        _pendingWithdrawals[requestId] = msg.sender;

        emit WithdrawalRequested(msg.sender, _totalDonations);
    }

    /// @notice Update target
    function updateTarget(
        externalEuint128 encryptedTarget,
        bytes calldata targetProof
    ) external onlyOwner whenActive {
        euint128 target = FHE.fromExternal(encryptedTarget, targetProof);

        _targetAmount = target;
        FHE.allowThis(_targetAmount);
        FHE.allow(_targetAmount, charityOwner);

        emit TargetUpdated(target);
    }

    /// @notice Donate
    function donate(
        externalEuint128 encryptedAmount,
        bytes calldata amountProof
    ) external payable whenActive {
        require(msg.value > 0, "Donation > 0");
        require(msg.value <= type(uint128).max, "Amount too large");

        euint128 amount = FHE.fromExternal(encryptedAmount, amountProof);
        eaddress encryptedDonor = FHE.asEaddress(msg.sender);

        _totalDonations = FHE.add(_totalDonations, amount);
        _donorBalances[msg.sender] = FHE.add(_donorBalances[msg.sender], amount);
        _encryptedDonorAddresses[msg.sender] = encryptedDonor;

        FHE.allowThis(_totalDonations);
        FHE.allow(_totalDonations, charityOwner);
        FHE.allowThis(_donorBalances[msg.sender]);
        FHE.allow(_donorBalances[msg.sender], msg.sender);

        emit Donation(msg.sender, amount);
    }

    /// @notice Request progress decryption
    function requestProgress() external whenActive returns (uint256 requestId) {
        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(_totalDonations);
        cts[1] = FHE.toBytes32(_targetAmount);

        requestId = FHE.requestDecryption(cts, this.callbackProgress.selector);
    }

    /// @notice Callback: End campaign + withdraw
    function callbackEndCampaign(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint128 decryptedAmount = abi.decode(cleartexts, (uint128));

        address withdrawer = _pendingWithdrawals[requestId];
        delete _pendingWithdrawals[requestId];

        require(withdrawer == charityOwner, "Not owner");
        require(address(this).balance >= decryptedAmount, "Insufficient balance");

        payable(withdrawer).transfer(decryptedAmount);
        emit Withdrawn(withdrawer, decryptedAmount);
        emit CampaignEnded(withdrawer, decryptedAmount);
    }

    /// @notice Callback: Progress
    function callbackProgress(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) external {
        FHE.checkSignatures(requestId, cleartexts, proof);
        (uint128 total, uint128 target) = abi.decode(cleartexts, (uint128, uint128));

        uint256 percentage = target > 0 ? (total * 100) / target : 0;
        emit CampaignProgress(total, target, percentage);
    }

    // View functions
    function totalDonations() external view returns (euint128) { return _totalDonations; }
    function targetAmount() external view returns (euint128) { return _targetAmount; }
    function balanceOf(address donor) external view returns (euint128) { return _donorBalances[donor]; }
}