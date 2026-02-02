// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellDiceV2
 * @notice Improved dice game with multiplier payouts and enhanced features
 * @dev Single-player dice game with adjustable risk/reward
 */
contract ShellDiceV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1% protocol fee
    uint256 public constant MAX_HOUSE_EDGE_BPS = 500; // Max 5% house edge
    uint256 public constant MIN_HOUSE_EDGE_BPS = 50; // Min 0.5% house edge
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MAX_MULTIPLIER = 10000; // Max 100x multiplier

    // ============ State ============
    IERC20 public immutable shellToken;
    address public feeRecipient;
    
    uint256 public minBet = 1e18; // 1 SHELL
    uint256 public maxBet = 1000e18; // 1000 SHELL
    uint256 public houseEdgeBps = 200; // 2% default house edge
    
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;
    int256 public houseProfitLoss;
    
    // Player stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    mapping(address => uint256) public biggestWin;
    
    // Roll data
    struct Roll {
        address player;
        uint256 betAmount;
        uint8 targetNumber;    // Target for roll under
        uint8 rolledNumber;    // Actual result 1-100
        uint256 multiplier;    // Actual multiplier used
        uint256 payout;
        bool won;
        uint256 timestamp;
        bool rollOver;         // true = roll over, false = roll under
    }
    
    Roll[] public rollHistory;
    mapping(address => uint256[]) public playerRollIds;
    mapping(address => uint256) public lastRollTime;
    
    // ============ Events ============
    event DiceRolled(
        uint256 indexed rollId,
        address indexed player,
        uint256 betAmount,
        uint8 targetNumber,
        uint8 rolledNumber,
        uint256 multiplier,
        uint256 payout,
        bool won,
        bool rollOver
    );
    
    event BetLimitsUpdated(uint256 minBet, uint256 maxBet);
    event HouseEdgeUpdated(uint256 newEdgeBps);
    event FeeRecipientUpdated(address newRecipient);
    event HouseFunded(address indexed funder, uint256 amount);
    event HouseWithdrawn(address indexed to, uint256 amount);
    
    // ============ Errors ============
    error InvalidBet();
    error InvalidTarget();
    error InsufficientHouseBalance();
    error RollTooFrequent();
    error InvalidHouseEdge();
    error TransferFailed();
    
    constructor(
        address _shellToken,
        address _feeRecipient
    ) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        feeRecipient = _feeRecipient;
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
    
    function setHouseEdge(uint256 _edgeBps) external onlyOwner {
        if (_edgeBps < MIN_HOUSE_EDGE_BPS || _edgeBps > MAX_HOUSE_EDGE_BPS) {
            revert InvalidHouseEdge();
        }
        houseEdgeBps = _edgeBps;
        emit HouseEdgeUpdated(_edgeBps);
    }
    
    function fundHouse(uint256 amount) external {
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(msg.sender, amount);
    }
    
    function withdrawHouseFunds(uint256 amount, address to) external onlyOwner {
        uint256 houseBalance = shellToken.balanceOf(address(this));
        if (amount > houseBalance) revert InsufficientHouseBalance();
        
        // Only allow withdrawing excess beyond pending liabilities
        // Calculate max safe withdrawal
        int256 maxSafeWithdrawal = int256(houseBalance) - houseProfitLoss;
        if (int256(amount) > maxSafeWithdrawal) revert InsufficientHouseBalance();
        
        shellToken.safeTransfer(to, amount);
        emit HouseWithdrawn(to, amount);
    }
    
    // ============ Core Game Functions ============
    
    /**
     * @notice Roll the dice - Roll UNDER target to win
     * @param betAmount Amount to bet
     * @param targetNumber Target number (2-98). Roll UNDER this to win.
     */
    function rollUnder(uint256 betAmount, uint8 targetNumber) external nonReentrant returns (uint256) {
        return _roll(betAmount, targetNumber, false);
    }
    
    /**
     * @notice Roll the dice - Roll OVER target to win
     * @param betAmount Amount to bet
     * @param targetNumber Target number (2-98). Roll OVER this to win.
     */
    function rollOver(uint256 betAmount, uint8 targetNumber) external nonReentrant returns (uint256) {
        return _roll(betAmount, targetNumber, true);
    }
    
    function _roll(uint256 betAmount, uint8 targetNumber, bool rollOver) internal returns (uint256) {
        // Validate bet
        if (betAmount < minBet || betAmount > maxBet) revert InvalidBet();
        if (targetNumber < 2 || targetNumber > 98) revert InvalidTarget();
        
        // Anti-spam: min 1 second between rolls from same player
        if (block.timestamp - lastRollTime[msg.sender] < 1) revert RollTooFrequent();
        lastRollTime[msg.sender] = block.timestamp;
        
        // Calculate win chance and multiplier
        uint256 winChance;
        if (rollOver) {
            winChance = 100 - targetNumber; // e.g., target 50 = 50% chance to roll over
        } else {
            winChance = targetNumber - 1; // e.g., target 50 = 49% chance to roll under
        }
        
        // Calculate multiplier with house edge
        // Fair multiplier = 100 / winChance
        // With house edge = (100 / winChance) * (1 - houseEdge)
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        uint256 actualMultiplier = (fairMultiplier * (BASIS_POINTS - houseEdgeBps)) / BASIS_POINTS;
        
        // Cap multiplier at max
        if (actualMultiplier > MAX_MULTIPLIER * 1e18) {
            actualMultiplier = MAX_MULTIPLIER * 1e18;
        }
        
        uint256 potentialPayout = (betAmount * actualMultiplier) / 1e18;
        
        // Check house can cover (bet + potential win)
        uint256 houseBalance = shellToken.balanceOf(address(this));
        if (houseBalance < potentialPayout) revert InsufficientHouseBalance();
        
        // Take bet + protocol fee
        uint256 protocolFee = (betAmount * PROTOCOL_FEE_BPS) / BASIS_POINTS;
        uint256 netBet = betAmount - protocolFee;
        
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        shellToken.safeTransfer(feeRecipient, protocolFee);
        
        totalFeesCollected += protocolFee;
        
        // Generate random number 1-100
        uint8 rolledNumber = _generateRandomNumber();
        
        // Determine win/loss
        bool won;
        if (rollOver) {
            won = rolledNumber > targetNumber;
        } else {
            won = rolledNumber < targetNumber;
        }
        
        uint256 payout = 0;
        
        if (won) {
            payout = potentialPayout;
            wins[msg.sender]++;
            profitLoss[msg.sender] += int256(payout - netBet);
            houseProfitLoss -= int256(payout - netBet);
            
            if (payout > biggestWin[msg.sender]) {
                biggestWin[msg.sender] = payout;
            }
            
            shellToken.safeTransfer(msg.sender, payout);
        } else {
            losses[msg.sender]++;
            profitLoss[msg.sender] -= int256(netBet);
            houseProfitLoss += int256(netBet);
        }
        
        // Update stats
        totalGamesPlayed++;
        totalVolume += betAmount;
        totalWagered[msg.sender] += betAmount;
        
        // Store roll
        uint256 rollId = rollHistory.length;
        rollHistory.push(Roll({
            player: msg.sender,
            betAmount: netBet,
            targetNumber: targetNumber,
            rolledNumber: rolledNumber,
            multiplier: actualMultiplier,
            payout: payout,
            won: won,
            timestamp: block.timestamp,
            rollOver: rollOver
        }));
        playerRollIds[msg.sender].push(rollId);
        
        emit DiceRolled(
            rollId,
            msg.sender,
            betAmount,
            targetNumber,
            rolledNumber,
            actualMultiplier,
            payout,
            won,
            rollOver
        );
        
        return rollId;
    }
    
    function _generateRandomNumber() internal view returns (uint8) {
        // Combine multiple sources of entropy
        uint256 entropy = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            rollHistory.length,
            block.number
        )));
        
        return uint8((entropy % 100) + 1); // 1-100
    }
    
    // ============ View Functions ============
    
    function getMultiplier(uint8 targetNumber, bool rollOver) external view returns (uint256) {
        uint256 winChance = rollOver ? 100 - targetNumber : targetNumber - 1;
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        return (fairMultiplier * (BASIS_POINTS - houseEdgeBps)) / BASIS_POINTS;
    }
    
    function getWinChance(uint8 targetNumber, bool rollOver) external pure returns (uint256) {
        return rollOver ? 100 - targetNumber : targetNumber - 1;
    }
    
    function getPotentialPayout(uint256 betAmount, uint8 targetNumber, bool rollOver) external view returns (uint256) {
        uint256 winChance = rollOver ? 100 - targetNumber : targetNumber - 1;
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        uint256 actualMultiplier = (fairMultiplier * (BASIS_POINTS - houseEdgeBps)) / BASIS_POINTS;
        return (betAmount * actualMultiplier) / 1e18;
    }
    
    function getRoll(uint256 rollId) external view returns (Roll memory) {
        return rollHistory[rollId];
    }
    
    function getRecentRolls(uint256 count) external view returns (Roll[] memory) {
        uint256 len = rollHistory.length;
        if (count > len) count = len;
        
        Roll[] memory recent = new Roll[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = rollHistory[len - 1 - i];
        }
        return recent;
    }
    
    function getPlayerRolls(address player, uint256 count) external view returns (Roll[] memory) {
        uint256[] storage ids = playerRollIds[player];
        uint256 len = ids.length;
        if (count > len) count = len;
        
        Roll[] memory rolls = new Roll[](count);
        for (uint256 i = 0; i < count; i++) {
            rolls[i] = rollHistory[ids[len - 1 - i]];
        }
        return rolls;
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
    
    function getExpectedValue(uint8 targetNumber, bool rollOver) external view returns (uint256 rtp) {
        // Calculate Return To Player percentage
        uint256 winChance = rollOver ? 100 - targetNumber : targetNumber - 1;
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        uint256 actualMultiplier = (fairMultiplier * (BASIS_POINTS - houseEdgeBps)) / BASIS_POINTS;
        
        // RTP = winChance% * multiplier + (100-winChance)% * 0
        rtp = (winChance * actualMultiplier) / 1e18;
    }
}
