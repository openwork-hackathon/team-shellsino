// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellDice
 * @notice Single-player dice game using $SHELL token
 * @dev Uses blockhash for randomness (good enough for small bets, upgrade to VRF for production)
 */
contract ShellDice is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    
    uint256 public minBet = 1e18;           // 1 $SHELL minimum
    uint256 public maxBet = 100e18;         // 100 $SHELL maximum (lower for house bankroll)
    uint256 public houseEdgeBps = 200;      // 2% house edge
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    int256 public houseProfitLoss;          // Track house P&L (can be negative)
    
    // Agent registry
    mapping(address => bool) public verifiedAgents;
    mapping(address => string) public agentNames;
    
    // Stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    
    struct DiceRoll {
        address player;
        uint256 betAmount;
        uint8 targetNumber;   // 1-99 (roll under this to win)
        uint8 rolledNumber;   // Actual result 1-100
        uint256 payout;
        bool won;
        uint256 timestamp;
    }
    
    DiceRoll[] public rollHistory;
    mapping(address => uint256[]) public playerRollIds;
    
    event DiceRolled(
        uint256 indexed rollId,
        address indexed player,
        uint256 betAmount,
        uint8 targetNumber,
        uint8 rolledNumber,
        uint256 payout,
        bool won
    );
    event AgentVerified(address indexed agent, string name);
    event HouseFunded(uint256 amount);
    
    constructor(address _shellToken) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
    }
    
    modifier onlyVerifiedAgent() {
        require(verifiedAgents[msg.sender], "Not a verified agent");
        _;
    }
    
    /**
     * @notice Register as a verified agent
     * @param name Your agent name
     */
    function registerAgent(string calldata name) external {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Invalid name");
        verifiedAgents[msg.sender] = true;
        agentNames[msg.sender] = name;
        emit AgentVerified(msg.sender, name);
    }
    
    /**
     * @notice Fund the house bankroll
     * @param amount Amount of $SHELL to add
     */
    function fundHouse(uint256 amount) external {
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        emit HouseFunded(amount);
    }
    
    /**
     * @notice Roll the dice
     * @param betAmount Amount to bet
     * @param targetNumber Roll under this number to win (2-98)
     */
    function rollDice(uint256 betAmount, uint8 targetNumber) external onlyVerifiedAgent nonReentrant returns (uint256) {
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");
        require(targetNumber >= 2 && targetNumber <= 98, "Target must be 2-98");
        
        // Calculate potential payout based on odds
        // Win chance = targetNumber - 1 (e.g., target 50 = 49% chance)
        // Fair multiplier = 100 / (targetNumber - 1)
        // Actual multiplier = fair * (1 - houseEdge)
        uint256 winChance = uint256(targetNumber) - 1;
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        uint256 actualMultiplier = (fairMultiplier * (10000 - houseEdgeBps)) / 10000;
        uint256 potentialPayout = (betAmount * actualMultiplier) / 1e18;
        
        // Check house can cover
        uint256 houseBalance = shellToken.balanceOf(address(this));
        require(houseBalance >= potentialPayout, "House cannot cover bet");
        
        // Transfer bet from player
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        // Generate "random" number 1-100 (use VRF in production!)
        uint8 rolledNumber = uint8((uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            msg.sender,
            rollHistory.length
        ))) % 100) + 1);
        
        bool won = rolledNumber < targetNumber;
        uint256 payout = 0;
        
        if (won) {
            payout = potentialPayout;
            wins[msg.sender]++;
            profitLoss[msg.sender] += int256(payout - betAmount);
            houseProfitLoss -= int256(payout - betAmount);
            shellToken.safeTransfer(msg.sender, payout);
        } else {
            losses[msg.sender]++;
            profitLoss[msg.sender] -= int256(betAmount);
            houseProfitLoss += int256(betAmount);
        }
        
        totalGamesPlayed++;
        totalVolume += betAmount;
        totalWagered[msg.sender] += betAmount;
        
        uint256 rollId = rollHistory.length;
        rollHistory.push(DiceRoll({
            player: msg.sender,
            betAmount: betAmount,
            targetNumber: targetNumber,
            rolledNumber: rolledNumber,
            payout: payout,
            won: won,
            timestamp: block.timestamp
        }));
        playerRollIds[msg.sender].push(rollId);
        
        emit DiceRolled(rollId, msg.sender, betAmount, targetNumber, rolledNumber, payout, won);
        
        return rollId;
    }
    
    // View functions
    function getMultiplier(uint8 targetNumber) external view returns (uint256) {
        require(targetNumber >= 2 && targetNumber <= 98, "Invalid target");
        uint256 winChance = uint256(targetNumber) - 1;
        uint256 fairMultiplier = (100 * 1e18) / winChance;
        return (fairMultiplier * (10000 - houseEdgeBps)) / 10000;
    }
    
    function getWinChance(uint8 targetNumber) external pure returns (uint256) {
        require(targetNumber >= 2 && targetNumber <= 98, "Invalid target");
        return uint256(targetNumber) - 1;
    }
    
    function getHouseBalance() external view returns (uint256) {
        return shellToken.balanceOf(address(this));
    }
    
    function getRoll(uint256 rollId) external view returns (DiceRoll memory) {
        return rollHistory[rollId];
    }
    
    function getRecentRolls(uint256 count) external view returns (DiceRoll[] memory) {
        uint256 len = rollHistory.length;
        if (count > len) count = len;
        
        DiceRoll[] memory recent = new DiceRoll[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = rollHistory[len - 1 - i];
        }
        return recent;
    }
    
    function getPlayerRolls(address player, uint256 count) external view returns (DiceRoll[] memory) {
        uint256[] storage ids = playerRollIds[player];
        uint256 len = ids.length;
        if (count > len) count = len;
        
        DiceRoll[] memory rolls = new DiceRoll[](count);
        for (uint256 i = 0; i < count; i++) {
            rolls[i] = rollHistory[ids[len - 1 - i]];
        }
        return rolls;
    }
    
    function getAgentStats(address agent) external view returns (
        uint256 _wins,
        uint256 _losses,
        uint256 _totalWagered,
        int256 _profitLoss,
        string memory _name
    ) {
        return (wins[agent], losses[agent], totalWagered[agent], profitLoss[agent], agentNames[agent]);
    }
    
    // Admin functions
    function setHouseEdge(uint256 _edgeBps) external onlyOwner {
        require(_edgeBps <= 500, "Edge too high"); // Max 5%
        houseEdgeBps = _edgeBps;
    }
    
    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min < _max, "Invalid limits");
        minBet = _min;
        maxBet = _max;
    }
    
    function withdrawProfit(address to, uint256 amount) external onlyOwner {
        require(int256(amount) <= houseProfitLoss, "Cannot withdraw more than profit");
        shellToken.safeTransfer(to, amount);
        houseProfitLoss -= int256(amount);
    }
}
