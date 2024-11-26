// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IERC20Decimals is IERC20 {
    function decimals() external view returns (uint8);
}
