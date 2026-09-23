# HSR — FTSO v2 Price Oracle Integration

## Why FTSO Instead of Chainlink

HNS.ID on Optimism uses Chainlink ETH/USD. HSR uses Flare's native FTSO (Flare Time Series Oracle) because:

1. **Native to Flare** — no third-party dependency, no additional trust assumptions
2. **Free to query** — view calls are free on both testnet and mainnet (state-changing calls on mainnet may require a fee via IFeeCalculator)
3. **High update frequency** — block-latency feeds update every ~1.8 seconds (per block); anchor feeds update every ~90 seconds
4. **Incentive-aligned** — FTSO data providers are Flare validators, same security model
5. **USD pricing** — FLR/USD feed available natively

## FTSO v2 Architecture

FTSO v2 has two feed types:

### Block-Latency Feeds (Preferred for HSR)
- Updated **every block (~1.8 seconds)** — incremental delta updates
- Pulled from on-chain Relay contract
- Feed data anchored to Flare's consensus
- Free for view calls (no fee)
- Best for: real-time price display in frontend, payment validation

### Anchor Feeds (Scaling)
- Updated every voting epoch (**~90 seconds**) — full commit-reveal cycle
- Higher confidence, used for DeFi
- Query via FtsoV2 contract
- The accuracy backstop for block-latency feeds

**HSR should use block-latency feeds** for real-time price display and payment validation. Anchor feeds serve as the accuracy backstop.

### Testnet vs Mainnet Distinction

**IMPORTANT:** The FTSO interface differs between testnet and mainnet:

| Environment | Method | Interface | Fee |
|-------------|--------|-----------|-----|
| Coston2 (testnet) | `ContractRegistry.getTestFtsoV2()` | `TestFtsoV2Interface` | All view methods, **no fees** |
| Flare (mainnet) | `ContractRegistry.getFtsoV2()` | `FtsoV2Interface` | View calls free; state-changing calls **may require fee** via `IFeeCalculator` |

On Coston2, all FTSO calls are free. On mainnet, some operations may require a fee calculated via `IFeeCalculator`. HSR should use `getFeedByIdInWei()` for 18-decimal precision (simpler math, avoids decimal conversion).

## Feed IDs

```
FLR/USD Feed ID: 0x01464c522f55534400000000000000000000000000
                 (bytes21: category=0x01, "FLR/USD" UTF-8 padded)

Category byte 0x01 = Crypto feeds
Feed name bytes: "FLR/USD" → 0x464c522f555344

Full feed ID construction:
  bytes21 feedId = bytes21(abi.encodePacked(
    uint8(1),                    // category: crypto
    bytes("FLR/USD"),            // feed name
    bytes(14 zero bytes padding) // pad to 20 bytes after category
  ));
```

## Contract Integration

### Getting FtsoV2 Contract Address

```solidity
// Use official Flare periphery contracts — do NOT write custom interfaces
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
// For mainnet, use:
// import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/flare/ContractRegistry.sol";
// import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/flare/FtsoV2Interface.sol";
// import {IFeeCalculator} from "@flarenetwork/flare-periphery-contracts/flare/IFeeCalculator.sol";

// Coston2: use getTestFtsoV2() — all calls free, no fees
function getFtsoV2() internal view returns (TestFtsoV2Interface) {
    return ContractRegistry.getTestFtsoV2();
}

// Mainnet: use getFtsoV2() — some calls may require fee via IFeeCalculator
// function getFtsoV2() internal view returns (FtsoV2Interface) {
//     return ContractRegistry.getFtsoV2();
// }
```

### Querying FLR/USD Price

```solidity
// FTSO v2 returns price with decimals
// e.g., price = 2500000, decimals = 5 → $0.025 per FLR

function getFlrUsdPrice() public view returns (uint256 price, int8 decimals, uint64 timestamp) {
    IFtsoV2 ftsoV2 = getFtsoV2();
    bytes21 feedId = bytes21(0x01464c522f55534400000000000000000000000000);
    
    (price, decimals, timestamp) = ftsoV2.getFeedById(feedId);
    
    // Verify price is recent (not stale)
    require(block.timestamp - timestamp < 300, "FTSO price stale"); // 5 min max age
}
```

### USD to FLR Conversion

```solidity
/// @notice Convert USD cents to FLR wei
/// @param usdCents Price in USD cents (e.g., 500 = $5.00)
/// @return flrWei Amount of FLR in wei
function usdCentsToFlrWei(uint256 usdCents) public view returns (uint256 flrWei) {
    (uint256 price, int8 decimals, ) = getFlrUsdPrice();
    
    // price represents FLR/USD with `decimals` decimal places
    // Example: price = 2500000, decimals = 5 → 1 FLR = $0.025
    //
    // We want: flrWei = (usdCents / 100) / (price / 10^decimals) * 10^18
    // Simplified to avoid precision loss:
    
    if (decimals >= 0) {
        // flrWei = usdCents * 10^(18 + decimals) / (price * 100)
        flrWei = (usdCents * (10 ** (18 + uint8(decimals)))) / (price * 100);
    } else {
        // Handle negative decimals (unlikely but safe)
        flrWei = (usdCents * (10 ** 18)) / (price * 100 * (10 ** uint8(-decimals)));
    }
}

/// @notice Convert with slippage buffer for payment validation
/// @param usdCents Price in USD cents
/// @param slippageBps Slippage in basis points (e.g., 200 = 2%)
/// @return flrWei Minimum FLR required including slippage
function usdCentsToFlrWeiWithSlippage(
    uint256 usdCents, 
    uint256 slippageBps
) public view returns (uint256 flrWei) {
    uint256 baseAmount = usdCentsToFlrWei(usdCents);
    // Add slippage buffer — user must send at least this much
    // Excess is refunded
    flrWei = baseAmount * (10000 + slippageBps) / 10000;
}
```

