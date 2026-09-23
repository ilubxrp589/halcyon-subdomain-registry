// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IHSRResolver.sol";
import "./interfaces/IHSRRegistry.sol";
import "./libraries/HSRNamehash.sol";

/**
 * @title HSRResolver
 * @author Halcyon Registry
 * @notice ENS-compatible resolver for HSR subdomain address resolution
 * @dev Enables sending FLR to `username.cryptofans` instead of `0x...`
 *
 * Key features:
 * - Primary address resolution (Flare network)
 * - Multi-chain address support (EIP-2304 / ENSIP-11)
 * - Text records for metadata (avatar, url, description)
 * - Only NFT owners can modify their domain records
 *
 * Interface IDs:
 * - 0x3b3b57de: addr(bytes32) - ENS address resolution
 * - 0xf1cb7e06: addr(bytes32,uint256) - Multi-chain
 * - 0x59d1d43c: text(bytes32,string) - Text records
 */
contract HSRResolver is IHSRResolver, ERC165, AccessControl {
    using HSRNamehash for string;

    // =============================================================
    //                           ROLES
    // =============================================================

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Reference to the HSR Registry contract
    IHSRRegistry public registry;

    /// @notice Primary address mapping (Flare network): node => address
    mapping(bytes32 => address) private _addresses;

    /// @notice Multi-chain address mapping: node => coinType => address bytes
    mapping(bytes32 => mapping(uint256 => bytes)) private _multichainAddresses;

    /// @notice Text records: node => key => value
    mapping(bytes32 => mapping(string => string)) private _textRecords;

    /// @notice Contenthash records: node => contenthash bytes (EIP-1577)
    mapping(bytes32 => bytes) private _contenthashes;

    // =============================================================
    //                       COIN TYPES
    // =============================================================

    /// @notice SLIP-44 coin type for Ethereum (used for EVM compatibility)
    uint256 public constant COINTYPE_ETH = 60;

    /// @notice ENSIP-11 coin type for Flare mainnet (0x80000000 | 14)
    uint256 public constant COINTYPE_FLR = 0x8000000E;

    /// @notice ENSIP-11 coin type for Songbird (0x80000000 | 19)
    uint256 public constant COINTYPE_SGB = 0x80000013;

    /// @notice ENSIP-11 coin type for Coston2 testnet (0x80000000 | 114)
    uint256 public constant COINTYPE_C2FLR = 0x80000072;

    // =============================================================
    //                         INTERFACE IDs
    // =============================================================

    /// @notice Interface ID for addr(bytes32)
    bytes4 private constant ADDR_INTERFACE_ID = 0x3b3b57de;

    /// @notice Interface ID for addr(bytes32,uint256)
    bytes4 private constant ADDR_MULTICHAIN_INTERFACE_ID = 0xf1cb7e06;

    /// @notice Interface ID for text(bytes32,string)
    bytes4 private constant TEXT_INTERFACE_ID = 0x59d1d43c;

    /// @notice Interface ID for contenthash(bytes32)
    bytes4 private constant CONTENTHASH_INTERFACE_ID = 0xbc1c58d1;

    // =============================================================
    //                           ERRORS
    // =============================================================

    error NotAuthorized();
    error DomainNotFound();
    error InvalidAddress();
    error InvalidRegistry();

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

    /**
     * @notice Initialize the HSR Resolver
     * @param _registry Address of the HSR Registry contract
     */
    constructor(address _registry) {
        if (_registry == address(0)) revert InvalidRegistry();

        registry = IHSRRegistry(_registry);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    // =============================================================
    //                         MODIFIERS
    // =============================================================

    /**
     * @notice Ensure caller is authorized to modify the domain
     * @param node The namehash of the domain
     */
    modifier onlyAuthorized(bytes32 node) {
        if (!_isAuthorized(node, msg.sender)) revert NotAuthorized();
        _;
    }

    // =============================================================
    //                    CORE RESOLUTION
    // =============================================================

    /**
     * @inheritdoc IHSRResolver
     */
    function addr(bytes32 node) external view override returns (address) {
        return _addresses[node];
    }

    /**
     * @inheritdoc IHSRResolver
     */
    function setAddr(bytes32 node, address wallet) external override onlyAuthorized(node) {
        _addresses[node] = wallet;

        // Also set the multi-chain address for FLR
        _multichainAddresses[node][COINTYPE_FLR] = abi.encodePacked(wallet);
        _multichainAddresses[node][COINTYPE_ETH] = abi.encodePacked(wallet);

        emit AddressChanged(node, wallet);
    }

    // =============================================================
    //                   MULTI-CHAIN SUPPORT
    // =============================================================

    /**
     * @inheritdoc IHSRResolver
     */
    function addr(bytes32 node, uint256 coinType) external view override returns (bytes memory) {
        return _multichainAddresses[node][coinType];
    }

    /**
     * @inheritdoc IHSRResolver
     */
    function setAddr(
        bytes32 node,
        uint256 coinType,
        bytes calldata addressBytes
    ) external override onlyAuthorized(node) {
        _multichainAddresses[node][coinType] = addressBytes;

        // If setting FLR or ETH address, also update primary
        if (coinType == COINTYPE_FLR || coinType == COINTYPE_ETH) {
            if (addressBytes.length == 20) {
                address wallet;
                assembly {
                    wallet := shr(96, calldataload(addressBytes.offset))
                }
                _addresses[node] = wallet;
            }
        }

        emit AddressChangedMultichain(node, coinType, addressBytes);
    }

    // =============================================================
    //                      TEXT RECORDS
    // =============================================================

    /**
     * @inheritdoc IHSRResolver
     */
    function text(bytes32 node, string calldata key) external view override returns (string memory) {
        return _textRecords[node][key];
    }

    /**
     * @inheritdoc IHSRResolver
     */
    function setText(
        bytes32 node,
        string calldata key,
        string calldata value
    ) external override onlyAuthorized(node) {
        _textRecords[node][key] = value;
        emit TextChanged(node, key, value);
    }

    // =============================================================
    //                       CONTENTHASH
    // =============================================================

    /**
     * @inheritdoc IHSRResolver
     */
    function contenthash(bytes32 node) external view override returns (bytes memory) {
        return _contenthashes[node];
    }

    /**
     * @inheritdoc IHSRResolver
     */
    function setContenthash(bytes32 node, bytes calldata hash) external override onlyAuthorized(node) {
        _contenthashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }

    // =============================================================
    //                   CONVENIENCE FUNCTIONS
    // =============================================================

    /**
     * @inheritdoc IHSRResolver
     */
    function resolveAddress(string calldata fqdn) external view override returns (address) {
        bytes32 node = fqdn.namehashNormalized();
        return _addresses[node];
    }

    /**
     * @inheritdoc IHSRResolver
     */
    function hasAddress(bytes32 node) external view override returns (bool) {
        return _addresses[node] != address(0);
    }

    /**
     * @notice Resolve multiple FQDNs in a single call (gas efficient)
     * @param fqdns Array of fully qualified domain names
     * @return addresses Array of resolved addresses
     */
    function resolveAddresses(string[] calldata fqdns) external view returns (address[] memory addresses) {
        addresses = new address[](fqdns.length);
        for (uint256 i = 0; i < fqdns.length; i++) {
            bytes32 node = HSRNamehash.namehashNormalized(fqdns[i]);
            addresses[i] = _addresses[node];
        }
    }

    /**
     * @notice Get multiple text records for a domain
     * @param node The namehash of the domain
     * @param keys Array of text record keys
     * @return values Array of text record values
     */
    function getTextRecords(
        bytes32 node,
        string[] calldata keys
    ) external view returns (string[] memory values) {
        values = new string[](keys.length);
        for (uint256 i = 0; i < keys.length; i++) {
            values[i] = _textRecords[node][keys[i]];
        }
    }

    // =============================================================
    //                      ADMIN FUNCTIONS
    // =============================================================

    /**
     * @notice Update the registry address
     * @param _registry New registry address
     */
    function setRegistry(address _registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_registry == address(0)) revert InvalidRegistry();
        registry = IHSRRegistry(_registry);
    }

    /**
     * @notice Clear all records for a domain (called on burn/release)
     * @param node The namehash of the domain
     */
    function clearRecords(bytes32 node) external onlyRole(OPERATOR_ROLE) {
        delete _addresses[node];
        delete _contenthashes[node];
        // Note: Multi-chain addresses and text records persist until explicitly cleared
        // This is intentional for gas efficiency; they become inaccessible anyway
    }

    /**
     * @notice Operator can set address on behalf of owner (for batch operations)
     * @param node The namehash
     * @param wallet The wallet address
     */
    function setAddrByOperator(
        bytes32 node,
        address wallet
    ) external onlyRole(OPERATOR_ROLE) {
        _addresses[node] = wallet;
        _multichainAddresses[node][COINTYPE_FLR] = abi.encodePacked(wallet);
        _multichainAddresses[node][COINTYPE_ETH] = abi.encodePacked(wallet);
        emit AddressChanged(node, wallet);
    }

    // =============================================================
    //                      INTERNAL FUNCTIONS
    // =============================================================

    /**
     * @notice Check if an address is authorized to modify domain records
     * @param node The namehash of the domain
     * @param caller The address to check
     * @return True if authorized
     */
    function _isAuthorized(bytes32 node, address caller) internal view returns (bool) {
        // Operators can modify any domain
        if (hasRole(OPERATOR_ROLE, caller)) return true;

        // Check if caller owns the domain via registry
        address domainOwner = registry.owner(node);
        return domainOwner != address(0) && domainOwner == caller;
    }

    // =============================================================
    //                      EIP-165 SUPPORT
    // =============================================================

    /**
     * @notice Check if the contract supports an interface
     * @param interfaceId The interface identifier
     * @return True if supported
     *
     * Supported interfaces:
     * - 0x3b3b57de: addr(bytes32) - ENS address resolution
     * - 0xf1cb7e06: addr(bytes32,uint256) - Multi-chain resolution
     * - 0x59d1d43c: text(bytes32,string) - Text records
     * - type(IHSRResolver).interfaceId: Full resolver interface
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, AccessControl)
        returns (bool)
    {
        return
            interfaceId == ADDR_INTERFACE_ID ||
            interfaceId == ADDR_MULTICHAIN_INTERFACE_ID ||
            interfaceId == TEXT_INTERFACE_ID ||
            interfaceId == CONTENTHASH_INTERFACE_ID ||
            interfaceId == type(IHSRResolver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
