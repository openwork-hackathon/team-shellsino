// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IHouseBankroll {
    function depositProfit(uint256 amount) external;
    function payLoss(address winner, uint256 amount) external;
    function canCover(uint256 amount) external view returns (bool);
}

/**
 * @title InstantBlackjack
 * @notice Single-transaction blackjack with auto-play
 * @dev No commit-reveal, uses prevrandao. Player bets, game plays out, result instant.
 * 
 *   🃏 INSTANT BLACKJACK 🃏
 *   "One click. One hand. One result."
 */
contract InstantBlackjack is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    address public houseBankroll;
    
    uint256 public minBet = 1e18;      // 1 SHELL
    uint256 public maxBet = 500e18;    // 500 SHELL (lower for instant play)
    uint256 public protocolFeeBps = 100; // 1%
    
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    
    // Agent registry
    mapping(address => bool) public verifiedAgents;
    mapping(address => string) public agentNames;
    
    // Stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public pushes;
    mapping(address => uint256) public blackjacks;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    
    // Game result struct
    struct GameResult {
        uint256 gameId;
        address player;
        uint256 betAmount;
        uint8[] playerCards;
        uint8[] dealerCards;
        uint8 playerTotal;
        uint8 dealerTotal;
        bool playerBlackjack;
        bool dealerBlackjack;
        bool playerBusted;
        bool dealerBusted;
        uint256 payout;
        string result; // "win", "loss", "push", "blackjack"
    }
    
    GameResult[] public gameHistory;
    mapping(address => uint256[]) public playerGameIds;
    
    event InstantBlackjackPlayed(
        uint256 indexed gameId,
        address indexed player,
        uint256 betAmount,
        uint8 playerTotal,
        uint8 dealerTotal,
        uint256 payout,
        string result
    );
    event AgentVerified(address indexed agent, string name);
    
    constructor(address _shellToken, address _houseBankroll) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        houseBankroll = _houseBankroll;
    }
    
    modifier onlyVerifiedAgent() {
        require(verifiedAgents[msg.sender], "Not a verified agent");
        _;
    }
    
    function registerAgent(string calldata name) external {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Invalid name");
        verifiedAgents[msg.sender] = true;
        agentNames[msg.sender] = name;
        emit AgentVerified(msg.sender, name);
    }
    
    /**
     * @notice Play a complete hand of blackjack in one transaction
     * @param betAmount Amount to bet
     * @return result The game result struct
     */
    function playHand(uint256 betAmount) 
        external 
        onlyVerifiedAgent 
        nonReentrant 
        returns (GameResult memory result) 
    {
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");
        
        // Check bankroll (3x for blackjack payout potential)
        uint256 maxPayout = (betAmount * 5) / 2; // 2.5x for blackjack
        if (houseBankroll != address(0)) {
            require(IHouseBankroll(houseBankroll).canCover(maxPayout), "Insufficient bankroll");
        }
        
        // Transfer bet
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        totalGamesPlayed++;
        totalVolume += betAmount;
        totalWagered[msg.sender] += betAmount;
        
        // Generate deck seed
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            msg.sender,
            totalGamesPlayed
        )));
        
        // Play the game
        result = _playGame(msg.sender, betAmount, seed);
        result.gameId = totalGamesPlayed;
        result.player = msg.sender;
        result.betAmount = betAmount;
        
        // Store result
        gameHistory.push(result);
        playerGameIds[msg.sender].push(totalGamesPlayed);
        
        // Handle payout
        _handlePayout(result);
        
        emit InstantBlackjackPlayed(
            result.gameId,
            msg.sender,
            betAmount,
            result.playerTotal,
            result.dealerTotal,
            result.payout,
            result.result
        );
        
        return result;
    }
    
    /**
     * @dev Play out the entire game using basic strategy
     */
    function _playGame(address player, uint256 betAmount, uint256 seed) 
        internal 
        returns (GameResult memory result) 
    {
        uint8[] memory deck = new uint8[](52);
        uint8 deckPos = 0;
        
        // Initialize shuffled deck positions
        for (uint8 i = 0; i < 52; i++) {
            deck[i] = i;
        }
        
        // Shuffle using seed
        for (uint8 i = 51; i > 0; i--) {
            uint8 j = uint8(uint256(keccak256(abi.encodePacked(seed, i))) % (i + 1));
            (deck[i], deck[j]) = (deck[j], deck[i]);
        }
        
        // Deal initial cards
        result.playerCards = new uint8[](10); // Max cards
        result.dealerCards = new uint8[](10);
        uint8 pCount = 0;
        uint8 dCount = 0;
        
        result.playerCards[pCount++] = deck[deckPos++];
        result.dealerCards[dCount++] = deck[deckPos++];
        result.playerCards[pCount++] = deck[deckPos++];
        result.dealerCards[dCount++] = deck[deckPos++];
        
        // Check for blackjacks
        result.playerTotal = _handValue(result.playerCards, pCount);
        result.dealerTotal = _handValue(result.dealerCards, dCount);
        
        if (result.playerTotal == 21) result.playerBlackjack = true;
        if (result.dealerTotal == 21) result.dealerBlackjack = true;
        
        // Handle blackjack scenarios
        if (result.playerBlackjack || result.dealerBlackjack) {
            if (result.playerBlackjack && result.dealerBlackjack) {
                result.result = "push";
                result.payout = betAmount;
                pushes[player]++;
            } else if (result.playerBlackjack) {
                result.result = "blackjack";
                result.payout = betAmount + (betAmount * 3) / 2; // 3:2 payout
                blackjacks[player]++;
                wins[player]++;
            } else {
                result.result = "loss";
                result.payout = 0;
                losses[player]++;
            }
            
            // Trim arrays
            result.playerCards = _trimArray(result.playerCards, pCount);
            result.dealerCards = _trimArray(result.dealerCards, dCount);
            return result;
        }
        
        // Player plays using basic strategy
        while (result.playerTotal < 21) {
            uint8 dealerUpCard = _cardValue(result.dealerCards[0]);
            bool shouldHit = _basicStrategy(result.playerTotal, dealerUpCard, _hasSoftAce(result.playerCards, pCount));
            
            if (!shouldHit) break;
            
            result.playerCards[pCount++] = deck[deckPos++];
            result.playerTotal = _handValue(result.playerCards, pCount);
        }
        
        if (result.playerTotal > 21) {
            result.playerBusted = true;
            result.result = "loss";
            result.payout = 0;
            losses[player]++;
            
            result.playerCards = _trimArray(result.playerCards, pCount);
            result.dealerCards = _trimArray(result.dealerCards, dCount);
            return result;
        }
        
        // Dealer plays (must hit on 16 or less, stand on 17+)
        while (result.dealerTotal < 17) {
            result.dealerCards[dCount++] = deck[deckPos++];
            result.dealerTotal = _handValue(result.dealerCards, dCount);
        }
        
        if (result.dealerTotal > 21) {
            result.dealerBusted = true;
            result.result = "win";
            result.payout = betAmount * 2;
            wins[player]++;
        } else if (result.playerTotal > result.dealerTotal) {
            result.result = "win";
            result.payout = betAmount * 2;
            wins[player]++;
        } else if (result.playerTotal < result.dealerTotal) {
            result.result = "loss";
            result.payout = 0;
            losses[player]++;
        } else {
            result.result = "push";
            result.payout = betAmount;
            pushes[player]++;
        }
        
        // Trim arrays
        result.playerCards = _trimArray(result.playerCards, pCount);
        result.dealerCards = _trimArray(result.dealerCards, dCount);
        
        return result;
    }
    
    /**
     * @dev Basic strategy decision
     */
    function _basicStrategy(uint8 playerTotal, uint8 dealerUpCard, bool hasSoftAce) 
        internal 
        pure 
        returns (bool shouldHit) 
    {
        if (hasSoftAce) {
            // Soft hands
            if (playerTotal <= 17) return true;
            if (playerTotal == 18 && dealerUpCard >= 9) return true;
            return false;
        }
        
        // Hard hands
        if (playerTotal <= 11) return true;
        if (playerTotal >= 17) return false;
        
        // 12-16: hit if dealer shows 7+
        if (playerTotal >= 12 && playerTotal <= 16) {
            return dealerUpCard >= 7 || dealerUpCard == 1; // Ace counts as high
        }
        
        return false;
    }
    
    function _handValue(uint8[] memory cards, uint8 count) internal pure returns (uint8) {
        uint8 total = 0;
        uint8 aces = 0;
        
        for (uint8 i = 0; i < count; i++) {
            uint8 value = _cardValue(cards[i]);
            if (value == 1) {
                aces++;
                total += 11;
            } else {
                total += value;
            }
        }
        
        // Adjust aces
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        
        return total;
    }
    
    function _cardValue(uint8 card) internal pure returns (uint8) {
        uint8 rank = card % 13;
        if (rank == 0) return 1; // Ace
        if (rank >= 10) return 10; // Face cards
        return rank + 1;
    }
    
    function _hasSoftAce(uint8[] memory cards, uint8 count) internal pure returns (bool) {
        uint8 total = 0;
        bool hasAce = false;
        
        for (uint8 i = 0; i < count; i++) {
            uint8 value = _cardValue(cards[i]);
            if (value == 1) hasAce = true;
            total += value == 1 ? 11 : value;
        }
        
        return hasAce && total <= 21;
    }
    
    function _trimArray(uint8[] memory arr, uint8 length) internal pure returns (uint8[] memory) {
        uint8[] memory result = new uint8[](length);
        for (uint8 i = 0; i < length; i++) {
            result[i] = arr[i];
        }
        return result;
    }
    
    function _handlePayout(GameResult memory result) internal {
        if (result.payout == 0) {
            // House wins - send to bankroll
            if (houseBankroll != address(0)) {
                shellToken.approve(houseBankroll, result.betAmount);
                IHouseBankroll(houseBankroll).depositProfit(result.betAmount);
            }
            profitLoss[result.player] -= int256(result.betAmount);
        } else if (result.payout == result.betAmount) {
            // Push - return bet
            shellToken.safeTransfer(result.player, result.betAmount);
        } else {
            // Player wins
            uint256 winnings = result.payout - result.betAmount;
            uint256 fee = (winnings * protocolFeeBps) / 10000;
            uint256 netPayout = result.payout - fee;
            
            // Get winnings from bankroll
            if (houseBankroll != address(0) && winnings > 0) {
                IHouseBankroll(houseBankroll).payLoss(address(this), winnings);
            }
            
            shellToken.safeTransfer(result.player, netPayout);
            profitLoss[result.player] += int256(netPayout) - int256(result.betAmount);
        }
    }
    
    // ============ VIEW FUNCTIONS ============
    
    function getAgentStats(address agent) external view returns (
        string memory name,
        uint256 _wins,
        uint256 _losses,
        uint256 _pushes,
        uint256 _blackjacks,
        uint256 wagered,
        int256 pnl
    ) {
        return (
            agentNames[agent],
            wins[agent],
            losses[agent],
            pushes[agent],
            blackjacks[agent],
            totalWagered[agent],
            profitLoss[agent]
        );
    }
    
    function getRecentGames(uint256 count) external view returns (GameResult[] memory) {
        uint256 len = gameHistory.length;
        if (count > len) count = len;
        
        GameResult[] memory results = new GameResult[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = gameHistory[len - 1 - i];
        }
        
        return results;
    }
    
    function getPlayerGames(address player, uint256 count) external view returns (uint256[] memory) {
        uint256[] storage ids = playerGameIds[player];
        uint256 len = ids.length;
        if (count > len) count = len;
        
        uint256[] memory results = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = ids[len - 1 - i];
        }
        
        return results;
    }
    
    // ============ ADMIN ============
    
    function setHouseBankroll(address _houseBankroll) external onlyOwner {
        houseBankroll = _houseBankroll;
    }
    
    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min < _max, "Invalid limits");
        minBet = _min;
        maxBet = _max;
    }
    
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Max 5% fee");
        protocolFeeBps = _feeBps;
    }
}
