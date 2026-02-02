// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellSlots - Classic 3-Reel Slots
 * @notice Simple slots game where players bet $SHELL and win based on symbol combinations
 * @dev Uses blockhash for randomness (sufficient for low-stakes slots)
 */
contract ShellSlots is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1%
    uint256 public constant MAX_PAYOUT = 100; // 100x bet for jackpot
    
    // Symbol weights (out of 1000)
    // 0 = Cherry (low), 1 = Lemon (low), 2 = Orange (med), 3 = Plum (med)
    // 4 = Bell (high), 5 = Seven (high), 6 = BAR (jackpot)
    uint256[7] public symbolWeights = [200, 200, 150, 150, 150, 100, 50];
    uint256 public constant TOTAL_WEIGHT = 1000;
    
    // Multipliers for 3-of-a-kind (in basis points, 10000 = 1x)
    // Cherry = 2x, Lemon = 3x, Orange = 5x, Plum = 8x, Bell = 15x, Seven = 50x, BAR = 100x
    uint256[7] public symbolMultipliers = [20000, 30000, 50000, 80000, 150000, 500000, 1000000];

    // ============ State ============
    IERC20 public immutable shellToken;
    address public feeRecipient;
    address public bankroll;
    
    uint256 public minBet = 1e18;      // 1 SHELL
    uint256 public maxBet = 100e18;    // 100 SHELL
    uint256 public houseBalance;
    
    uint256 public spinCounter;
    uint256 public totalWagered;
    uint256 public totalPaidOut;
    
    struct Spin {
        address player;
        uint256 bet;
        uint256[3] reels;
        uint256 payout;
        uint256 timestamp;
        bool settled;
    }
    
    mapping(uint256 => Spin) public spins;
    mapping(address => uint256[]) public playerSpins;
    
    // ============ Events ============
    event SpinCreated(uint256 indexed spinId, address indexed player, uint256 bet);
    event SpinResult(uint256 indexed spinId, uint256[3] reels, uint256 payout, string result);
    event BankrollDeposit(address indexed from, uint256 amount);
    event BankrollWithdraw(address indexed to, uint256 amount);
    
    // ============ Errors ============
    error InvalidBet();
    error InsufficientBankroll();
    error InvalidReels();
    error SpinNotFound();
    error AlreadySettled();
    
    constructor(address _shellToken, address _feeRecipient) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        feeRecipient = _feeRecipient;
    }
    
    // ============ Admin Functions ============
    
    function setBankroll(address _bankroll) external onlyOwner {
        bankroll = _bankroll;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }
    
    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        minBet = _min;
        maxBet = _max;
    }
    
    function depositBankroll(uint256 amount) external nonReentrant {
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        houseBalance += amount;
        emit BankrollDeposit(msg.sender, amount);
    }
    
    function withdrawBankroll(uint256 amount) external onlyOwner nonReentrant {
        if (amount > houseBalance) revert InsufficientBankroll();
        houseBalance -= amount;
        shellToken.safeTransfer(msg.sender, amount);
        emit BankrollWithdraw(msg.sender, amount);
    }
    
    // ============ Core Game Functions ============
    
    /**
     * @notice Spin the slots! Bet SHELL and get random reels
     * @param betAmount Amount of SHELL to bet
     * @return spinId Unique ID for this spin
     */
    function spin(uint256 betAmount) external nonReentrant returns (uint256 spinId) {
        if (betAmount < minBet || betAmount > maxBet) revert InvalidBet();
        
        // Calculate max potential payout (jackpot = 100x)
        uint256 maxPotentialPayout = betAmount * MAX_PAYOUT / 100;
        if (houseBalance < maxPotentialPayout) revert InsufficientBankroll();
        
        // Take bet
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        // Take fee
        uint256 fee = betAmount * PROTOCOL_FEE_BPS / 10000;
        uint256 netBet = betAmount - fee;
        shellToken.safeTransfer(feeRecipient, fee);
        
        // Generate random reels
        uint256[3] memory reels = _generateReels();
        
        // Calculate payout
        uint256 payout = _calculatePayout(netBet, reels);
        
        // Update state
        spinId = spinCounter++;
        spins[spinId] = Spin({
            player: msg.sender,
            bet: netBet,
            reels: reels,
            payout: payout,
            timestamp: block.timestamp,
            settled: true
        });
        playerSpins[msg.sender].push(spinId);
        
        totalWagered += netBet;
        
        // Pay out if winner
        if (payout > 0) {
            houseBalance -= payout;
            totalPaidOut += payout;
            shellToken.safeTransfer(msg.sender, payout);
        } else {
            houseBalance += netBet;
        }
        
        // Determine result string
        string memory result = _getResultString(reels, payout > 0);
        
        emit SpinCreated(spinId, msg.sender, betAmount);
        emit SpinResult(spinId, reels, payout, result);
        
        return spinId;
    }
    
    // ============ Internal Functions ============
    
    function _generateReels() internal view returns (uint256[3] memory) {
        uint256 seed = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            msg.sender,
            spinCounter,
            block.timestamp
        )));
        
        return [
            _getSymbolFromRandom(seed),
            _getSymbolFromRandom(seed >> 8),
            _getSymbolFromRandom(seed >> 16)
        ];
    }
    
    function _getSymbolFromRandom(uint256 random) internal view returns (uint256) {
        uint256 roll = random % TOTAL_WEIGHT;
        uint256 cumulative;
        
        for (uint256 i = 0; i < 7; i++) {
            cumulative += symbolWeights[i];
            if (roll < cumulative) return i;
        }
        return 0; // Fallback to cherry
    }
    
    function _calculatePayout(uint256 bet, uint256[3] memory reels) internal view returns (uint256) {
        // All three match = 3-of-a-kind
        if (reels[0] == reels[1] && reels[1] == reels[2]) {
            return bet * symbolMultipliers[reels[0]] / 10000;
        }
        
        // Any two match = small win (2x)
        if (reels[0] == reels[1] || reels[1] == reels[2] || reels[0] == reels[2]) {
            return bet * 2;
        }
        
        // Any cherry = consolation (0.5x)
        if (reels[0] == 0 || reels[1] == 0 || reels[2] == 0) {
            return bet / 2;
        }
        
        return 0; // Loss
    }
    
    function _getResultString(uint256[3] memory reels, bool win) internal pure returns (string memory) {
        string[7] memory symbols = ["Cherry", "Lemon", "Orange", "Plum", "Bell", "Seven", "BAR"];
        
        if (reels[0] == reels[1] && reels[1] == reels[2]) {
            if (reels[0] == 6) return "JACKPOT! Triple BAR!";
            if (reels[0] == 5) return "Triple Seven! Big Win!";
            return string(abi.encodePacked("Triple ", symbols[reels[0]], "!"));
        }
        
        if (win) return "Two match - Small Win!";
        return "No match - Try again!";
    }
    
    // ============ View Functions ============
    
    function getSpin(uint256 spinId) external view returns (Spin memory) {
        return spins[spinId];
    }
    
    function getPlayerSpins(address player) external view returns (uint256[] memory) {
        return playerSpins[player];
    }
    
    function getSymbolName(uint256 symbol) external pure returns (string memory) {
        string[7] memory names = ["Cherry", "Lemon", "Orange", "Plum", "Bell", "Seven", "BAR"];
        return names[symbol];
    }
    
    function getExpectedValue() external view returns (uint256 rtp) {
        // Calculate RTP based on weights and multipliers
        uint256 totalWeight;
        uint256 expectedValue;
        
        for (uint256 i = 0; i < 7; i++) {
            // 3-of-a-kind probability
            uint256 weight = symbolWeights[i];
            uint256 prob3 = weight * weight * weight;
            expectedValue += prob3 * symbolMultipliers[i] / 10000;
            totalWeight += weight;
        }
        
        // Normalize
        uint256 totalProb = totalWeight ** 3;
        rtp = expectedValue * 10000 / totalProb;
    }
}
