// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {LabelValidator} from "../../../src/tld-staking/utils/LabelValidator.sol";
import {FtsoOracle} from "../../../src/tld-staking/utils/FtsoOracle.sol";
import {GlobalRegistrationRules} from "../../../src/tld-staking/utils/GlobalRegistrationRules.sol";
import {HsrTld} from "../../../src/tld-staking/core/HsrTld.sol";
import {HsrSld} from "../../../src/tld-staking/core/HsrSld.sol";
import {MockTestFtsoV2, MockFlareContractRegistry} from "./MockTestFtsoV2.sol";
import {MockFdcHub, MockFdcVerification} from "./MockFdcContracts.sol";
import {SldMetadataService} from "../../../src/tld-staking/services/SldMetadataService.sol";
import {TldMetadataService} from "../../../src/tld-staking/services/TldMetadataService.sol";

/// @title TestBase
/// @notice Shared setup for all TLD staking tests.
abstract contract TestBase is Test {
    // --- Contracts ---
    LabelValidator public labelValidator;
    FtsoOracle public ftsoOracle;
    GlobalRegistrationRules public globalRules;
    HsrTld public hsrTld;
    HsrSld public hsrSld;
    SldMetadataService public sldMetadata;
    TldMetadataService public tldMetadata;

    // --- Mocks ---
    MockTestFtsoV2 public mockFtsoV2;
    MockFlareContractRegistry public mockRegistry;
    MockFdcHub public mockFdcHub;
    MockFdcVerification public mockFdcVerification;

    // --- Test accounts ---
    address public owner = makeAddr("owner");
    address public operator = makeAddr("operator");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public artworkService = makeAddr("artworkService");

    // --- Constants ---
    address constant FLARE_REGISTRY_ADDRESS = 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;
    // FLR/USD price: $0.025 (2.5 cents) represented in 18-decimal wei = 0.025e18
    uint256 constant DEFAULT_FLR_PRICE = 0.025e18;

    function setUp() public virtual {
        // 1. Deploy mocks and etch the registry at Flare's hardcoded address
        mockFtsoV2 = new MockTestFtsoV2();
        mockFtsoV2.setPrice(DEFAULT_FLR_PRICE, uint64(block.timestamp));
        mockFdcHub = new MockFdcHub();
        mockFdcVerification = new MockFdcVerification();

        mockRegistry = new MockFlareContractRegistry();
        mockRegistry.register("FtsoV2", address(mockFtsoV2));
        mockRegistry.register("FdcHub", address(mockFdcHub));
        mockRegistry.register("FdcVerification", address(mockFdcVerification));

        // Etch the mock registry bytecode at the hardcoded Flare ContractRegistry address
        vm.etch(FLARE_REGISTRY_ADDRESS, address(mockRegistry).code);
        // Copy mapping storage slots from our deployed mock to the etched address
        _registerMockContract("FtsoV2", address(mockFtsoV2));
        _registerMockContract("FdcHub", address(mockFdcHub));
        _registerMockContract("FdcVerification", address(mockFdcVerification));

        // 2. Deploy Tier 1 contracts
        labelValidator = new LabelValidator();
        ftsoOracle = new FtsoOracle();
        globalRules = new GlobalRegistrationRules(address(labelValidator), owner);

        // 3. Deploy Tier 2 contracts behind UUPS proxies
        HsrTld tldImpl = new HsrTld();
        bytes memory tldInitData = abi.encodeCall(HsrTld.initialize, ("HSR TLD", "HSRTLD", owner));
        ERC1967Proxy tldProxy = new ERC1967Proxy(address(tldImpl), tldInitData);
        hsrTld = HsrTld(address(tldProxy));

        HsrSld sldImpl = new HsrSld();
        bytes memory sldInitData = abi.encodeCall(HsrSld.initialize, ("HSR SLD", "HSRSLD", owner));
        ERC1967Proxy sldProxy = new ERC1967Proxy(address(sldImpl), sldInitData);
        hsrSld = HsrSld(address(sldProxy));

        // 4. Deploy metadata services
        sldMetadata = new SldMetadataService("https://api.halcyon-names.io/metadata/sld/", owner);
        tldMetadata = new TldMetadataService("https://api.halcyon-names.io/metadata/tld/", owner);

        // 5. Wire contracts together
        vm.startPrank(owner);
        hsrTld.setClaimManager(operator);
        hsrSld.setRegistrationManager(operator);
        hsrSld.setArtworkService(artworkService);
        hsrSld.setMetadataService(address(sldMetadata));
        hsrTld.setMetadataService(address(tldMetadata));
        vm.stopPrank();
    }

    // --- Helpers ---

    /// @notice Computes namehash for a TLD label. Matches ENS EIP-137 single-label convention.
    function _computeTldNamehash(string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(bytes32(0), keccak256(bytes(label))));
    }

    /// @notice Computes namehash for an SLD (sublabel.parent).
    function _computeSldNamehash(bytes32 parentNamehash, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNamehash, keccak256(bytes(label))));
    }

    /// @notice Mints a TLD as the operator. Returns tokenId and namehash.
    function _mintTld(string memory label, address to) internal returns (uint256 tokenId, bytes32 namehash) {
        namehash = _computeTldNamehash(label);
        vm.prank(operator);
        tokenId = hsrTld.mint(to, label, namehash);
    }

    /// @notice Mints an SLD as the operator. Returns tokenId and namehash.
    function _mintSld(
        string memory label,
        bytes32 parentNamehash,
        address to,
        uint256 durationYears,
        uint256 priceUsdCents
    ) internal returns (uint256 tokenId, bytes32 sldNamehash) {
        sldNamehash = _computeSldNamehash(parentNamehash, label);
        vm.prank(operator);
        tokenId = hsrSld.mint(to, label, parentNamehash, durationYears, priceUsdCents);
    }

    /// @notice Sets a mapping slot in the etched FlareContractRegistry.
    ///         Mapping `contractAddresses` is at storage slot 0.
    ///         Value for key k is at keccak256(abi.encode(k, uint256(0))).
    function _registerMockContract(string memory name, address addr) internal {
        bytes32 nameHash = keccak256(abi.encode(name));
        bytes32 slot = keccak256(abi.encode(nameHash, uint256(0)));
        vm.store(FLARE_REGISTRY_ADDRESS, slot, bytes32(uint256(uint160(addr))));
    }
}
