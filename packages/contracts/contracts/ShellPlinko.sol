// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellPlinko
 * @notice Plinko game with peg board mechanics
 * @dev Ball drops through pegs, lands in multiplier slots at bottom
 */
contract ShellPlinko is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1% protocol fee
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_ROWS = 16;
    uint256 public constant MIN_ROWS = 8;
    
    // ============ State ============
    IERC20 public immutable shellToken;
    address public feeRecipient;
    
    uint256 public minBet = 1e18; // 1 SHELL
    uint256 public maxBet = 500e18; // 500 SHELL
    
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;
    int256 public houseProfitLoss;
    
    // Risk levels: 0 = Low, 1 = Medium, 2 = High
    // Each has different multiplier distributions
    uint8[17][3] public multiplierTables;
    
    // Player stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    mapping(address => uint256) public biggestWin;
    
    // Game data
    struct Drop {
        address player;
        uint256 betAmount;
        uint8 numRows;      // 8-16
        uint8 riskLevel;    // 0=Low, 1=Medium, 2=High
        uint8 finalSlot;    // Which slot the ball landed in (0 to numRows)
        uint256 multiplier; // In basis points (10000 = 1x)
        uint256 payout;
        uint256 timestamp;
    }
    
    Drop[] public dropHistory;
    mapping(address => uint256[]) public playerDropIds;
    mapping(address => uint256) public lastDropTime;
    
    // ============ Events ============
    event BallDropped(
        uint256 indexed dropId,
        address indexed player,
        uint256 betAmount,
        uint8 numRows,
        uint8 riskLevel,
        uint8 finalSlot,
        uint256 multiplier,
        uint256 payout
    );
    
    event BetLimitsUpdated(uint256 minBet, uint256 maxBet);
    event FeeRecipientUpdated(address newRecipient);
    event HouseFunded(address indexed funder, uint256 amount);
    
    // ============ Errors ============
    error InvalidBet();
    error InvalidRowCount();
    error InvalidRiskLevel();
    error InsufficientHouseBalance();
    error DropTooFrequent();
    
    constructor(
        address _shellToken,
        address _feeRecipient
    ) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        feeRecipient = _feeRecipient;
        
        // Initialize multiplier tables
        // Low risk: More consistent payouts, lower max
        // Multipliers are in basis points (10000 = 1x)
        _initializeMultiplierTables();
    }
    
    function _initializeMultiplierTables() internal {
        // LOW RISK (0) - More green slots, max 16x
        // 8 rows
        multiplierTables[0] = [5500, 7400, 10000, 15000, 25000, 15000, 10000, 7400, 5500, 0, 0, 0, 0, 0, 0, 0, 0];
        // 9 rows
        multiplierTables[1] = [5000, 7100, 9100, 12100, 18100, 12100, 9100, 7100, 5000, 0, 0, 0, 0, 0, 0, 0, 0];
        // 10 rows
        multiplierTables[2] = [5000, 6600, 8100, 11100, 16100, 11100, 8100, 6600, 5000, 0, 0, 0, 0, 0, 0, 0, 0];
        // 11 rows
        multiplierTables[3] = [5000, 6100, 7100, 10100, 14100, 10100, 7100, 6100, 5000, 0, 0, 0, 0, 0, 0, 0, 0];
        // 12 rows
        multiplierTables[4] = [500, 3300, 5800, 8300, 13300, 8300, 5800, 3300, 500, 0, 0, 0, 0, 0, 0, 0, 0];
        // 13 rows
        multiplierTables[5] = [500, 2800, 4800, 7300, 10800, 7300, 4800, 2800, 500, 0, 0, 0, 0, 0, 0, 0, 0];
        // 14 rows
        multiplierTables[6] = [0, 2300, 3800, 6300, 8800, 6300, 3800, 2300, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        // 15 rows
        multiplierTables[7] = [0, 1800, 3300, 5300, 7800, 5300, 3300, 1800, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        // 16 rows
        multiplierTables[8] = [0, 1300, 2800, 4300, 6800, 4300, 2800, 1300, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        
        // MEDIUM RISK (1) - Balanced distribution, max 110x
        multiplierTables[9] = [3000, 5600, 8100, 13100, 30000, 13100, 8100, 5600, 3000, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[10] = [2600, 5100, 7600, 11600, 26000, 11600, 7600, 5100, 2600, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[11] = [2200, 4600, 7100, 10600, 24000, 10600, 7100, 4600, 2200, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[12] = [1800, 4100, 6600, 9600, 22000, 9600, 6600, 4100, 1800, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[13] = [1400, 3600, 5600, 8600, 18000, 8600, 5600, 3600, 1400, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[14] = [1000, 3100, 4600, 7600, 15000, 7600, 4600, 3100, 1000, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[15] = [600, 2600, 4100, 6600, 13000, 6600, 4100, 2600, 600, 0, 0, 0, 0, 0, 0, 0, 0];
        multiplierTables[16] = [500, 2100, 3600, 5600, 11000, 5600, 3600, 2100, 500, 0, 0, 0, 0, 0, 0, 0, 0];
        
        // HIGH RISK (2) - Extreme variance, max 1000x
        multiplierTables[17] = [500, 2100, 4100, 9100, 100000, 9100, 4100, 2100, 500, 0, 0, 0, 0, 0, 0, 0, 0];
        // ... and so on for other row counts
    }
    
    // ============ Admin Functions ============
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }
    
    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        if (_min >= _max) revert InvalidBet();
        minBet = _min;
        maxBet = _max;
        emit BetLimitsUpdated(_min, _max);
    }
    
    function updateMultiplierTable(
        uint8 riskLevel,
        uint8 rowCount,
        uint8[17] calldata multipliers
    ) external onlyOwner {
        if (riskLevel > 2) revert InvalidRiskLevel();
        if (rowCount < MIN_ROWS || rowCount > MAX_ROWS) revert InvalidRowCount();
        
        uint8 tableIndex = riskLevel * 9 + (rowCount - 8);
        multiplierTables[tableIndex] = multipliers;
    }
    
    function fundHouse(uint256 amount) external {
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(msg.sender, amount);
    }
    
    // ============ Core Game Functions ============
    
    /**
     * @notice Drop a ball in Plinko
     * @param betAmount Amount to bet
     * @param numRows Number of rows (8-16). More rows = more variance
     * @param riskLevel 0=Low, 1=Medium, 2=High
     */
    function drop(
        uint256 betAmount,
        uint8 numRows,
        uint8 riskLevel
    ) external nonReentrant returns (uint256) {
        // Validate inputs
        if (betAmount < minBet || betAmount > maxBet) revert InvalidBet();
        if (numRows < MIN_ROWS || numRows > MAX_ROWS) revert InvalidRowCount();
        if (riskLevel > 2) revert InvalidRiskLevel();
        
        // Anti-spam
        if (block.timestamp - lastDropTime[msg.sender] < 1) revert DropTooFrequent();
        lastDropTime[msg.sender] = block.timestamp;
        
        // Get multipliers for this configuration
        uint8 tableIndex = riskLevel * 9 + (numRows - 8);
        uint8[17] memory multipliers = multiplierTables[tableIndex];
        
        // Find max multiplier for this configuration
        uint256 maxMultiplier = 0;
        for (uint8 i = 0; i <= numRows; i++) {
            if (multipliers[i] > maxMultiplier) {
                maxMultiplier = multipliers[i];
            }
        }
        
        // Calculate max potential payout
        uint256 protocolFee = (betAmount * PROTOCOL_FEE_BPS) / BASIS_POINTS;
        uint256 netBet = betAmount - protocolFee;
        uint256 maxPayout = (netBet * maxMultiplier) / BASIS_POINTS;
        
        // Check house balance
        uint256 houseBalance = shellToken.balanceOf(address(this));
        if (houseBalance < maxPayout) revert InsufficientHouseBalance();
        
        // Take bet
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        shellToken.safeTransfer(feeRecipient, protocolFee);
        totalFeesCollected += protocolFee;
        
        // Simulate ball drop through pegs
        uint8 finalSlot = _simulateDrop(numRows);
        
        // Get multiplier for final slot
        uint256 multiplier = multipliers[finalSlot];
        uint256 payout = (netBet * multiplier) / BASIS_POINTS;
        
        // Determine win/loss
        bool won = payout > netBet;
        
        if (payout > 0) {
            shellToken.safeTransfer(msg.sender, payout);
        }
        
        // Update stats
        if (won) {
            wins[msg.sender]++;
            if (payout > biggestWin[msg.sender]) {
                biggestWin[msg.sender] = payout;
            }
        } else {
            losses[msg.sender]++;
        }
        
        profitLoss[msg.sender] += int256(payout) - int256(netBet);
        houseProfitLoss += int256(netBet) - int256(payout);
        
        totalGamesPlayed++;
        totalVolume += betAmount;
        totalWagered[msg.sender] += betAmount;
        
        // Store drop
        uint256 dropId = dropHistory.length;
        dropHistory.push(Drop({
            player: msg.sender,
            betAmount: netBet,
            numRows: numRows,
            riskLevel: riskLevel,
            finalSlot: finalSlot,
            multiplier: multiplier,
            payout: payout,
            timestamp: block.timestamp
        }));
        playerDropIds[msg.sender].push(dropId);
        
        emit BallDropped(
            dropId,
            msg.sender,
            betAmount,
            numRows,
            riskLevel,
            finalSlot,
            multiplier,
            payout
        );
        
        return dropId;
    }
    
    /**
     * @dev Simulate ball bouncing through pegs
     * At each peg, ball goes left or right (50/50)
     * Final position determines multiplier
     */
    function _simulateDrop(uint8 numRows) internal view returns (uint8) {
        int8 position = 0;
        
        for (uint8 row = 0; row < numRows; row++) {
            // Generate random direction
            bool goRight = _randomBool(row);
            
            if (goRight) {
                position++;
            } else {
                position--;
            }
        }
        
        // Convert position to slot index (0 to numRows)
        // Position ranges from -numRows to +numRows in steps of 2
        // Slot = (position + numRows) / 2
        return uint8((int16(position) + int16(numRows)) / 2);
    }
    
    function _randomBool(uint256 seed) internal view returns (bool) {
        uint256 entropy = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            dropHistory.length,
            seed
        )));
        return entropy % 2 == 0;
    }
    
    // ============ View Functions ============
    
    function getMultipliers(uint8 numRows, uint8 riskLevel) external view returns (uint256[] memory) {
        uint8 tableIndex = riskLevel * 9 + (numRows - 8);
        uint8[17] memory mults = multiplierTables[tableIndex];
        
        uint256[] memory result = new uint256[](numRows + 1);
        for (uint8 i = 0; i <= numRows; i++) {
            result[i] = mults[i];
        }
        return result;
    }
    
    function getPotentialPayout(
        uint256 betAmount,
        uint8 numRows,
        uint8 riskLevel,
        uint8 slot
    ) external view returns (uint256) {
        uint8 tableIndex = riskLevel * 9 + (numRows - 8);
        uint256 multiplier = multiplierTables[tableIndex][slot];
        uint256 netBet = (betAmount * (BASIS_POINTS - PROTOCOL_FEE_BPS)) / BASIS_POINTS;
        return (netBet * multiplier) / BASIS_POINTS;
    }
    
    function getMaxPayout(uint256 betAmount, uint8 numRows, uint8 riskLevel) external view returns (uint256) {
        uint8 tableIndex = riskLevel * 9 + (numRows - 8);
        uint8[17] memory mults = multiplierTables[tableIndex];
        
        uint256 maxMult = 0;
        for (uint8 i = 0; i <= numRows; i++) {
            if (mults[i] > maxMult) maxMult = mults[i];
        }
        
        uint256 netBet = (betAmount * (BASIS_POINTS - PROTOCOL_FEE_BPS)) / BASIS_POINTS;
        return (netBet * maxMult) / BASIS_POINTS;
    }
    
    function getDrop(uint256 dropId) external view returns (Drop memory) {
        return dropHistory[dropId];
    }
    
    function getRecentDrops(uint256 count) external view returns (Drop[] memory) {
        uint256 len = dropHistory.length;
        if (count > len) count = len;
        
        Drop[] memory recent = new Drop[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = dropHistory[len - 1 - i];
        }
        return recent;
    }
    
    function getPlayerDrops(address player, uint256 count) external view returns (Drop[] memory) {
        uint256[] storage ids = playerDropIds[player];
        uint256 len = ids.length;
        if (count > len) count = len;
        
        Drop[] memory drops = new Drop[](count);
        for (uint256 i = 0; i < count; i++) {
            drops[i] = dropHistory[ids[len - 1 - i]];
        }
        return drops;
    }
    
    function getPlayerStats(address player) external view returns (
        uint256 _wins,
        uint256 _losses,
        uint256 _totalWagered,
        int256 _profitLoss,
        uint256 _biggestWin,
        uint256 _winRate
    ) {
        _wins = wins[player];
        _losses = losses[player];
        _totalWagered = totalWagered[player];
        _profitLoss = profitLoss[player];
        _biggestWin = biggestWin[player];
        
        uint256 totalGames = _wins + _losses;
        _winRate = totalGames > 0 ? (_wins * 100) / totalGames : 0;
    }
    
    function getHouseStats() external view returns (
        uint256 balance,
        int256 profitLoss,
        uint256 totalGames,
        uint256 volume,
        uint256 fees
    ) {
        balance = shellToken.balanceOf(address(this));
        profitLoss = houseProfitLoss;
        totalGames = totalGamesPlayed;
        volume = totalVolume;
        fees = totalFeesCollected;
    }
    
    /**
     * @notice Calculate expected RTP for a configuration
     */
    function getExpectedRTP(uint8 numRows, uint8 riskLevel) external view returns (uint256 rtpBps) {
        uint8 tableIndex = riskLevel * 9 + (numRows - 8);
        uint8[17] memory mults = multiplierTables[tableIndex];
        
        // Calculate probability for each slot using Pascal's triangle / binomial distribution
        // For n rows, probability of landing in slot k is C(n,k) / 2^n
        uint256 totalExpected = 0;
        uint256 netBetBasis = BASIS_POINTS - PROTOCOL_FEE_BPS;
        
        for (uint8 slot = 0; slot <= numRows; slot++) {
            uint256 probability = _binomialProbability(numRows, slot);
            uint256 slotValue = (mults[slot] * netBetBasis) / BASIS_POINTS;
            totalExpected += (probability * slotValue) / 1e18;
        }
        
        // RTP as percentage of bet
        rtpBps = (totalExpected * BASIS_POINTS) / 1e18;
    }
    
    /**
     * @dev Calculate binomial probability C(n,k) / 2^n
     * Returns probability as fixed point with 18 decimals
     */
    function _binomialProbability(uint8 n, uint8 k) internal pure returns (uint256) {
        uint256 combinations = _binomialCoefficient(n, k);
        uint256 denominator = 2 ** n;
        return (combinations * 1e18) / denominator;
    }
    
    function _binomialCoefficient(uint8 n, uint8 k) internal pure returns (uint256) {
        if (k > n) return 0;
        if (k == 0 || k == n) return 1;
        
        uint256 result = 1;
        for (uint8 i = 0; i < k; i++) {
            result = result * (n - i) / (i + 1);
        }
        return result;
    }
}
