// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockShell
 * @notice Test token for Sepolia testing
 */
contract MockShell is ERC20 {
    constructor() ERC20("Mock Shell", "mSHELL") {
        // Mint 1 billion tokens to deployer for testing
        _mint(msg.sender, 1_000_000_000 * 10**18);
    }
    
    // Anyone can mint for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
