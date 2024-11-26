// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import {IERC20Decimals} from "contracts/interfaces/IERC20Decimals.sol";
import {FixedPointMathLib} from "contracts/libraries/FixedPointMathLib.sol";

/// @title Concentrated Liquidity Position Manager
/// @notice Manages liquidity positions on Uniswap V3
contract ConcentratedLiquidityPositionManager {
    using FixedPointMathLib for uint256;

    /// @notice Structure to hold deposit amounts for tokens
    struct DepositAmount {
        uint256 token0;
        uint256 token1;
    }

    INonfungiblePositionManager internal immutable NONFUNGIBLE_POSITION_MANAGER;

    /// @notice Event emitted when a new position is minted
    /// @param tokenId The ID of the minted token
    /// @param amount0 The amount of token0 deposited
    /// @param amount1 The amount of token1 deposited
    event MintPosition(uint256 tokenId, uint256 amount0, uint256 amount1);

    /// @notice Modifier to check for non-zero addresses
    /// @param adr The address to check
    modifier notZeroAddress(address adr) {
        require(adr != address(0), "zero address");
        _;
    }

    /// @notice Constructor to initialize the position manager
    /// @param _nonfungiblePositionManager The address of the Nonfungible Position Manager
    constructor(INonfungiblePositionManager _nonfungiblePositionManager) {
        NONFUNGIBLE_POSITION_MANAGER = _nonfungiblePositionManager;
    }

    /// @notice Mints a new liquidity position
    /// @param _poolAddress The address of the Uniswap V3 pool
    /// @param _amount The deposit amounts for the tokens
    /// @param _width The width of the price range
    function mintNewPosition(
        address _poolAddress,
        DepositAmount calldata _amount,
        uint256 _width
    ) external notZeroAddress(_poolAddress) returns (uint256) {
        require(_amount.token0 > 0 && _amount.token1 > 0, "zero amount");
        require(_width > 0, "zero width");

        IUniswapV3Pool pool = IUniswapV3Pool(_poolAddress);

        // Get current tick
        (, int24 tick, , , , , ) = pool.slot0();

        // Get pool fee
        uint24 poolFee = pool.fee();

        // Get token addresses from pool
        address token0Address = pool.token0();
        address token1Address = pool.token1();

        // Transfer tokens from sender
        TransferHelper.safeTransferFrom(token0Address, msg.sender, address(this), _amount.token0);
        TransferHelper.safeTransferFrom(token1Address, msg.sender, address(this), _amount.token1);

        // Approve tokens for pool
        TransferHelper.safeApprove(
            token0Address,
            address(NONFUNGIBLE_POSITION_MANAGER),
            _amount.token0
        );

        TransferHelper.safeApprove(
            token1Address,
            address(NONFUNGIBLE_POSITION_MANAGER),
            _amount.token1
        );

        // Get range ticks
        (int24 rangeTickLower, int24 rangeTickUpper) = _getPriceRange(
            _width,
            _amount,
            token0Address,
            token1Address
        );

        // Mint position
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager
            .MintParams({
                token0: token0Address,
                token1: token1Address,
                fee: poolFee,
                tickLower: tick - rangeTickLower,
                tickUpper: tick + rangeTickUpper,
                amount0Desired: _amount.token0,
                amount1Desired: _amount.token1,
                amount0Min: (_amount.token0 * 95) / 100,
                amount1Min: (_amount.token1 * 95) / 100,
                recipient: msg.sender,
                deadline: block.timestamp
            });

        (uint256 tokenId, , uint256 amount0, uint256 amount1) = NONFUNGIBLE_POSITION_MANAGER.mint(
            params
        );

        emit MintPosition(tokenId, amount0, amount1);

        return tokenId;
    }

    /// @notice Returns the nonfungible position manager
    /// @return The nonfungible position manager
    function nonfanfungiblePositionManager() external view returns (INonfungiblePositionManager) {
        return NONFUNGIBLE_POSITION_MANAGER;
    }

    /// @notice Calculates the price range for the position
    /// @param _width The width of the price range
    /// @param _amount The deposit amounts for the tokens
    /// @param token0Address The address of token0
    /// @param token1Address The address of token1
    /// @return (int24, int24) The lower and upper ticks of the price range
    function _getPriceRange(
        uint256 _width,
        DepositAmount calldata _amount,
        address token0Address,
        address token1Address
    ) internal view returns (int24, int24) {
        uint256 token0Decimals = _getDecimals(token0Address);
        uint256 token1Decimals = _getDecimals(token1Address);

        uint256 token0AmountFP = _amount.token0 * 10 ** (18 - token0Decimals);
        uint256 token1AmountFP = _amount.token1 * 10 ** (18 - token1Decimals);
        uint256 amountRatioFP = token0AmountFP.divWadDown(token1AmountFP) + 1e18;

        uint256 rangeTickLower = (_width * 1e18) / amountRatioFP;
        uint256 rangeTickUpper = _width - rangeTickLower;

        return (int24(rangeTickLower), int24(rangeTickUpper));
    }

    /// @notice Gets the decimals of a ERC20 token
    /// @param tokenAddress The address of the token
    /// @return The decimals of the token
    function _getDecimals(
        address tokenAddress
    ) internal view notZeroAddress(tokenAddress) returns (uint8) {
        try IERC20Decimals(tokenAddress).decimals() returns (uint8 decimals) {
            return decimals;
        } catch {
            revert("decimals failed");
        }
    }
}
