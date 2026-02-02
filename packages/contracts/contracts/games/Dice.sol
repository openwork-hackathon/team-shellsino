// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// Interface for HouseBankroll
interface IHouseBankroll {
    function depositProfit(uint256 amount) external;
    function payLoss(address winner, uint256 amount) external;
    function canCover(uint256 amount) external view returns (bool);
}

/**
 * @title Dice - Player vs House
 * @notice Roll under your target to win. Lower target = higher payout.
 * @dev Uses commit-reveal for randomness, integrates with house bankroll
 * 
 * Example:
 *   Target 50: Win if roll < 50 (49% chance), pays ~2x
 *   Target 10: Win if roll < 10 (9% chance), pays ~10x
 *   Target 95: Win if roll < 95 (94% chance), pays ~1.05x
 */
contract Dice is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant HOUSE_EDGE_BPS = 200; // 2% house edge
    uint256 public constant MIN_TARGET = 2;       // Minimum target (2% win chance)
    uint256 public constant MAX_TARGET = 98;      // Maximum target (98% win chance)
    uint256 public constant ROLL_RANGE = 100;     // Roll 0-99
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1% protocol fee on wins

    // ============ State ============
    IERC20 public immutable shellToken;
    address public houseBankroll;
    address public feeRecipient;
    
    uint256 public minBet = 1e18;      // 1 SHELL
    uint256 public maxBet = 1000e18;   // 1000 SHELL
    uint256 public constant GAME_TIMEOUT_BLOCKS = 256; // ~8.5 minutes on Base
    
    uint256 public gameCounter;
    uint256 public totalVolume;
    uint256 public totalGamesPlayed;
    
    enum GameState { None, WaitingForReveal, Settled }
    
    struct Game {
        address player;
        GameState state;
        uint256 betAmount;
        uint8 target;
        bytes32 commitment;
        uint256 commitBlock;
        uint8 roll;
        bool won;
        uint256 payout;
    }
    
    mapping(uint256 => Game) public games;
    mapping(address => uint256) public activeGame;
    mapping(address => uint256) public playerWins;
    mapping(address => uint256) public playerLosses;
    
    // ============ Events ============
    event GameStarted(uint256 indexed gameId, address indexed player, uint256 betAmount, uint8 target, bytes32 commitment);
    event GameRevealed(uint256 indexed gameId, uint8 roll, bool won, uint256 payout);
    
    // ============ Errors ============
    error InvalidBet();
    error InvalidTarget();
    error GameInProgress();
    error NoActiveGame();
    error InvalidState();
    error NotYourGame();
    error RevealTooEarly();
    error InvalidReveal();
    error InsufficientBankroll();
    error GameNotExpired();
    error GameAlreadySettled();
    
    constructor(address _shellToken, address _houseBankroll, address _feeRecipient) Ownable(msg.sender) {
        require(_shellToken != address(0), "Invalid token");
        require(_houseBankroll != address(0), "Invalid bankroll");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        shellToken = IERC20(_shellToken);
        houseBankroll = _houseBankroll;
        feeRecipient = _feeRecipient;
    }
    
    // ============ Core Game Functions ============
    
    /**
     * @notice Start a dice game with a commitment
     * @param betAmount Amount to bet in SHELL
     * @param target Target number (2-98). Win if roll < target.
     * @param commitment Hash of secret for randomness
     */
    function startGame(
        uint256 betAmount, 
        uint8 target,
        bytes32 commitment
    ) external nonReentrant returns (uint256 gameId) {
        if (betAmount < minBet || betAmount > maxBet) revert InvalidBet();
        if (target < MIN_TARGET || target > MAX_TARGET) revert InvalidTarget();
        if (activeGame[msg.sender] != 0) revert GameInProgress();
        
        // Calculate max payout and check bankroll
        uint256 maxPayout = calculatePayout(betAmount, target);
        if (!IHouseBankroll(houseBankroll).canCover(maxPayout)) revert InsufficientBankroll();
        
        // Transfer bet from player
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        gameId = ++gameCounter;
        Game storage game = games[gameId];
        game.player = msg.sender;
        game.state = GameState.WaitingForReveal;
        game.betAmount = betAmount;
        game.target = target;
        game.commitment = commitment;
        game.commitBlock = block.number;
        
        activeGame[msg.sender] = gameId;
        totalVolume += betAmount;
        
        emit GameStarted(gameId, msg.sender, betAmount, target, commitment);
    }
    
    /**
     * @notice Reveal the secret to roll the dice
     * @param gameId The game ID
     * @param secret The secret that hashes to the commitment
     */
    function reveal(uint256 gameId, uint256 secret) external nonReentrant {
        Game storage game = games[gameId];
        if (game.player != msg.sender) revert NotYourGame();
        if (game.state != GameState.WaitingForReveal) revert InvalidState();
        if (block.number <= game.commitBlock) revert RevealTooEarly();
        if (keccak256(abi.encodePacked(secret)) != game.commitment) revert InvalidReveal();
        
        // Fix #53 #74: Improved randomness - combine multiple sources
        bytes32 blockHash = blockhash(game.commitBlock);
        // Fallback if blockhash is 0 (>256 blocks old)
        if (blockHash == 0) {
            blockHash = blockhash(block.number - 1);
        }
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            secret,
            blockHash,
            block.prevrandao,
            block.timestamp,
            msg.sender
        )));
        game.roll = uint8(randomSeed % ROLL_RANGE);
        
        // Determine outcome
        game.won = game.roll < game.target;
        
        if (game.won) {
            // Fix #72: Protocol fee taken from winnings, not bankroll
            // Player wins - they get their bet back plus winnings minus fee
            uint256 grossPayout = calculatePayout(game.betAmount, game.target);
            
            // Net profit = payout - bet (what player actually gains before fee)
            uint256 profit = grossPayout > game.betAmount ? grossPayout - game.betAmount : 0;
            uint256 fee = (profit * PROTOCOL_FEE_BPS) / 10000;
            uint256 netProfit = profit - fee;
            
            game.payout = game.betAmount + netProfit; // Total returned to player
            
            // Get full profit from bankroll (to this contract)
            if (profit > 0) {
                IHouseBankroll(houseBankroll).payLoss(address(this), profit);
            }
            
            // Pay player: original bet + profit - fee
            shellToken.safeTransfer(game.player, game.payout);
            
            // Pay protocol fee (from the profit we received)
            if (fee > 0) {
                shellToken.safeTransfer(feeRecipient, fee);
            }
            
            playerWins[game.player]++;
        } else {
            // House wins - send bet to bankroll as profit
            shellToken.forceApprove(houseBankroll, game.betAmount);
            IHouseBankroll(houseBankroll).depositProfit(game.betAmount);
            
            playerLosses[game.player]++;
        }
        
        game.state = GameState.Settled;
        activeGame[game.player] = 0;
        totalGamesPlayed++;
        
        emit GameRevealed(gameId, game.roll, game.won, game.payout);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Calculate payout for a winning bet
     * @param betAmount The bet amount
     * @param target The target number
     * @return The gross payout (before fees)
     * 
     * Formula: payout = bet * (100 - houseEdge) / target
     * Example: bet 100, target 50 => 100 * 98 / 50 = 196 (1.96x)
     */
    function calculatePayout(uint256 betAmount, uint8 target) public pure returns (uint256) {
        // payout = bet * (10000 - HOUSE_EDGE_BPS) / (target * 100)
        return (betAmount * (10000 - HOUSE_EDGE_BPS)) / (uint256(target) * 100);
    }
    
    /**
     * @notice Get the multiplier for a target (in basis points, 10000 = 1x)
     * @param target The target number
     * @return Multiplier in basis points
     */
    function getMultiplier(uint8 target) external pure returns (uint256) {
        if (target < MIN_TARGET || target > MAX_TARGET) return 0;
        return (10000 - HOUSE_EDGE_BPS) * 100 / target;
    }
    
    /**
     * @notice Get win probability for a target (in basis points)
     * @param target The target number
     * @return Win probability in basis points (10000 = 100%)
     */
    function getWinProbability(uint8 target) external pure returns (uint256) {
        if (target < MIN_TARGET || target > MAX_TARGET) return 0;
        return uint256(target) * 100;
    }
    
    /**
     * @notice Get game details
     */
    function getGame(uint256 gameId) external view returns (
        address player,
        GameState state,
        uint256 betAmount,
        uint8 target,
        uint8 roll,
        bool won,
        uint256 payout
    ) {
        Game storage game = games[gameId];
        return (
            game.player,
            game.state,
            game.betAmount,
            game.target,
            game.roll,
            game.won,
            game.payout
        );
    }
    
    /**
     * @notice Get player stats
     */
    function getPlayerStats(address player) external view returns (
        uint256 wins,
        uint256 losses,
        uint256 active
    ) {
        return (playerWins[player], playerLosses[player], activeGame[player]);
    }
    
    /**
     * @notice Get max bet based on target and bankroll
     */
    function getMaxBetForTarget(uint8 target) external view returns (uint256) {
        if (target < MIN_TARGET || target > MAX_TARGET) return 0;
        // This is approximate - actual max depends on bankroll's canCover
        uint256 maxPayout = calculatePayout(maxBet, target);
        if (IHouseBankroll(houseBankroll).canCover(maxPayout)) {
            return maxBet;
        }
        // Binary search could be added for exact max
        return 0;
    }
    
    // ============ Timeout Functions ============
    
    /**
     * @notice Force expire a stale game and return bet to player
     * @dev Can be called by anyone after GAME_TIMEOUT_BLOCKS
     * @param gameId The game to expire
     */
    function forceExpire(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state != GameState.WaitingForReveal) revert GameAlreadySettled();
        if (block.number < game.commitBlock + GAME_TIMEOUT_BLOCKS) revert GameNotExpired();
        
        // Mark game as settled (player loses by default but gets bet back)
        game.state = GameState.Settled;
        activeGame[game.player] = 0;
        
        // Return bet to player
        shellToken.safeTransfer(game.player, game.betAmount);
        
        emit GameRevealed(gameId, 0, false, game.betAmount);
    }
    
    /**
     * @notice Check if a game has expired
     */
    function isGameExpired(uint256 gameId) external view returns (bool) {
        Game storage game = games[gameId];
        if (game.state != GameState.WaitingForReveal) return false;
        return block.number >= game.commitBlock + GAME_TIMEOUT_BLOCKS;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Set bet limits
     */
    function setBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner {
        require(_minBet > 0 && _maxBet > _minBet, "Invalid limits");
        minBet = _minBet;
        maxBet = _maxBet;
    }
    
    /**
     * @notice Set house bankroll address
     */
    function setHouseBankroll(address _houseBankroll) external onlyOwner {
        require(_houseBankroll != address(0), "Invalid bankroll");
        houseBankroll = _houseBankroll;
    }
    
    /**
     * @notice Set fee recipient
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }
}
