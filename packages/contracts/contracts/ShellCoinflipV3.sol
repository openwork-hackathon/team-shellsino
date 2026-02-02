// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellCoinflipV3
 * @notice Instant-match coinflip with zero waiting
 * @dev No more commit-reveal. Enter pool → get matched → instant result.
 * 
 *   🪙 SHELL COINFLIP V3 🪙
 *   "No waiting. Just flipping."
 */
contract ShellCoinflipV3 is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    
    uint256 public protocolFeeBps = 100; // 1% fee
    uint256 public totalGamesPlayed;
    uint256 public totalVolume;
    
    // Supported bet amounts for instant matching
    uint256[] public supportedBets;
    mapping(uint256 => bool) public isSupportedBet;
    
    // Matching pools: betAmount => waiting player (0 if empty)
    mapping(uint256 => address) public matchingPool;
    mapping(uint256 => uint8) public poolPlayerChoice; // 0 = heads, 1 = tails
    mapping(uint256 => uint256) public poolTimestamp;
    
    // Direct challenges (simplified - no commit-reveal)
    struct Challenge {
        address challenger;
        address challenged;
        uint256 betAmount;
        uint8 challengerChoice;
        uint256 createdAt;
        bool accepted;
        bool resolved;
        address winner;
    }
    
    mapping(uint256 => Challenge) public challenges;
    uint256 public nextChallengeId = 1;
    
    // Challenge timeout
    uint256 public challengeTimeout = 5 minutes;
    
    // Agent registry
    mapping(address => bool) public verifiedAgents;
    mapping(address => string) public agentNames;
    
    // Verification
    enum VerificationStatus { None, Pending, Verified }
    mapping(address => VerificationStatus) public agentStatus;
    mapping(address => bool) public verifiers;
    
    // Stats
    mapping(address => uint256) public wins;
    mapping(address => uint256) public losses;
    mapping(address => uint256) public totalWagered;
    
    // Events
    event PoolEntered(address indexed player, uint256 betAmount, uint8 choice);
    event InstantMatch(uint256 indexed matchId, address indexed player1, address indexed player2, uint256 betAmount, address winner, uint256 payout);
    event PoolExited(address indexed player, uint256 betAmount);
    event ChallengeCreated(uint256 indexed challengeId, address indexed challenger, address indexed challenged, uint256 betAmount);
    event ChallengeAccepted(uint256 indexed challengeId, address indexed challenged);
    event ChallengeResolved(uint256 indexed challengeId, address indexed winner, uint256 payout);
    event ChallengeCancelled(uint256 indexed challengeId);
    event AgentVerified(address indexed agent, string name);
    event AgentVerifiedByMoltbook(address indexed agent, address indexed verifier);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event ChallengeTimeoutUpdated(uint256 oldTimeout, uint256 newTimeout);
    event VerifierUpdated(address indexed verifier, bool status);
    event SupportedBetAdded(uint256 amount);
    event SupportedBetRemoved(uint256 amount);
    event FeesWithdrawn(address indexed to, uint256 amount);
    
    constructor(address _shellToken) Ownable(msg.sender) {
        require(_shellToken != address(0), "Invalid token address");
        shellToken = IERC20(_shellToken);
        verifiers[msg.sender] = true;
        
        // Initialize supported bet amounts
        _addSupportedBet(1e18);     // 1 SHELL
        _addSupportedBet(5e18);     // 5 SHELL
        _addSupportedBet(10e18);    // 10 SHELL
        _addSupportedBet(25e18);    // 25 SHELL
        _addSupportedBet(50e18);    // 50 SHELL
        _addSupportedBet(100e18);   // 100 SHELL
        _addSupportedBet(250e18);   // 250 SHELL
        _addSupportedBet(500e18);   // 500 SHELL
        _addSupportedBet(1000e18);  // 1000 SHELL
    }
    
    modifier onlyVerifiedAgent() {
        require(verifiedAgents[msg.sender], "Not a verified agent");
        _;
    }
    
    // ============ AGENT REGISTRATION ============
    
    function registerAgent(string calldata name) external {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Invalid name");
        verifiedAgents[msg.sender] = true;
        agentNames[msg.sender] = name;
        
        if (agentStatus[msg.sender] == VerificationStatus.None) {
            agentStatus[msg.sender] = VerificationStatus.Pending;
        }
        
        emit AgentVerified(msg.sender, name);
    }
    
    function verifyAgentIdentity(address agent) external {
        require(verifiers[msg.sender], "Not a verifier");
        require(agentStatus[agent] == VerificationStatus.Pending, "Agent not pending");
        agentStatus[agent] = VerificationStatus.Verified;
        emit AgentVerifiedByMoltbook(agent, msg.sender);
    }
    
    function isMoltbookVerified(address agent) external view returns (bool) {
        return agentStatus[agent] == VerificationStatus.Verified;
    }
    
    // ============ INSTANT MATCHING ============
    
    /**
     * @notice Enter the matching pool - get instantly matched or wait
     * @param betAmount Must be a supported bet amount
     * @param choice Your choice: 0 = heads, 1 = tails
     * @return matched Whether you were instantly matched
     * @return opponent Address of opponent (if matched)
     * @return winner Address of winner (if matched)
     */
    function enterPool(uint256 betAmount, uint8 choice) 
        external 
        onlyVerifiedAgent 
        nonReentrant
        whenNotPaused 
        returns (bool matched, address opponent, address winner) 
    {
        require(isSupportedBet[betAmount], "Unsupported bet amount");
        require(choice <= 1, "Choice must be 0 or 1");
        require(matchingPool[betAmount] != msg.sender, "Already in pool");
        
        // Transfer SHELL from player
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        address waitingPlayer = matchingPool[betAmount];
        
        if (waitingPlayer == address(0)) {
            // No one waiting - enter pool
            matchingPool[betAmount] = msg.sender;
            poolPlayerChoice[betAmount] = choice;
            poolTimestamp[betAmount] = block.timestamp;
            
            emit PoolEntered(msg.sender, betAmount, choice);
            return (false, address(0), address(0));
        }
        
        // Someone waiting - INSTANT MATCH!
        return _resolveMatch(betAmount, choice, waitingPlayer);
    }
    
    /**
     * @dev Internal function to resolve an instant match
     */
    function _resolveMatch(uint256 betAmount, uint8 player2Choice, address player1) 
        internal 
        returns (bool, address, address) 
    {
        uint8 player1Choice = poolPlayerChoice[betAmount];
        address player2 = msg.sender;
        
        // Clear pool
        matchingPool[betAmount] = address(0);
        poolPlayerChoice[betAmount] = 0;
        poolTimestamp[betAmount] = 0;
        
        // Determine winner
        address gameWinner = _determineWinner(player1, player2, player1Choice, player2Choice);
        address loser = gameWinner == player1 ? player2 : player1;
        
        // Calculate and distribute payout
        uint256 payout = _distributePayout(betAmount, gameWinner, loser, player1, player2);
        
        emit InstantMatch(totalGamesPlayed, player1, player2, betAmount, gameWinner, payout);
        
        return (true, player1, gameWinner);
    }
    
    /**
     * @dev Determine winner using block randomness
     */
    function _determineWinner(address player1, address player2, uint8 player1Choice, uint8 player2Choice) 
        internal 
        view 
        returns (address) 
    {
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            player1,
            player2,
            totalGamesPlayed
        )));
        
        uint8 result = uint8(randomness % 2);
        return player1Choice == result ? player1 : player2;
    }
    
    /**
     * @dev Calculate and distribute payout
     */
    function _distributePayout(uint256 betAmount, address winner, address loser, address player1, address player2) 
        internal 
        returns (uint256 payout) 
    {
        uint256 totalPot = betAmount * 2;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        payout = totalPot - fee;
        
        // Update stats
        totalGamesPlayed++;
        totalVolume += totalPot;
        wins[winner]++;
        losses[loser]++;
        totalWagered[player1] += betAmount;
        totalWagered[player2] += betAmount;
        
        // Pay winner
        shellToken.safeTransfer(winner, payout);
        
        return payout;
    }
    
    /**
     * @notice Exit the matching pool (if not matched yet)
     * @param betAmount The bet amount pool to exit
     */
    function exitPool(uint256 betAmount) external nonReentrant {
        require(matchingPool[betAmount] == msg.sender, "Not in this pool");
        
        // Clear pool
        matchingPool[betAmount] = address(0);
        poolPlayerChoice[betAmount] = 0;
        poolTimestamp[betAmount] = 0;
        
        // Refund
        shellToken.safeTransfer(msg.sender, betAmount);
        
        emit PoolExited(msg.sender, betAmount);
    }
    
    /**
     * @notice Force-exit stale pool entries (after 1 hour)
     */
    function forceExitStalePool(uint256 betAmount) external nonReentrant {
        address waiting = matchingPool[betAmount];
        require(waiting != address(0), "Pool empty");
        require(block.timestamp > poolTimestamp[betAmount] + 1 hours, "Not stale yet");
        
        matchingPool[betAmount] = address(0);
        poolPlayerChoice[betAmount] = 0;
        poolTimestamp[betAmount] = 0;
        
        shellToken.safeTransfer(waiting, betAmount);
        emit PoolExited(waiting, betAmount);
    }
    
    // ============ DIRECT CHALLENGES ============
    
    /**
     * @notice Challenge a specific agent (simplified - no commit-reveal)
     * @param challenged Address of the agent to challenge
     * @param betAmount Amount to bet
     * @param choice Your choice: 0 = heads, 1 = tails
     */
    function createChallenge(address challenged, uint256 betAmount, uint8 choice) 
        external 
        onlyVerifiedAgent 
        nonReentrant
        whenNotPaused 
        returns (uint256 challengeId) 
    {
        require(challenged != address(0) && challenged != msg.sender, "Invalid opponent");
        require(verifiedAgents[challenged], "Opponent not verified");
        require(betAmount >= 1e18 && betAmount <= 10000e18, "Bet out of range");
        require(choice <= 1, "Choice must be 0 or 1");
        
        // Transfer SHELL from challenger
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        challengeId = nextChallengeId++;
        challenges[challengeId] = Challenge({
            challenger: msg.sender,
            challenged: challenged,
            betAmount: betAmount,
            challengerChoice: choice,
            createdAt: block.timestamp,
            accepted: false,
            resolved: false,
            winner: address(0)
        });
        
        emit ChallengeCreated(challengeId, msg.sender, challenged, betAmount);
        return challengeId;
    }
    
    /**
     * @notice Accept a challenge and resolve instantly
     * @param challengeId The challenge to accept
     * @param choice Your choice: 0 = heads, 1 = tails
     */
    function acceptChallenge(uint256 challengeId, uint8 choice) 
        external 
        onlyVerifiedAgent 
        nonReentrant 
    {
        Challenge storage c = challenges[challengeId];
        require(c.challenged == msg.sender, "Not your challenge");
        require(!c.accepted && !c.resolved, "Already handled");
        require(block.timestamp <= c.createdAt + challengeTimeout, "Challenge expired");
        require(choice <= 1, "Choice must be 0 or 1");
        
        // Transfer SHELL from accepter
        shellToken.safeTransferFrom(msg.sender, address(this), c.betAmount);
        
        c.accepted = true;
        
        emit ChallengeAccepted(challengeId, msg.sender);
        
        // Instant resolution
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            c.challenger,
            c.challenged,
            c.challengerChoice,
            choice,
            challengeId
        )));
        
        uint8 result = uint8(randomness % 2);
        
        address winner;
        address loser;
        if (c.challengerChoice == result) {
            winner = c.challenger;
            loser = c.challenged;
        } else {
            winner = c.challenged;
            loser = c.challenger;
        }
        
        c.resolved = true;
        c.winner = winner;
        
        // Calculate payout
        uint256 totalPot = c.betAmount * 2;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 payout = totalPot - fee;
        
        // Update stats
        totalGamesPlayed++;
        totalVolume += totalPot;
        wins[winner]++;
        losses[loser]++;
        totalWagered[c.challenger] += c.betAmount;
        totalWagered[c.challenged] += c.betAmount;
        
        // Pay winner
        shellToken.safeTransfer(winner, payout);
        
        emit ChallengeResolved(challengeId, winner, payout);
    }
    
    /**
     * @notice Cancel an expired or unaccepted challenge
     */
    function cancelChallenge(uint256 challengeId) external nonReentrant {
        Challenge storage c = challenges[challengeId];
        require(c.challenger == msg.sender || block.timestamp > c.createdAt + challengeTimeout, "Cannot cancel");
        require(!c.accepted && !c.resolved, "Already handled");
        
        c.resolved = true;
        
        // Refund challenger
        shellToken.safeTransfer(c.challenger, c.betAmount);
        
        emit ChallengeCancelled(challengeId);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    function getPoolStatus(uint256 betAmount) external view returns (
        bool hasWaiting,
        address waitingPlayer,
        uint8 waitingChoice,
        uint256 waitingSince
    ) {
        address waiting = matchingPool[betAmount];
        return (
            waiting != address(0),
            waiting,
            poolPlayerChoice[betAmount],
            poolTimestamp[betAmount]
        );
    }
    
    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return challenges[challengeId];
    }
    
    function getAgentStats(address agent) external view returns (
        uint256 _wins,
        uint256 _losses,
        uint256 _totalWagered,
        string memory _name
    ) {
        return (wins[agent], losses[agent], totalWagered[agent], agentNames[agent]);
    }
    
    function getSupportedBets() external view returns (uint256[] memory) {
        return supportedBets;
    }
    
    function getAllPoolStatus() external view returns (
        uint256[] memory bets,
        bool[] memory hasWaiting,
        address[] memory waitingPlayers
    ) {
        uint256 len = supportedBets.length;
        bets = new uint256[](len);
        hasWaiting = new bool[](len);
        waitingPlayers = new address[](len);
        
        for (uint256 i = 0; i < len; i++) {
            bets[i] = supportedBets[i];
            waitingPlayers[i] = matchingPool[supportedBets[i]];
            hasWaiting[i] = waitingPlayers[i] != address(0);
        }
        
        return (bets, hasWaiting, waitingPlayers);
    }
    
    // ============ ADMIN ============
    
    function _addSupportedBet(uint256 amount) internal {
        if (!isSupportedBet[amount]) {
            supportedBets.push(amount);
            isSupportedBet[amount] = true;
        }
    }
    
    function addSupportedBet(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        _addSupportedBet(amount);
        emit SupportedBetAdded(amount);
    }
    
    function removeSupportedBet(uint256 amount) external onlyOwner {
        require(matchingPool[amount] == address(0), "Pool not empty");
        isSupportedBet[amount] = false;
        emit SupportedBetRemoved(amount);
        // Note: doesn't remove from array, just disables
    }
    
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Fee too high");
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(oldFee, _feeBps);
    }
    
    function setChallengeTimeout(uint256 _timeout) external onlyOwner {
        require(_timeout >= 1 minutes && _timeout <= 1 hours, "Invalid timeout");
        uint256 oldTimeout = challengeTimeout;
        challengeTimeout = _timeout;
        emit ChallengeTimeoutUpdated(oldTimeout, _timeout);
    }
    
    function setVerifier(address verifier, bool status) external onlyOwner {
        require(verifier != address(0), "Invalid verifier address");
        verifiers[verifier] = status;
        emit VerifierUpdated(verifier, status);
    }
    
    /// @notice Pause the contract (emergency stop)
    function pause() external onlyOwner {
        _pause();
    }
    
    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }
    
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 balance = shellToken.balanceOf(address(this));
        
        // Calculate reserved amounts (pools + pending challenges)
        uint256 reserved = 0;
        for (uint256 i = 0; i < supportedBets.length; i++) {
            if (matchingPool[supportedBets[i]] != address(0)) {
                reserved += supportedBets[i];
            }
        }
        // Note: Would need to track pending challenges too for full accuracy
        
        require(balance > reserved, "No fees to withdraw");
        uint256 withdrawAmount = balance - reserved;
        shellToken.safeTransfer(to, withdrawAmount);
        emit FeesWithdrawn(to, withdrawAmount);
    }
}
