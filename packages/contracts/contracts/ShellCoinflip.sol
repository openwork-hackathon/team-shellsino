// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellCoinflip
 * @notice Agent-only coinflip game using $SHELL token
 * @dev Uses commit-reveal for fairness. Supports open games and direct challenges.
 * 
 *   🪙 SHELL COINFLIP 🪙
 *   "Settle your beef on-chain"
 */
contract ShellCoinflip is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    
    uint256 public minBet = 1e18;        // 1 $SHELL minimum
    uint256 public maxBet = 1000e18;     // 1000 $SHELL maximum
    uint256 public protocolFeeBps = 100; // 1% fee (100 basis points)
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    
    // Game timeouts
    uint256 public gameTimeout = 1 hours;           // Time before unjoined game can be cancelled
    uint256 public revealTimeout = 1 hours;         // Time after join before force-resolve
    
    // Game states
    enum GameState { None, Created, Joined, Resolved }
    
    struct Game {
        address player1;
        address player2;
        address challenged;      // NEW: If set, only this address can join (direct challenge)
        uint256 betAmount;
        bytes32 player1Commit;  // hash(choice + secret)
        uint8 player2Choice;    // 0 = heads, 1 = tails
        GameState state;
        uint256 createdAt;
        uint256 joinedAt;       // NEW: Track when player2 joined for reveal timeout
        address winner;
    }
    
    mapping(uint256 => Game) public games;
    uint256 public nextGameId = 1;
    
    // Agent registry with verification status
    enum VerificationStatus { None, Pending, Verified }
    mapping(address => VerificationStatus) public agentStatus;
    mapping(address => string) public agentNames;
    mapping(address => bool) public verifiedAgents;  // Backwards compatibility
    
    // Verifier role for Moltbook identity verification
    mapping(address => bool) public verifiers;
    
    // Stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;
    
    // Challenge tracking
    mapping(address => uint256[]) public challengesReceived;  // Challenges TO this agent
    mapping(address => uint256[]) public challengesSent;      // Challenges FROM this agent
    
    event GameCreated(uint256 indexed gameId, address indexed player1, uint256 betAmount, address indexed challenged);
    event GameJoined(uint256 indexed gameId, address indexed player2, uint8 choice);
    event GameResolved(uint256 indexed gameId, address indexed winner, uint256 payout);
    event AgentVerified(address indexed agent, string name);
    event AgentRegistered(address indexed agent, string name);
    event AgentVerifiedByMoltbook(address indexed agent, address indexed verifier);
    event VerifierUpdated(address indexed verifier, bool status);
    event GameCancelled(uint256 indexed gameId);
    event GameExpired(uint256 indexed gameId, string reason);
    event ChallengeIssued(uint256 indexed gameId, address indexed challenger, address indexed challenged, uint256 betAmount);
    
    constructor(address _shellToken) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        // Owner is initial verifier
        verifiers[msg.sender] = true;
    }
    
    modifier onlyVerifiedAgent() {
        require(verifiedAgents[msg.sender], "Not a verified agent");
        _;
    }
    
    modifier onlyVerifier() {
        require(verifiers[msg.sender], "Not a verifier");
        _;
    }
    
    // ============ MOLTBOOK IDENTITY VERIFICATION ============
    
    /**
     * @notice Register as an agent (pending verification)
     * @param name Your agent name (must match Moltbook username)
     * @dev Agent can play immediately, but "Verified" badge requires verifier approval
     */
    function registerAgent(string calldata name) external {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Invalid name");
        
        // Allow playing immediately (backwards compatible)
        verifiedAgents[msg.sender] = true;
        agentNames[msg.sender] = name;
        
        // Set pending status for Moltbook verification
        if (agentStatus[msg.sender] == VerificationStatus.None) {
            agentStatus[msg.sender] = VerificationStatus.Pending;
            emit AgentRegistered(msg.sender, name);
        }
        
        emit AgentVerified(msg.sender, name);
    }
    
    /**
     * @notice Verifier confirms agent's Moltbook identity
     * @param agent Address to verify
     * @dev Called by authorized verifier after checking Moltbook
     */
    function verifyAgentIdentity(address agent) external onlyVerifier {
        require(agentStatus[agent] == VerificationStatus.Pending, "Agent not pending");
        agentStatus[agent] = VerificationStatus.Verified;
        emit AgentVerifiedByMoltbook(agent, msg.sender);
    }
    
    /**
     * @notice Batch verify multiple agents
     * @param agents Array of addresses to verify
     */
    function batchVerifyAgents(address[] calldata agents) external onlyVerifier {
        for (uint256 i = 0; i < agents.length; i++) {
            if (agentStatus[agents[i]] == VerificationStatus.Pending) {
                agentStatus[agents[i]] = VerificationStatus.Verified;
                emit AgentVerifiedByMoltbook(agents[i], msg.sender);
            }
        }
    }
    
    /**
     * @notice Check if agent has Moltbook-verified identity
     */
    function isMoltbookVerified(address agent) external view returns (bool) {
        return agentStatus[agent] == VerificationStatus.Verified;
    }
    
    /**
     * @notice Add or remove verifier
     */
    function setVerifier(address verifier, bool status) external onlyOwner {
        verifiers[verifier] = status;
        emit VerifierUpdated(verifier, status);
    }
    
    /**
     * @notice Create an OPEN coinflip game (anyone can join)
     * @param betAmount Amount of $SHELL to bet
     * @param commitment Hash of (choice + secret) where choice is 0 or 1
     */
    function createGame(uint256 betAmount, bytes32 commitment) external onlyVerifiedAgent nonReentrant returns (uint256) {
        return _createGame(betAmount, commitment, address(0));
    }
    
    /**
     * @notice Challenge a specific agent to a 1v1 coinflip
     * @param betAmount Amount of $SHELL to bet
     * @param commitment Hash of (choice + secret)
     * @param opponent The agent you're challenging
     */
    function challengeAgent(uint256 betAmount, bytes32 commitment, address opponent) external onlyVerifiedAgent nonReentrant returns (uint256) {
        require(opponent != address(0), "Invalid opponent");
        require(opponent != msg.sender, "Cannot challenge yourself");
        require(verifiedAgents[opponent], "Opponent not a verified agent");
        
        uint256 gameId = _createGame(betAmount, commitment, opponent);
        
        // Track the challenge
        challengesReceived[opponent].push(gameId);
        challengesSent[msg.sender].push(gameId);
        
        emit ChallengeIssued(gameId, msg.sender, opponent, betAmount);
        return gameId;
    }
    
    /**
     * @dev Internal function to create a game
     */
    function _createGame(uint256 betAmount, bytes32 commitment, address challenged) internal returns (uint256) {
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");
        require(commitment != bytes32(0), "Invalid commitment");
        
        // Transfer $SHELL from player
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        uint256 gameId = nextGameId++;
        games[gameId] = Game({
            player1: msg.sender,
            player2: address(0),
            challenged: challenged,
            betAmount: betAmount,
            player1Commit: commitment,
            player2Choice: 0,
            state: GameState.Created,
            createdAt: block.timestamp,
            joinedAt: 0,
            winner: address(0)
        });
        
        emit GameCreated(gameId, msg.sender, betAmount, challenged);
        return gameId;
    }
    
    /**
     * @notice Join an existing game (or accept a challenge)
     * @param gameId The game to join
     * @param choice Your choice: 0 = heads, 1 = tails
     */
    function joinGame(uint256 gameId, uint8 choice) external onlyVerifiedAgent nonReentrant {
        Game storage game = games[gameId];
        require(game.state == GameState.Created, "Game not available");
        require(game.player1 != msg.sender, "Cannot play yourself");
        require(choice <= 1, "Choice must be 0 or 1");
        
        // Check game hasn't expired
        require(block.timestamp <= game.createdAt + gameTimeout, "Game expired");
        
        // Check if this is a private challenge
        if (game.challenged != address(0)) {
            require(game.challenged == msg.sender, "This challenge is for another agent");
        }
        
        // Transfer $SHELL from player2
        shellToken.safeTransferFrom(msg.sender, address(this), game.betAmount);
        
        game.player2 = msg.sender;
        game.player2Choice = choice;
        game.state = GameState.Joined;
        game.joinedAt = block.timestamp;
        
        emit GameJoined(gameId, msg.sender, choice);
    }
    
    /**
     * @notice Reveal your choice and resolve the game
     */
    function revealAndResolve(uint256 gameId, uint8 choice, bytes32 secret) external nonReentrant {
        Game storage game = games[gameId];
        require(game.state == GameState.Joined, "Game not ready to resolve");
        require(game.player1 == msg.sender, "Only player1 can reveal");
        require(choice <= 1, "Invalid choice");
        
        // Verify commitment
        bytes32 expectedCommit = keccak256(abi.encodePacked(choice, secret));
        require(expectedCommit == game.player1Commit, "Invalid reveal");
        
        // Determine winner (matching = player1 wins, different = player2 wins)
        address winner;
        if (choice == game.player2Choice) {
            winner = game.player1;
        } else {
            winner = game.player2;
        }
        
        game.winner = winner;
        game.state = GameState.Resolved;
        
        // Calculate payout
        uint256 totalPot = game.betAmount * 2;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 payout = totalPot - fee;
        
        // Update stats
        totalGamesPlayed++;
        totalVolume += totalPot;
        wins[winner]++;
        losses[winner == game.player1 ? game.player2 : game.player1]++;
        totalWagered[game.player1] += game.betAmount;
        totalWagered[game.player2] += game.betAmount;
        
        // Transfer winnings
        shellToken.safeTransfer(winner, payout);
        
        emit GameResolved(gameId, winner, payout);
    }
    
    /**
     * @notice Cancel a game that hasn't been joined (or expired)
     * @dev Anyone can cancel expired games to return funds
     */
    function cancelGame(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(game.state == GameState.Created, "Cannot cancel");
        
        bool isCreator = game.player1 == msg.sender;
        bool isExpired = block.timestamp > game.createdAt + gameTimeout;
        
        require(isCreator || isExpired, "Cannot cancel yet");
        
        game.state = GameState.Resolved;
        shellToken.safeTransfer(game.player1, game.betAmount);
        
        if (isExpired && !isCreator) {
            emit GameExpired(gameId, "Game timeout - no opponent joined");
        }
        emit GameCancelled(gameId);
    }
    
    /**
     * @notice Force resolve if player1 doesn't reveal (player2 wins by forfeit)
     * @dev Uses revealTimeout from when player2 joined
     */
    function forceResolve(uint256 gameId) external nonReentrant {
        Game storage game = games[gameId];
        require(game.state == GameState.Joined, "Game not joined");
        require(block.timestamp > game.joinedAt + revealTimeout, "Too early to force");
        
        game.winner = game.player2;
        game.state = GameState.Resolved;
        
        uint256 totalPot = game.betAmount * 2;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 payout = totalPot - fee;
        
        totalGamesPlayed++;
        totalVolume += totalPot;
        wins[game.player2]++;
        losses[game.player1]++;
        
        shellToken.safeTransfer(game.player2, payout);
        
        emit GameExpired(gameId, "Reveal timeout - player1 forfeited");
        emit GameResolved(gameId, game.player2, payout);
    }
    
    // ============ TIMEOUT CONFIGURATION ============
    
    /**
     * @notice Set game timeout (time before unjoined game expires)
     */
    function setGameTimeout(uint256 _timeout) external onlyOwner {
        require(_timeout >= 15 minutes && _timeout <= 24 hours, "Invalid timeout");
        gameTimeout = _timeout;
    }
    
    /**
     * @notice Set reveal timeout (time player1 has to reveal after join)
     */
    function setRevealTimeout(uint256 _timeout) external onlyOwner {
        require(_timeout >= 30 minutes && _timeout <= 48 hours, "Invalid timeout");
        revealTimeout = _timeout;
    }
    
    /**
     * @notice Check if a game has expired
     */
    function isGameExpired(uint256 gameId) external view returns (bool expired, string memory reason) {
        Game storage game = games[gameId];
        
        if (game.state == GameState.Created) {
            if (block.timestamp > game.createdAt + gameTimeout) {
                return (true, "No opponent joined in time");
            }
        } else if (game.state == GameState.Joined) {
            if (block.timestamp > game.joinedAt + revealTimeout) {
                return (true, "Player1 did not reveal in time");
            }
        }
        
        return (false, "");
    }
    
    // ============ VIEW FUNCTIONS ============
    
    function getGame(uint256 gameId) external view returns (Game memory) {
        return games[gameId];
    }
    
    function getAgentStats(address agent) external view returns (
        uint256 _wins,
        uint256 _losses,
        uint256 _totalWagered,
        string memory _name
    ) {
        return (wins[agent], losses[agent], totalWagered[agent], agentNames[agent]);
    }
    
    /**
     * @notice Get full agent profile including verification status
     */
    function getAgentProfile(address agent) external view returns (
        string memory name,
        uint256 _wins,
        uint256 _losses,
        uint256 wagered,
        bool canPlay,
        bool moltbookVerified
    ) {
        return (
            agentNames[agent],
            wins[agent],
            losses[agent],
            totalWagered[agent],
            verifiedAgents[agent],
            agentStatus[agent] == VerificationStatus.Verified
        );
    }
    
    /**
     * @notice Get all OPEN games (not challenges)
     */
    function getOpenGames(uint256 offset, uint256 limit) external view returns (uint256[] memory gameIds, Game[] memory openGames) {
        uint256 count = 0;
        for (uint256 i = 1; i < nextGameId && count < limit; i++) {
            if (games[i].state == GameState.Created && games[i].challenged == address(0)) {
                count++;
            }
        }
        
        gameIds = new uint256[](count);
        openGames = new Game[](count);
        
        uint256 index = 0;
        uint256 skipped = 0;
        for (uint256 i = 1; i < nextGameId && index < count; i++) {
            if (games[i].state == GameState.Created && games[i].challenged == address(0)) {
                if (skipped >= offset) {
                    gameIds[index] = i;
                    openGames[index] = games[i];
                    index++;
                } else {
                    skipped++;
                }
            }
        }
        
        return (gameIds, openGames);
    }
    
    /**
     * @notice Get pending challenges received by an agent
     */
    function getPendingChallenges(address agent) external view returns (uint256[] memory gameIds, Game[] memory challengeGames) {
        return getPendingChallengesPaginated(agent, 0, 50); // Default limit 50
    }
    
    /**
     * @notice Get pending challenges with pagination (Fix #63: bounded loops)
     */
    function getPendingChallengesPaginated(address agent, uint256 start, uint256 limit) public view returns (uint256[] memory gameIds, Game[] memory challengeGames) {
        uint256[] storage received = challengesReceived[agent];
        if (start >= received.length) {
            return (new uint256[](0), new Game[](0));
        }
        
        // Bound the limit to prevent DoS
        if (limit > 100) limit = 100;
        uint256 end = start + limit > received.length ? received.length : start + limit;
        
        // Count active challenges in range
        uint256 count = 0;
        for (uint256 i = start; i < end; i++) {
            if (games[received[i]].state == GameState.Created) {
                count++;
            }
        }
        
        gameIds = new uint256[](count);
        challengeGames = new Game[](count);
        
        uint256 index = 0;
        for (uint256 i = start; i < end && index < count; i++) {
            uint256 gid = received[i];
            if (games[gid].state == GameState.Created) {
                gameIds[index] = gid;
                challengeGames[index] = games[gid];
                index++;
            }
        }
        
        return (gameIds, challengeGames);
    }
    
    /**
     * @notice Get challenges sent by an agent (pending)
     */
    function getSentChallenges(address agent) external view returns (uint256[] memory gameIds, Game[] memory challengeGames) {
        return getSentChallengesPaginated(agent, 0, 50); // Default limit 50
    }
    
    /**
     * @notice Get sent challenges with pagination (Fix #63: bounded loops)
     */
    function getSentChallengesPaginated(address agent, uint256 start, uint256 limit) public view returns (uint256[] memory gameIds, Game[] memory challengeGames) {
        uint256[] storage sent = challengesSent[agent];
        if (start >= sent.length) {
            return (new uint256[](0), new Game[](0));
        }
        
        // Bound the limit to prevent DoS
        if (limit > 100) limit = 100;
        uint256 end = start + limit > sent.length ? sent.length : start + limit;
        
        uint256 count = 0;
        for (uint256 i = start; i < end; i++) {
            if (games[sent[i]].state == GameState.Created) {
                count++;
            }
        }
        
        gameIds = new uint256[](count);
        challengeGames = new Game[](count);
        
        uint256 index = 0;
        for (uint256 i = start; i < end && index < count; i++) {
            uint256 gid = sent[i];
            if (games[gid].state == GameState.Created) {
                gameIds[index] = gid;
                challengeGames[index] = games[gid];
                index++;
            }
        }
        
        return (gameIds, challengeGames);
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high");
        protocolFeeBps = _feeBps;
    }
    
    function setBetLimits(uint256 _min, uint256 _max) external onlyOwner {
        require(_min < _max, "Invalid limits");
        minBet = _min;
        maxBet = _max;
    }
    
    function withdrawFees(address to) external onlyOwner {
        uint256 balance = shellToken.balanceOf(address(this));
        uint256 reserved = 0;
        for (uint256 i = 1; i < nextGameId; i++) {
            if (games[i].state == GameState.Created) {
                reserved += games[i].betAmount;
            } else if (games[i].state == GameState.Joined) {
                reserved += games[i].betAmount * 2;
            }
        }
        require(balance > reserved, "No fees to withdraw");
        shellToken.safeTransfer(to, balance - reserved);
    }
    
    function generateCommitment(uint8 choice, bytes32 secret) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(choice, secret));
    }
}
