# HSR — Resolver System

## Purpose

Resolvers map domain names to blockchain addresses, content hashes, text records, and DNS records. When someone looks up "alice.coolname", the resolver returns the associated wallet address, website, social profiles, etc.

HSR follows the ENS resolver pattern (EIP-137, EIP-181, EIP-2304) adapted for Flare.

## Architecture

```
Query: "What is the FLR address for alice.coolname?"
  ↓
1. Compute namehash: keccak256(tldNamehash || keccak256("alice"))
  ↓
2. Look up resolver for this SLD: hsrSld.getResolver(sldNamehash)
  ↓
3. Query resolver contract: resolver.addr(sldNamehash, 14) → 0xABC...
  ↓
4. Return Flare address: 0xABC...
```

## Default Resolver

Most users will use the HSR DefaultResolver which handles all common record types in a single contract.

### DefaultResolver.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract DefaultResolver {
    // Address records (multi-chain)
    // coinType follows SLIP-44: https://github.com/nichanank/slip44
    // 14 = Flare, 60 = Ethereum, 0 = Bitcoin
    mapping(bytes32 => mapping(uint256 => bytes)) private addresses;
    
    // Text records (key-value pairs)
    mapping(bytes32 => mapping(string => string)) private texts;
    
    // Content hash (IPFS, Swarm, etc.)
    mapping(bytes32 => bytes) private contentHashes;
    
    // DNS records
    mapping(bytes32 => mapping(uint16 => bytes)) private dnsRecords;
    
    // Name reverse record
    mapping(bytes32 => string) private names;
    
    // Access control: only SLD owner can set records
    modifier onlySldOwner(bytes32 sldNamehash) {
        uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        require(tokenId != 0, "SLD not registered");
        require(
            hsrSld.ownerOf(tokenId) == msg.sender || 
            hsrSld.isApprovedForAll(hsrSld.ownerOf(tokenId), msg.sender),
            "Not authorized"
        );
        _;
    }
    
    // ===== Address Resolution =====
    
    /// @notice Set address for a coin type
    /// @param node The namehash of the SLD
    /// @param coinType SLIP-44 coin type (14=FLR, 60=ETH)
    /// @param addr The address bytes
    function setAddr(bytes32 node, uint256 coinType, bytes calldata addr) 
        external onlySldOwner(node) 
    {
        addresses[node][coinType] = addr;
        emit AddrChanged(node, coinType, addr);
    }
    
    /// @notice Get address for a coin type
    function addr(bytes32 node, uint256 coinType) 
        external view returns (bytes memory) 
    {
        return addresses[node][coinType];
    }
    
    /// @notice Convenience: get Flare address
    function addr(bytes32 node) external view returns (address) {
        bytes memory addrBytes = addresses[node][14]; // Flare coin type
        if (addrBytes.length == 0) return address(0);
        return abi.decode(addrBytes, (address));
    }
    
    // ===== Text Records =====
    
    /// @notice Set a text record
    /// @param node The namehash
    /// @param key Record key (e.g., "com.twitter", "url", "avatar", "description")
    /// @param value Record value
    function setText(bytes32 node, string calldata key, string calldata value)
        external onlySldOwner(node)
    {
        texts[node][key] = value;
        emit TextChanged(node, key, value);
    }
    
    /// @notice Get a text record
    function text(bytes32 node, string calldata key) 
        external view returns (string memory) 
    {
        return texts[node][key];
    }
    
    // ===== Content Hash =====
    
    /// @notice Set content hash (for decentralized websites)
    function setContenthash(bytes32 node, bytes calldata hash)
        external onlySldOwner(node)
    {
        contentHashes[node] = hash;
        emit ContenthashChanged(node, hash);
    }
    
    function contenthash(bytes32 node) external view returns (bytes memory) {
        return contentHashes[node];
    }
    
    // ===== Name (Reverse Resolution) =====
    
    function setName(bytes32 node, string calldata _name)
        external onlySldOwner(node)
    {
        names[node] = _name;
        emit NameChanged(node, _name);
    }
    
    function name(bytes32 node) external view returns (string memory) {
        return names[node];
    }
    
    // ===== Events =====
    
    event AddrChanged(bytes32 indexed node, uint256 coinType, bytes addr);
    event TextChanged(bytes32 indexed node, string key, string value);
    event ContenthashChanged(bytes32 indexed node, bytes hash);
    event NameChanged(bytes32 indexed node, string name);
}
```

## Standard Text Record Keys

Following ENS conventions:

```
Key                | Purpose                        | Example Value
-------------------|--------------------------------|---------------------------
avatar             | Profile picture URL            | ipfs://Qm... or https://...
url                | Website URL                    | https://alice.coolname
description        | Short bio                      | "Flare enthusiast"
com.twitter        | Twitter/X handle               | @alice
com.github         | GitHub username                 | alice-dev
com.discord        | Discord handle                  | alice#1234
org.telegram       | Telegram handle                 | @alice_tg
email              | Email address                   | alice@coolname.com
notice             | Important notice                | "This is my primary domain"
keywords           | Comma-separated tags            | "defi,flare,developer"
```

## Coin Types (SLIP-44)

```
Coin Type | Network    | Address Format
0         | Bitcoin    | Base58/Bech32
2         | Litecoin   | Base58/Bech32
14        | Flare      | 0x... (20 bytes, EVM)
60        | Ethereum   | 0x... (20 bytes, EVM)
114       | Coston2    | 0x... (20 bytes, EVM) — testnet
501       | Solana     | Base58
```

## Multicall Support

Allow setting multiple records in a single transaction:

```solidity
contract DefaultResolver {
    // ... (previous code)
    
    /// @notice Execute multiple resolver calls in one transaction
    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            require(success, "Multicall failed");
            results[i] = result;
        }
    }
}

