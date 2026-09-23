// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IFlareContractRegistry.sol";
import "./interfaces/IWNat.sol";
import "./interfaces/IFtsoRewardManager.sol";

/**
 * @title CommunityTreasury
 * @author Halcyon Registry
 * @notice Receives 6% of registration/renewal revenue, wraps to WFLR,
 *         delegates to FTSO providers, and distributes rewards via Merkle proofs
 */
contract CommunityTreasury is AccessControl, ReentrancyGuard {
    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CLAIMER_ROLE = keccak256("CLAIMER_ROLE");
    bytes32 public constant SNAPSHOT_ROLE = keccak256("SNAPSHOT_ROLE");

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Flare contract registry
    IFlareContractRegistry public flareRegistry;

    /// @notice FTSO delegation config (max 2 providers)
    address public provider1;
    uint256 public bips1;
    address public provider2;
    uint256 public bips2;

    /// @notice Snapshot tracking
    struct Snapshot {
        uint256 blockNumber;
        uint256 timestamp;
    }

    /// @notice Commit-reveal snapshot: keeper commits to a future block, anyone executes after
    struct SnapshotCommit {
        uint256 targetBlock;   // The future block to snapshot at
        bool executed;
    }

    /// @notice Distribution epoch data
    struct Epoch {
        Snapshot snapshot1;
        Snapshot snapshot2;
        SnapshotCommit commit1;
        SnapshotCommit commit2;
        bytes32 merkleRoot;
        uint256 totalReward;
        bool finalized;
    }

    mapping(uint256 => Epoch) public epochs;
    uint256 public currentEpochId;

    /// @notice Minimum blocks in the future for a snapshot commit (anti-gaming)
    uint256 public snapshotCommitDelay = 100; // ~3-5 minutes on Flare

    /// @notice Minimum time between snapshot1 and snapshot2
    uint256 public minSnapshotGap = 1 days;

    /// @notice Track claims: epochId => user => claimed
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// @notice Total FLR received
    uint256 public totalReceived;

    /// @notice Total FLR distributed via Merkle claims
    uint256 public totalDistributed;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event FundsReceived(address indexed from, uint256 amount);
    event WrappedAndDelegated(uint256 amount, address provider1, uint256 bips1, address provider2, uint256 bips2);
    event DelegationUpdated(address provider1, uint256 bips1, address provider2, uint256 bips2);
    event FtsoRewardsClaimed(uint256 amount);
    event SnapshotCommitted(uint256 indexed epochId, uint256 snapshotIndex, uint256 targetBlock);
    event SnapshotExecuted(uint256 indexed epochId, uint256 snapshotIndex, uint256 blockNumber);
    event EpochFinalized(uint256 indexed epochId, bytes32 merkleRoot, uint256 totalReward);
    event RewardClaimed(uint256 indexed epochId, address indexed user, uint256 amount);

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    constructor(address _admin, address _flareRegistry) {
        require(_admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(CLAIMER_ROLE, _admin);
        _grantRole(SNAPSHOT_ROLE, _admin);
        if (_flareRegistry != address(0)) {
            flareRegistry = IFlareContractRegistry(_flareRegistry);
        }
    }

    // =============================================================
    //                      RECEIVE FUNDS
    // =============================================================

    /// @notice Accept FLR from escrow, NFT contract, or marketplace
    receive() external payable {
        totalReceived += msg.value;
        emit FundsReceived(msg.sender, msg.value);
    }

    // =============================================================
    //                    WRAP & DELEGATE
    // =============================================================

    /**
     * @notice Wrap all FLR balance to WFLR and delegate to configured FTSO providers
     */
    function wrapAndDelegate() external onlyRole(ADMIN_ROLE) nonReentrant {
        uint256 balance = address(this).balance;
        require(balance > 0, "No FLR to wrap");

        IWNat wnat = _getWNat();

        // Wrap FLR → WFLR
        wnat.deposit{value: balance}();

        // Delegate to configured providers
        if (provider1 != address(0) && bips1 > 0) {
            wnat.delegate(provider1, bips1);
        }
        if (provider2 != address(0) && bips2 > 0) {
            wnat.delegate(provider2, bips2);
        }

        emit WrappedAndDelegated(balance, provider1, bips1, provider2, bips2);
    }

    /**
     * @notice Configure FTSO delegation (max 2 providers, total <= 10000 bips)
     */
    function setDelegation(
        address _provider1,
        uint256 _bips1,
        address _provider2,
        uint256 _bips2
    ) external onlyRole(ADMIN_ROLE) {
        require(_bips1 + _bips2 <= 10000, "Total bips exceeds 100%");
        if (_bips1 > 0) require(_provider1 != address(0), "Invalid provider1");
        if (_bips2 > 0) require(_provider2 != address(0), "Invalid provider2");

        provider1 = _provider1;
        bips1 = _bips1;
        provider2 = _provider2;
        bips2 = _bips2;

        // Re-delegate existing WFLR if any
        address wnatAddr = address(flareRegistry) != address(0) ? flareRegistry.getContractAddressByName("WNat") : address(0);
        if (wnatAddr != address(0)) {
            IWNat wnat = IWNat(wnatAddr);
            uint256 wnatBalance = wnat.balanceOf(address(this));
            if (wnatBalance > 0) {
                wnat.undelegateAll();
                if (_provider1 != address(0) && _bips1 > 0) {
                    wnat.delegate(_provider1, _bips1);
                }
                if (_provider2 != address(0) && _bips2 > 0) {
                    wnat.delegate(_provider2, _bips2);
                }
            }
        }

        emit DelegationUpdated(_provider1, _bips1, _provider2, _bips2);
    }

    // =============================================================
    //                    FTSO REWARD CLAIMING
    // =============================================================

    /**
     * @notice Claim FTSO delegation rewards (keeper bot calls this)
     */
    function claimFtsoRewards() external onlyRole(CLAIMER_ROLE) nonReentrant {
        IFtsoRewardManager rewardManager = _getRewardManager();

        uint256[] memory unclaimedEpochs = rewardManager.getEpochsWithUnclaimedRewards(address(this));
        require(unclaimedEpochs.length > 0, "No unclaimed rewards");

        uint256 claimed_ = rewardManager.claimReward(payable(address(this)), unclaimedEpochs);
        emit FtsoRewardsClaimed(claimed_);
    }

    // =============================================================
    //                    SNAPSHOT SYSTEM
    // =============================================================

    /**
     * @notice Phase 1: Commit to a future snapshot block
     * @dev Keeper commits to snapshotting at (block.number + snapshotCommitDelay).
     *      The actual block state is unknowable at commit time, preventing front-running.
     */
    function commitSnapshot() external onlyRole(SNAPSHOT_ROLE) {
        Epoch storage epoch = epochs[currentEpochId];
        uint256 targetBlock = block.number + snapshotCommitDelay;

        if (!epoch.commit1.executed && epoch.commit1.targetBlock == 0) {
            epoch.commit1.targetBlock = targetBlock;
            emit SnapshotCommitted(currentEpochId, 1, targetBlock);
        } else if (epoch.commit1.executed && !epoch.commit2.executed && epoch.commit2.targetBlock == 0) {
            // Enforce minimum gap between snapshots
            require(
                block.timestamp >= epoch.snapshot1.timestamp + minSnapshotGap,
                "Too soon after snapshot 1"
            );
            epoch.commit2.targetBlock = targetBlock;
            emit SnapshotCommitted(currentEpochId, 2, targetBlock);
        } else {
            revert("No commit slot available");
        }
    }

    /**
     * @notice Phase 2: Execute a committed snapshot once the target block has passed
     * @dev Anyone can call this — no privilege needed. This ensures the keeper
     *      cannot selectively skip unfavorable snapshots.
     */
    function executeSnapshot() external {
        Epoch storage epoch = epochs[currentEpochId];

        if (!epoch.commit1.executed && epoch.commit1.targetBlock > 0) {
            require(block.number >= epoch.commit1.targetBlock, "Target block not reached");
            epoch.commit1.executed = true;
            epoch.snapshot1 = Snapshot(epoch.commit1.targetBlock, block.timestamp);
            emit SnapshotExecuted(currentEpochId, 1, epoch.commit1.targetBlock);
        } else if (epoch.commit1.executed && !epoch.commit2.executed && epoch.commit2.targetBlock > 0) {
            require(block.number >= epoch.commit2.targetBlock, "Target block not reached");
            epoch.commit2.executed = true;
            epoch.snapshot2 = Snapshot(epoch.commit2.targetBlock, block.timestamp);
            emit SnapshotExecuted(currentEpochId, 2, epoch.commit2.targetBlock);
        } else {
            revert("No pending snapshot to execute");
        }
    }

    /**
     * @notice Legacy takeSnapshot for backward compat (commits + auto-executes in future block)
     * @dev Only usable when snapshotCommitDelay is 0 (e.g., in tests)
     */
    function takeSnapshot() external onlyRole(SNAPSHOT_ROLE) {
        require(snapshotCommitDelay == 0, "Use commitSnapshot + executeSnapshot");
        Epoch storage epoch = epochs[currentEpochId];

        if (epoch.snapshot1.blockNumber == 0) {
            epoch.snapshot1 = Snapshot(block.number, block.timestamp);
            epoch.commit1 = SnapshotCommit(block.number, true);
            emit SnapshotExecuted(currentEpochId, 1, block.number);
        } else if (epoch.snapshot2.blockNumber == 0) {
            epoch.snapshot2 = Snapshot(block.number, block.timestamp);
            epoch.commit2 = SnapshotCommit(block.number, true);
            emit SnapshotExecuted(currentEpochId, 2, block.number);
        } else {
            revert("Both snapshots already taken");
        }
    }

    /**
     * @notice Admin can adjust commit delay and snapshot gap
     */
    function setSnapshotParams(uint256 _commitDelay, uint256 _minGap) external onlyRole(ADMIN_ROLE) {
        snapshotCommitDelay = _commitDelay;
        minSnapshotGap = _minGap;
    }

    // =============================================================
    //                    MERKLE DISTRIBUTION
    // =============================================================

    /**
     * @notice Finalize an epoch with Merkle root (after off-chain computation)
     * @param epochId The epoch to finalize
     * @param merkleRoot Root of the Merkle tree for reward distribution
     * @param totalReward Total FLR reward for this epoch
     */
    function finalizeEpoch(
        uint256 epochId,
        bytes32 merkleRoot,
        uint256 totalReward
    ) external onlyRole(ADMIN_ROLE) {
        Epoch storage epoch = epochs[epochId];
        require(!epoch.finalized, "Already finalized");
        require(epoch.snapshot1.blockNumber > 0, "Snapshot1 not taken");
        require(epoch.snapshot2.blockNumber > 0, "Snapshot2 not taken");
        require(merkleRoot != bytes32(0), "Invalid root");

        epoch.merkleRoot = merkleRoot;
        epoch.totalReward = totalReward;
        epoch.finalized = true;

        // Advance to next epoch
        currentEpochId = epochId + 1;

        emit EpochFinalized(epochId, merkleRoot, totalReward);
    }

    /**
     * @notice Claim rewards for a finalized epoch
     * @param epochId The epoch to claim for
     * @param amount The reward amount
     * @param merkleProof Merkle proof for the claim
     */
    function claimReward(
        uint256 epochId,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        Epoch storage epoch = epochs[epochId];
        require(epoch.finalized, "Epoch not finalized");
        require(!claimed[epochId][msg.sender], "Already claimed");

        // Verify Merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(merkleProof, epoch.merkleRoot, leaf), "Invalid proof");

        claimed[epochId][msg.sender] = true;
        totalDistributed += amount;

        // Unwrap WFLR if needed to have enough FLR
        uint256 flrBalance = address(this).balance;
        if (flrBalance < amount) {
            IWNat wnat = _getWNat();
            uint256 needed = amount - flrBalance;
            uint256 wnatBalance = wnat.balanceOf(address(this));
            uint256 toWithdraw = needed > wnatBalance ? wnatBalance : needed;
            if (toWithdraw > 0) {
                wnat.withdraw(toWithdraw);
            }
        }

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit RewardClaimed(epochId, msg.sender, amount);
    }

    /**
     * @notice Check if a claim is valid (view function for frontend)
     */
    function pendingRewards(
        uint256 epochId,
        address user,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool valid, bool alreadyClaimed) {
        Epoch storage epoch = epochs[epochId];
        if (!epoch.finalized) return (false, false);

        alreadyClaimed = claimed[epochId][user];
        bytes32 leaf = keccak256(abi.encodePacked(user, amount));
        valid = MerkleProof.verify(proof, epoch.merkleRoot, leaf);
    }

    // =============================================================
    //                    VIEW FUNCTIONS
    // =============================================================

    function getEpoch(uint256 epochId) external view returns (
        uint256 snapshot1Block,
        uint256 snapshot2Block,
        bytes32 merkleRoot,
        uint256 totalReward,
        bool finalized
    ) {
        Epoch storage epoch = epochs[epochId];
        return (
            epoch.snapshot1.blockNumber,
            epoch.snapshot2.blockNumber,
            epoch.merkleRoot,
            epoch.totalReward,
            epoch.finalized
        );
    }

    function getDelegation() external view returns (
        address _provider1, uint256 _bips1,
        address _provider2, uint256 _bips2
    ) {
        return (provider1, bips1, provider2, bips2);
    }

    // =============================================================
    //                    EMERGENCY
    // =============================================================

    /**
     * @notice Emergency withdraw (admin only, for migration)
     */
    function emergencyWithdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    /**
     * @notice Emergency withdraw WFLR (admin only)
     */
    function emergencyWithdrawWNat(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(to != address(0), "Invalid recipient");
        IWNat wnat = _getWNat();
        require(wnat.transfer(to, amount), "Transfer failed");
    }

    // =============================================================
    //                    INTERNAL
    // =============================================================

    function _getWNat() internal view returns (IWNat) {
        address wnatAddr = address(flareRegistry) != address(0) ? flareRegistry.getContractAddressByName("WNat") : address(0);
        require(wnatAddr != address(0), "WNat not found");
        return IWNat(wnatAddr);
    }

    function _getRewardManager() internal view returns (IFtsoRewardManager) {
        require(address(flareRegistry) != address(0), "Registry not set");
        address rmAddr = flareRegistry.getContractAddressByName("FtsoRewardManager");
        require(rmAddr != address(0), "RewardManager not found");
        return IFtsoRewardManager(rmAddr);
    }
}
