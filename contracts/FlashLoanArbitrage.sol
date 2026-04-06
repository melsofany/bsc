// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPancakePair {
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
    function token0() external view returns (address);
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IRouterV2 {
    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin,
        address[] calldata path, address to, uint deadline
    ) external returns (uint[] memory);
}

// Uniswap V3 — exactInputSingle WITH deadline in struct
interface IRouterUniV3 {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256);
}

// PancakeSwap V3 — exactInputSingle WITHOUT deadline in struct
interface IRouterPancakeV3 {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256);
}

// PancakeSwap V2 Flash Swap Arbitrage — BSC native, no Aave.
//
// sellDexVersion:
//   0 = V2  (swapExactTokensForTokens)
//   1 = Uniswap V3  (exactInputSingle with deadline)
//   2 = PancakeSwap V3 (exactInputSingle without deadline)
contract PancakeFlashArbitrage {

    uint8 public constant DEX_V2         = 0;
    uint8 public constant DEX_UNI_V3     = 1;
    uint8 public constant DEX_PANCAKE_V3 = 2;

    // Single struct used for BOTH the external call and the flash-swap data bytes.
    // Keeping one struct avoids the intermediate local-variable expansion that
    // triggers "stack too deep" when copying ArbInput → FlashParams.
    struct Params {
        address pair;
        address tokenBorrow;
        address tokenOut;
        uint256 loanAmount;
        address buyDex;
        address sellDex;
        uint256 minProfitBps;
        bytes   buyCalldata;    // pre-encoded off-chain; works with any DEX
        uint8   sellDexVersion; // 0=V2 / 1=UniV3 / 2=PancakeV3
        uint24  sellFee;        // V3 fee tier for sell leg (ignored for V2)
        uint256 deadline;
        bytes32 nonce;
    }

    address public owner;
    address public immutable PANCAKE_FACTORY;

    // PancakeSwap V2 fee: 0.25%  →  repay = loan * 10025 / 10000 (ceiling)
    uint256 public constant FLASH_FEE_NUMERATOR   = 25;
    uint256 public constant FLASH_FEE_DENOMINATOR = 10000;

    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;

    mapping(bytes32 => bool) public usedNonces;

    event ArbitrageExecuted(
        address indexed tokenBorrow, uint256 loanAmount, uint256 profit,
        address buyDex, address sellDex, uint256 timestamp
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() { require(msg.sender == owner, "Arb: not owner"); _; }

    modifier nonReentrant() {
        require(_status != _ENTERED, "Arb: reentrant");
        _status = _ENTERED; _; _status = _NOT_ENTERED;
    }

    constructor(address pancakeFactory) {
        owner = msg.sender;
        PANCAKE_FACTORY = pancakeFactory;
        _status = _NOT_ENTERED;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _approveMax(address token, address spender, uint256 needed) internal {
        if (IERC20(token).allowance(address(this), spender) < needed)
            IERC20(token).approve(spender, type(uint256).max);
    }

    function _validPair(address tA, address tB, address pair) internal view {
        require(IPancakeFactory(PANCAKE_FACTORY).getPair(tA, tB) == pair, "Arb: invalid pair");
    }

    // Buy leg: calldata pre-built off-chain → supports V2, UniV3, PancakeV3, any DEX
    function _buy(Params memory p) internal {
        _approveMax(p.tokenBorrow, p.buyDex, p.loanAmount);
        (bool ok, bytes memory err) = p.buyDex.call(p.buyCalldata);
        require(ok, _revertMsg(err));
        require(IERC20(p.tokenOut).balanceOf(address(this)) > 0, "Arb: buy gave no output");
    }

    // Sell leg: uses actual on-chain balance → supports V2, UniV3, PancakeV3
    function _sell(Params memory p) internal {
        uint256 bal = IERC20(p.tokenOut).balanceOf(address(this));
        require(bal > 0, "Arb: zero intermediate");
        _approveMax(p.tokenOut, p.sellDex, bal);

        if (p.sellDexVersion == DEX_UNI_V3) {
            IRouterUniV3(p.sellDex).exactInputSingle(IRouterUniV3.ExactInputSingleParams({
                tokenIn: p.tokenOut, tokenOut: p.tokenBorrow, fee: p.sellFee,
                recipient: address(this), deadline: block.timestamp + 120,
                amountIn: bal, amountOutMinimum: 0, sqrtPriceLimitX96: 0
            }));
        } else if (p.sellDexVersion == DEX_PANCAKE_V3) {
            IRouterPancakeV3(p.sellDex).exactInputSingle(IRouterPancakeV3.ExactInputSingleParams({
                tokenIn: p.tokenOut, tokenOut: p.tokenBorrow, fee: p.sellFee,
                recipient: address(this), amountIn: bal, amountOutMinimum: 0, sqrtPriceLimitX96: 0
            }));
        } else {
            address[] memory path = new address[](2);
            path[0] = p.tokenOut; path[1] = p.tokenBorrow;
            IRouterV2(p.sellDex).swapExactTokensForTokens(bal, 0, path, address(this), block.timestamp + 120);
        }
    }

    function _settle(Params memory p) internal {
        uint256 fee   = (p.loanAmount * FLASH_FEE_NUMERATOR + FLASH_FEE_DENOMINATOR - 1) / FLASH_FEE_DENOMINATOR;
        uint256 repay = p.loanAmount + fee;
        uint256 bal   = IERC20(p.tokenBorrow).balanceOf(address(this));
        require(bal >= repay, "Arb: cannot repay");
        uint256 profit = bal - repay;
        require(profit >= (p.loanAmount * p.minProfitBps) / 10_000, "Arb: profit too low");
        IERC20(p.tokenBorrow).transfer(p.pair, repay);
        emit ArbitrageExecuted(p.tokenBorrow, p.loanAmount, profit, p.buyDex, p.sellDex, block.timestamp);
    }

    function _revertMsg(bytes memory d) internal pure returns (string memory) {
        if (d.length < 68) return "low-level call failed";
        // Skip the 4-byte ABI error selector (0x08c379a0) so abi.decode sees
        // the raw ABI-encoded string payload.
        // We shift the pointer forward by 4 and update the length field
        // in-place — safe because d is not used after this point.
        uint256 newLen = d.length - 4;
        assembly {
            d := add(d, 4)
            mstore(d, newLen)
        }
        return abi.decode(d, (string));
    }

    // ── entry point ──────────────────────────────────────────────────────────

    // Takes a single Params struct to avoid "stack too deep".
    // deadline and nonce are checked here then ignored in pancakeCall.
    function executeArbitrage(Params calldata p) external onlyOwner nonReentrant {
        require(block.timestamp <= p.deadline, "Arb: expired");
        require(!usedNonces[p.nonce], "Arb: nonce used");
        _validPair(p.tokenBorrow, p.tokenOut, p.pair);
        usedNonces[p.nonce] = true;

        bool isToken0  = (p.tokenBorrow == IPancakePair(p.pair).token0());
        uint256 out0   = isToken0 ? p.loanAmount : 0;
        uint256 out1   = isToken0 ? 0 : p.loanAmount;

        // Encode the SAME struct as data — no intermediate copy, no extra stack slots
        IPancakePair(p.pair).swap(out0, out1, address(this), abi.encode(p));
    }

    // ── PancakeSwap V2 flash-swap callback ───────────────────────────────────

    function pancakeCall(address sender, uint256, uint256, bytes calldata data) external {
        Params memory p = abi.decode(data, (Params));
        _validPair(p.tokenBorrow, p.tokenOut, msg.sender);
        require(msg.sender == p.pair,      "Arb: wrong pair");
        require(sender == address(this),   "Arb: wrong sender");

        _buy(p);
        _sell(p);
        _settle(p);
    }

    // ── admin ─────────────────────────────────────────────────────────────────

    function withdraw(address token) external onlyOwner {
        if (token == address(0)) {
            (bool ok,) = payable(owner).call{value: address(this).balance}("");
            require(ok, "Arb: BNB fail");
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            require(bal > 0, "Arb: zero");
            IERC20(token).transfer(owner, bal);
        }
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Arb: zero addr");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    receive() external payable {}
}