// Frontend usage:
const calls = [
    resolver.interface.encodeFunctionData('setAddr', [namehash, 14, flareAddress]),
    resolver.interface.encodeFunctionData('setText', [namehash, 'com.twitter', '@alice']),
    resolver.interface.encodeFunctionData('setText', [namehash, 'url', 'https://alice.com']),
    resolver.interface.encodeFunctionData('setText', [namehash, 'avatar', 'ipfs://Qm...']),
];
await resolver.multicall(calls);
```

## Wildcard Resolution (EIP-2544)

Optional feature: resolve any subdomain under a TLD even if not explicitly registered.

```
Use case: TLD owner wants *.coolname to resolve to their wallet by default
- "anything.coolname" → owner's Flare address
- Unless "anything" is explicitly registered with its own resolver

Implementation:
  1. Query SLD resolver first
  2. If no SLD exists, fall back to TLD-level wildcard resolver
  3. TLD owner configures wildcard in their TLD settings
```

## Off-Chain Resolution (CCIP Read — EIP-3668)

For scalability, consider supporting off-chain resolution:

```
1. On-chain resolver returns OffchainLookup error
2. Client queries HSR API gateway
3. Gateway returns signed response
4. Client verifies signature and uses the data

Benefits:
  - Free to set/update records (no gas)
  - Infinite records per domain
  - Faster lookups

Tradeoff:
  - Requires HSR API to be running
  - Less decentralized

Recommendation: Start with on-chain resolver (simpler, trustless).
Add CCIP Read later as optimization.
```

## Reverse Resolution

Allow looking up "which domain does this address own?"

```solidity
contract ReverseRegistrar {
    mapping(address => bytes32) private primaryNames;  // address → namehash
    
    /// @notice Set primary name for your address
    function setPrimaryName(bytes32 sldNamehash) external {
        // Verify caller owns this SLD
        uint256 tokenId = hsrSld.sldNamehashToTokenId(sldNamehash);
        require(hsrSld.ownerOf(tokenId) == msg.sender, "Not owner");
        
        // Verify SLD resolves to this address
        address resolverAddr = hsrSld.getResolver(sldNamehash);
        IResolver resolver = IResolver(resolverAddr);
        address resolvedAddr = resolver.addr(sldNamehash);
        require(resolvedAddr == msg.sender, "SLD doesn't resolve to you");
        
        primaryNames[msg.sender] = sldNamehash;
        emit PrimaryNameSet(msg.sender, sldNamehash);
    }
    
    /// @notice Look up primary name for an address
    function primaryName(address addr) external view returns (string memory) {
        bytes32 namehash = primaryNames[addr];
        if (namehash == bytes32(0)) return "";
        
        // Reconstruct full name from SLD data
        uint256 tokenId = hsrSld.sldNamehashToTokenId(namehash);
        SldData memory data = hsrSld.getSldData(tokenId);
        string memory tldLabel = hsrTld.getLabel(data.parentNamehash);
        
        return string(abi.encodePacked(data.label, ".", tldLabel));
    }
}
```

## Integration with Flare DApps

```
HSR domains can be used across the Flare ecosystem:

1. Wallet Display
   - Instead of showing "0xABC...DEF", show "alice.coolname"
   - Query ReverseRegistrar.primaryName(address)

2. DApp Integration
   - Accept domain names as input instead of addresses
   - Resolve to address via DefaultResolver.addr(namehash)

3. DeFi Protocols
   - Send FLR to "alice.coolname" instead of pasting address
   - FAssets, SparkDEX, etc. can integrate

4. Profile System
   - Use text records as decentralized profile
   - Avatar, bio, social links — all on-chain
```

## Auto-Configuration on Registration

When an SLD is registered, automatically set up basic resolver records:

```solidity
// In SldRegistrationManager.registerWithCommit():

// After minting SLD NFT:
// 1. Set default resolver
hsrSld.setResolver(sldNamehash, defaultResolverAddress);

// 2. Auto-set Flare address to buyer's wallet
IDefaultResolver(defaultResolverAddress).setAddr(
    sldNamehash, 14, abi.encode(msg.sender)
);
```