### Example: Domain Registration Payment

```solidity
function processRegistrationPayment(
    bytes32 tldNamehash,
    string memory label,
    uint256 years
) internal {
    // 1. Get price in USD from pricing strategy
    uint256 priceUsdCents = strategy.getPriceInUsdCents(
        msg.sender, tldNamehash, label, years, false
    );
    
    // 2. Convert to FLR
    uint256 requiredFlr = ftsoOracle.usdCentsToFlrWei(priceUsdCents);
    
    // 3. Verify payment
    require(msg.value >= requiredFlr, "Insufficient FLR payment");
    
    // 4. Process split (95% to TLD owner, 5% platform)
    address tldOwner = hsrTld.ownerOfNamehash(tldNamehash);
    paymentManager.processPayment{value: requiredFlr}(
        tldNamehash, tldOwner, priceUsdCents
    );
    
    // 5. Refund excess
    uint256 excess = msg.value - requiredFlr;
    if (excess > 0) {
        (bool sent, ) = msg.sender.call{value: excess}("");
        require(sent, "Refund failed");
    }
}
```

## FtsoOracle Wrapper Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Official Flare periphery contracts — Coston2 testnet
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
// For mainnet, switch to:
// import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/flare/ContractRegistry.sol";
// import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/flare/FtsoV2Interface.sol";
// import {IFeeCalculator} from "@flarenetwork/flare-periphery-contracts/flare/IFeeCalculator.sol";

contract FtsoOracle {
    bytes21 constant FLR_USD_FEED =
        bytes21(0x01464c522f55534400000000000000000000000000);

    uint256 constant MAX_PRICE_AGE = 300; // 5 minutes
    uint256 constant DEFAULT_SLIPPAGE_BPS = 200; // 2%

    function getFlrUsdPrice() public view returns (
        uint256 price,
        int8 decimals,
        uint64 timestamp
    ) {
        // Coston2: getTestFtsoV2() — all calls free
        // Mainnet: getFtsoV2() — view calls free, state-changing may need IFeeCalculator fee
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        (price, decimals, timestamp) = ftsoV2.getFeedById(FLR_USD_FEED);
        require(block.timestamp - timestamp < MAX_PRICE_AGE, "Stale price");
    }

    /// @notice Alternative: use getFeedByIdInWei() for 18-decimal precision (simpler math)
    function getFlrUsdPriceInWei() public view returns (
        uint256 priceWei,  // 18 decimals, no conversion needed
        uint64 timestamp
    ) {
        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        (priceWei, timestamp) = ftsoV2.getFeedByIdInWei(FLR_USD_FEED);
        require(block.timestamp - timestamp < MAX_PRICE_AGE, "Stale price");
    }

    function usdCentsToFlr(uint256 usdCents) external view returns (uint256) {
        (uint256 price, int8 decimals, ) = getFlrUsdPrice();
        if (decimals >= 0) {
            return (usdCents * (10 ** (18 + uint8(decimals)))) / (price * 100);
        } else {
            return (usdCents * (10 ** 18)) / (price * 100 * (10 ** uint8(-decimals)));
        }
    }

    function usdCentsToFlrWithSlippage(uint256 usdCents) external view returns (uint256) {
        (uint256 price, int8 decimals, ) = getFlrUsdPrice();
        uint256 base;
        if (decimals >= 0) {
            base = (usdCents * (10 ** (18 + uint8(decimals)))) / (price * 100);
        } else {
            base = (usdCents * (10 ** 18)) / (price * 100 * (10 ** uint8(-decimals)));
        }
        return base * (10000 + DEFAULT_SLIPPAGE_BPS) / 10000;
    }
}
```

## Price Lock Mechanism for Renewals

Critical consumer protection feature (from HNS.ID):

```
When a user registers "alice.coolname" for $5/year:
  - Registration price ($5 USD / year) is stored on-chain in the SLD data
  - When renewing, the SAME USD price applies regardless of current pricing
  - TLD owner cannot raise prices on existing registrations
  - Only NEW registrations use updated pricing

This prevents: TLD owner registers subdomains cheaply, then jacks up renewal
prices to extract maximum value from existing holders.

Implementation:
  SldData.registrationPrice = priceUsdCents at time of registration
  On renewal: use SldData.registrationPrice, NOT current strategy price
  Convert stored USD to current FLR via FTSO at renewal time
```

## Frontend Price Display

```javascript
// Frontend should show prices in both USD and FLR
// Query FTSO price to show real-time FLR equivalent

async function getRegistrationPrice(tldNamehash, label, years) {
    // Get USD price from contract
    const priceUsdCents = await strategy.getPriceInUsdCents(
        userAddress, tldNamehash, label, years, false
    );
    
    // Get FLR equivalent from oracle
    const flrWei = await ftsoOracle.usdCentsToFlr(priceUsdCents);
    const flrWithSlippage = await ftsoOracle.usdCentsToFlrWithSlippage(priceUsdCents);
    
    return {
        usd: (priceUsdCents / 100).toFixed(2),
        flr: ethers.formatEther(flrWei),
        flrWithSlippage: ethers.formatEther(flrWithSlippage),
        slippagePercent: 2
    };
}
```

## Key References

- FTSO v2 Documentation: https://dev.flare.network/ftso/overview
- FTSO Solidity Reference: https://dev.flare.network/ftso/solidity-reference
- Feed ID List: https://dev.flare.network/ftso/feeds
- FlareContractRegistry: https://dev.flare.network/network/solidity-reference
