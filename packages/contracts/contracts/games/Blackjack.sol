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
 * @title Blackjack - Player vs House
 * @notice On-chain blackjack where players bet $SHELL against the house bankroll
 * @dev Uses commit-reveal for randomness, integrates with house bankroll for payouts
 */
contract Blackjack is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant BLACKJACK_PAYOUT_NUMERATOR = 3;
    uint256 public constant BLACKJACK_PAYOUT_DENOMINATOR = 2;
    uint256 public constant PROTOCOL_FEE_BPS = 100; // 1%
    
    // Card values: 0-51 representing a standard deck
    // rank = card % 13: 0=A, 1=2, 2=3, ... 9=10, 10=J, 11=Q, 12=K
    // suit = card / 13: 0=hearts, 1=diamonds, 2=clubs, 3=spades

    // ============ State ============
    IERC20 public immutable shellToken;
    address public houseBankroll;
    address public feeRecipient;
    
    uint256 public minBet = 1e18;      // 1 SHELL
    uint256 public maxBet = 1000e18;   // 1000 SHELL
    uint256 public maxPayoutMultiple = 10; // Max payout = bet * 10 (for splits/doubles)
    uint256 public constant GAME_TIMEOUT_BLOCKS = 256; // ~8.5 minutes on Base
    
    uint256 public gameCounter;
    
    enum GameState { None, WaitingForReveal, PlayerTurn, DealerTurn, Settled }
    enum Action { None, Hit, Stand, Double, Split }
    
    struct Hand {
        uint8[] cards;
        uint256 bet;
        bool doubled;
        bool stood;
        bool busted;
        bool isBlackjack;
    }
    
    struct Game {
        address player;
        GameState state;
        uint256 betAmount;
        bytes32 commitment;
        uint256 commitBlock;
        Hand[] playerHands;
        uint8[] dealerCards;
        uint8 currentHandIndex;
        uint256 deckSeed;
        uint8 deckPosition;
        uint256 usedCardsBitmap; // Bitmap for tracking used cards (bit N = card N used)
    }
    
    mapping(uint256 => Game) public games;
    mapping(address => uint256) public activeGame;
    
    // ============ Events ============
    event GameStarted(uint256 indexed gameId, address indexed player, uint256 betAmount, bytes32 commitment);
    event CardsDealt(uint256 indexed gameId, uint8 playerCard1, uint8 playerCard2, uint8 dealerUpCard);
    event PlayerAction(uint256 indexed gameId, Action action, uint8 handIndex);
    event CardDealt(uint256 indexed gameId, uint8 card, bool isPlayer, uint8 handIndex);
    event HandResult(uint256 indexed gameId, uint8 handIndex, uint256 payout, bool won);
    event GameSettled(uint256 indexed gameId, uint256 totalPayout);
    
    // ============ Errors ============
    error InvalidBet();
    error GameInProgress();
    error NoActiveGame();
    error InvalidState();
    error NotYourGame();
    error RevealTooEarly();
    error InvalidReveal();
    error CannotDouble();
    error CannotSplit();
    error InsufficientBankroll();
    error HandAlreadyStood();
    error HandBusted();
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
    
    // ============ Player Actions ============
    
    /**
     * @notice Start a new blackjack game with a commitment
     * @param betAmount Amount to bet in SHELL
     * @param commitment Hash of secret for randomness
     */
    function startGame(uint256 betAmount, bytes32 commitment) external nonReentrant returns (uint256 gameId) {
        if (betAmount < minBet || betAmount > maxBet) revert InvalidBet();
        if (activeGame[msg.sender] != 0) revert GameInProgress();
        
        // Check bankroll can cover max payout (respects minimum bankroll requirement)
        uint256 maxPayout = betAmount * maxPayoutMultiple;
        if (!IHouseBankroll(houseBankroll).canCover(maxPayout)) revert InsufficientBankroll();
        
        // Transfer bet from player
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        gameId = ++gameCounter;
        Game storage game = games[gameId];
        game.player = msg.sender;
        game.state = GameState.WaitingForReveal;
        game.betAmount = betAmount;
        game.commitment = commitment;
        game.commitBlock = block.number;
        
        activeGame[msg.sender] = gameId;
        
        emit GameStarted(gameId, msg.sender, betAmount, commitment);
    }
    
    /**
     * @notice Reveal the secret to deal initial cards
     * @param gameId The game ID
     * @param secret The secret that hashes to the commitment
     */
    function revealAndDeal(uint256 gameId, uint256 secret) external nonReentrant {
        Game storage game = games[gameId];
        if (game.player != msg.sender) revert NotYourGame();
        if (game.state != GameState.WaitingForReveal) revert InvalidState();
        if (block.number <= game.commitBlock) revert RevealTooEarly();
        if (keccak256(abi.encodePacked(secret)) != game.commitment) revert InvalidReveal();
        
        // Generate deck seed from secret + blockhash
        game.deckSeed = uint256(keccak256(abi.encodePacked(
            secret,
            blockhash(game.commitBlock)
        )));
        
        // Deal initial cards: player gets 2, dealer gets 2 (one face down)
        game.playerHands.push();
        Hand storage playerHand = game.playerHands[0];
        playerHand.bet = game.betAmount;
        
        uint8 pCard1 = _drawCard(game);
        uint8 pCard2 = _drawCard(game);
        uint8 dCard1 = _drawCard(game);
        uint8 dCard2 = _drawCard(game);
        
        playerHand.cards.push(pCard1);
        playerHand.cards.push(pCard2);
        game.dealerCards.push(dCard1);
        game.dealerCards.push(dCard2);
        
        // Check for blackjack
        uint8 playerValue = _handValue(playerHand.cards);
        if (playerValue == 21 && playerHand.cards.length == 2) {
            playerHand.isBlackjack = true;
        }
        
        game.state = GameState.PlayerTurn;
        
        emit CardsDealt(gameId, pCard1, pCard2, dCard1);
        
        // If player has blackjack, go straight to dealer
        if (playerHand.isBlackjack) {
            _finishPlayerTurn(game, gameId);
        }
    }
    
    /**
     * @notice Hit - draw another card
     */
    function hit(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        _validatePlayerAction(game);
        
        Hand storage hand = game.playerHands[game.currentHandIndex];
        if (hand.stood) revert HandAlreadyStood();
        if (hand.busted) revert HandBusted();
        
        uint8 card = _drawCard(game);
        hand.cards.push(card);
        
        emit CardDealt(gameId, card, true, game.currentHandIndex);
        emit PlayerAction(gameId, Action.Hit, game.currentHandIndex);
        
        // Check if busted
        if (_handValue(hand.cards) > 21) {
            hand.busted = true;
            _moveToNextHand(game, gameId);
        }
    }
    
    /**
     * @notice Stand - keep current hand
     */
    function stand(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        _validatePlayerAction(game);
        
        Hand storage hand = game.playerHands[game.currentHandIndex];
        if (hand.stood) revert HandAlreadyStood();
        if (hand.busted) revert HandBusted();
        
        hand.stood = true;
        
        emit PlayerAction(gameId, Action.Stand, game.currentHandIndex);
        
        _moveToNextHand(game, gameId);
    }
    
    /**
     * @notice Double down - double bet and take exactly one more card
     */
    function doubleDown(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        _validatePlayerAction(game);
        
        Hand storage hand = game.playerHands[game.currentHandIndex];
        if (hand.cards.length != 2) revert CannotDouble();
        if (hand.stood || hand.busted) revert CannotDouble();
        
        // Transfer additional bet
        shellToken.safeTransferFrom(msg.sender, address(this), hand.bet);
        hand.bet *= 2;
        hand.doubled = true;
        
        // Draw one card
        uint8 card = _drawCard(game);
        hand.cards.push(card);
        
        emit CardDealt(gameId, card, true, game.currentHandIndex);
        emit PlayerAction(gameId, Action.Double, game.currentHandIndex);
        
        // Check if busted, otherwise stand
        if (_handValue(hand.cards) > 21) {
            hand.busted = true;
        } else {
            hand.stood = true;
        }
        
        _moveToNextHand(game, gameId);
    }
    
    /**
     * @notice Split - split a pair into two hands
     */
    function split(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        _validatePlayerAction(game);
        
        Hand storage hand = game.playerHands[game.currentHandIndex];
        if (hand.cards.length != 2) revert CannotSplit();
        if (_cardValue(hand.cards[0]) != _cardValue(hand.cards[1])) revert CannotSplit();
        if (game.playerHands.length >= 4) revert CannotSplit(); // Max 4 hands
        
        // Transfer additional bet for new hand
        shellToken.safeTransferFrom(msg.sender, address(this), game.betAmount);
        
        // Create new hand with second card
        uint8 splitCard = hand.cards[1];
        hand.cards.pop();
        
        game.playerHands.push();
        Hand storage newHand = game.playerHands[game.playerHands.length - 1];
        newHand.bet = game.betAmount;
        newHand.cards.push(splitCard);
        
        // Deal one card to each hand
        uint8 card1 = _drawCard(game);
        uint8 card2 = _drawCard(game);
        hand.cards.push(card1);
        newHand.cards.push(card2);
        
        emit CardDealt(gameId, card1, true, game.currentHandIndex);
        emit CardDealt(gameId, card2, true, uint8(game.playerHands.length - 1));
        emit PlayerAction(gameId, Action.Split, game.currentHandIndex);
    }
    
    // ============ Internal Functions ============
    
    function _validatePlayerAction(Game storage game) internal view {
        if (game.player != msg.sender) revert NotYourGame();
        if (game.state != GameState.PlayerTurn) revert InvalidState();
    }
    
    function _moveToNextHand(Game storage game, uint256 gameId) internal {
        // Move to next hand or finish player turn
        if (game.currentHandIndex + 1 < game.playerHands.length) {
            game.currentHandIndex++;
        } else {
            _finishPlayerTurn(game, gameId);
        }
    }
    
    function _finishPlayerTurn(Game storage game, uint256 gameId) internal {
        game.state = GameState.DealerTurn;
        
        // Check if all hands busted
        bool allBusted = true;
        for (uint i = 0; i < game.playerHands.length; i++) {
            if (!game.playerHands[i].busted) {
                allBusted = false;
                break;
            }
        }
        
        // Dealer draws if not all player hands busted
        if (!allBusted) {
            // Dealer hits on 16 or less, stands on 17+
            while (_handValue(game.dealerCards) < 17) {
                uint8 card = _drawCard(game);
                game.dealerCards.push(card);
                emit CardDealt(gameId, card, false, 0);
            }
        }
        
        _settleGame(game, gameId);
    }
    
    function _settleGame(Game storage game, uint256 gameId) internal {
        game.state = GameState.Settled;
        activeGame[game.player] = 0;
        
        uint8 dealerValue = _handValue(game.dealerCards);
        bool dealerBusted = dealerValue > 21;
        bool dealerBlackjack = dealerValue == 21 && game.dealerCards.length == 2;
        
        uint256 totalBets = 0;      // Total amount player bet
        uint256 totalPayout = 0;    // Total amount player should receive
        
        for (uint i = 0; i < game.playerHands.length; i++) {
            Hand storage hand = game.playerHands[i];
            uint8 playerValue = _handValue(hand.cards);
            uint256 payout = 0;
            bool won = false;
            
            totalBets += hand.bet;
            
            if (hand.busted) {
                // Player busted - lose bet
                payout = 0;
            } else if (hand.isBlackjack && !dealerBlackjack) {
                // Player blackjack beats dealer (3:2 payout)
                payout = hand.bet + (hand.bet * BLACKJACK_PAYOUT_NUMERATOR / BLACKJACK_PAYOUT_DENOMINATOR);
                won = true;
            } else if (hand.isBlackjack && dealerBlackjack) {
                // Push - both have blackjack
                payout = hand.bet;
            } else if (dealerBlackjack) {
                // Dealer blackjack beats player
                payout = 0;
            } else if (dealerBusted) {
                // Dealer busted - player wins
                payout = hand.bet * 2;
                won = true;
            } else if (playerValue > dealerValue) {
                // Player wins
                payout = hand.bet * 2;
                won = true;
            } else if (playerValue == dealerValue) {
                // Push
                payout = hand.bet;
            }
            // else: dealer wins, payout = 0
            
            totalPayout += payout;
            emit HandResult(gameId, uint8(i), payout, won);
        }
        
        // Calculate net result
        // Contract holds totalBets from player
        // If totalPayout > totalBets: player won, need to get extra from bankroll
        // If totalPayout < totalBets: house won, send profit to bankroll
        // If totalPayout == totalBets: push, return bet to player
        
        if (totalPayout > totalBets) {
            // Player won - bankroll pays the difference
            uint256 winnings = totalPayout - totalBets;
            uint256 fee = (winnings * PROTOCOL_FEE_BPS) / 10000;
            
            // Get winnings from bankroll
            IHouseBankroll(houseBankroll).payLoss(address(this), winnings);
            
            // Pay player (bet + winnings - fee)
            uint256 playerPayout = totalPayout - fee;
            shellToken.safeTransfer(game.player, playerPayout);
            
            // Send fee
            if (fee > 0) {
                shellToken.safeTransfer(feeRecipient, fee);
            }
        } else if (totalPayout < totalBets) {
            // House won - send profit to bankroll
            uint256 houseProfit = totalBets - totalPayout;
            
            // Return any payout to player (push hands)
            if (totalPayout > 0) {
                shellToken.safeTransfer(game.player, totalPayout);
            }
            
            // Send profit to bankroll
            shellToken.forceApprove(houseBankroll, houseProfit);
            IHouseBankroll(houseBankroll).depositProfit(houseProfit);
        } else {
            // Push - return bet to player
            shellToken.safeTransfer(game.player, totalPayout);
        }
        
        emit GameSettled(gameId, totalPayout);
    }
    
    function _drawCard(Game storage game) internal returns (uint8) {
        // Fix #52: Draw unique cards using bitmap to track used cards
        uint8 card;
        uint256 attempts = 0;
        
        do {
            uint256 cardSeed = uint256(keccak256(abi.encodePacked(game.deckSeed, game.deckPosition, attempts)));
            card = uint8(cardSeed % 52);
            attempts++;
            // Safety: max 52 cards in deck, shouldn't need more than ~100 attempts
            require(attempts < 200, "Card draw failed");
        } while ((game.usedCardsBitmap & (1 << card)) != 0);
        
        // Mark card as used
        game.usedCardsBitmap |= (1 << card);
        game.deckPosition++;
        
        return card;
    }
    
    function _cardValue(uint8 card) internal pure returns (uint8) {
        uint8 rank = card % 13; // 0-12 (A,2,3,4,5,6,7,8,9,10,J,Q,K)
        if (rank == 0) return 11; // Ace (can also be 1)
        if (rank >= 10) return 10; // J,Q,K
        return rank + 1; // 2-10
    }
    
    function _handValue(uint8[] memory cards) internal pure returns (uint8) {
        uint8 value = 0;
        uint8 aces = 0;
        
        for (uint i = 0; i < cards.length; i++) {
            uint8 cardVal = _cardValue(cards[i]);
            value += cardVal;
            if (cardVal == 11) aces++;
        }
        
        // Convert aces from 11 to 1 if busting
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        
        return value;
    }
    
    // ============ View Functions ============
    
    function getGame(uint256 gameId) external view returns (
        address player,
        GameState state,
        uint256 betAmount,
        uint8 currentHandIndex,
        uint8 dealerUpCard,
        uint8 dealerValue
    ) {
        Game storage game = games[gameId];
        player = game.player;
        state = game.state;
        betAmount = game.betAmount;
        currentHandIndex = game.currentHandIndex;
        if (game.dealerCards.length > 0) {
            dealerUpCard = game.dealerCards[0];
            // Only show full dealer value after game is settled
            if (state == GameState.Settled) {
                dealerValue = _handValue(game.dealerCards);
            }
        }
    }
    
    function getPlayerHand(uint256 gameId, uint8 handIndex) external view returns (
        uint8[] memory cards,
        uint256 bet,
        uint8 value,
        bool doubled,
        bool stood,
        bool busted,
        bool isBlackjack
    ) {
        Game storage game = games[gameId];
        require(handIndex < game.playerHands.length, "Invalid hand");
        Hand storage hand = game.playerHands[handIndex];
        cards = hand.cards;
        bet = hand.bet;
        value = _handValue(hand.cards);
        doubled = hand.doubled;
        stood = hand.stood;
        busted = hand.busted;
        isBlackjack = hand.isBlackjack;
    }
    
    function getDealerCards(uint256 gameId) external view returns (uint8[] memory) {
        return games[gameId].dealerCards;
    }
    
    function getHandCount(uint256 gameId) external view returns (uint256) {
        return games[gameId].playerHands.length;
    }
    
    // ============ Timeout Functions ============
    
    /**
     * @notice Force expire a stale game and return funds to player
     * @dev Can be called by anyone after GAME_TIMEOUT_BLOCKS
     * @param gameId The game to expire
     */
    function forceExpire(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        if (game.state == GameState.None || game.state == GameState.Settled) revert GameAlreadySettled();
        if (block.number < game.commitBlock + GAME_TIMEOUT_BLOCKS) revert GameNotExpired();
        
        // Return all bets to player
        uint256 totalBets = 0;
        for (uint i = 0; i < game.playerHands.length; i++) {
            totalBets += game.playerHands[i].bet;
        }
        // If no hands yet (waiting for reveal), return initial bet
        if (totalBets == 0) {
            totalBets = game.betAmount;
        }
        
        // Mark game as settled
        game.state = GameState.Settled;
        activeGame[game.player] = 0;
        
        // Return funds to player
        if (totalBets > 0) {
            shellToken.safeTransfer(game.player, totalBets);
        }
        
        emit GameSettled(gameId, totalBets);
    }
    
    /**
     * @notice Check if a game has expired
     */
    function isGameExpired(uint256 gameId) external view returns (bool) {
        Game storage game = games[gameId];
        if (game.state == GameState.None || game.state == GameState.Settled) return false;
        return block.number >= game.commitBlock + GAME_TIMEOUT_BLOCKS;
    }
    
    // ============ Admin Functions ============
    
    function setHouseBankroll(address _houseBankroll) external onlyOwner {
        require(_houseBankroll != address(0), "Invalid bankroll");
        houseBankroll = _houseBankroll;
    }
    
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
    }
    
    function setBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner {
        minBet = _minBet;
        maxBet = _maxBet;
    }
}
