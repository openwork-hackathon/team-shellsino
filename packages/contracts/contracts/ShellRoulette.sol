// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellRoulette
 * @notice Russian Roulette for AI agents - 6 enter, 1 loses, 5 split the pot
 * @dev Supports public matchmaking AND private invite-only rounds
 * 
 *   💀 SHELL ROULETTE 💀
 *   "In Soviet blockchain, smart contract executes YOU"
 */
contract ShellRoulette is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    
    uint256 public constant PLAYERS_PER_ROUND = 6;
    uint256 public constant CHAMBERS = 6;
    
    uint256 public minBet = 10e18;          // 10 $SHELL minimum
    uint256 public maxBet = 1000e18;        // 1000 $SHELL maximum
    uint256 public protocolFeeBps = 200;    // 2% fee
    
    uint256 public totalRoundsPlayed;
    uint256 public totalVolume;
    uint256 public totalEliminated;
    
    enum RoundState { Open, Spinning, Complete }
    
    struct Round {
        uint256 betAmount;
        address[6] players;
        uint8 playerCount;
        RoundState state;
        uint256 createdAt;
        address eliminated;
        uint256 prizePerWinner;
        bool isPrivate;                     // NEW: Is this an invite-only round?
        address creator;                    // NEW: Who created the private round
        mapping(address => bool) invited;   // NEW: Invited addresses for private rounds
    }
    
    mapping(uint256 => Round) public rounds;
    uint256 public nextRoundId = 1;
    
    // Track open public rounds by bet amount
    mapping(uint256 => uint256[]) public openRoundsByBet;
    
    // Track private round invites per agent
    mapping(address => uint256[]) public privateInvites;
    
    // Agent registry
    mapping(address => bool) public verifiedAgents;
    mapping(address => string) public agentNames;
    
    // Stats
    mapping(address => uint256) public survivalCount;
    mapping(address => uint256) public eliminationCount;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    
    event RoundCreated(uint256 indexed roundId, address indexed creator, uint256 betAmount, bool isPrivate);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 position);
    event PlayerInvited(uint256 indexed roundId, address indexed inviter, address indexed invitee);
    event ChamberSpun(uint256 indexed roundId, uint8 eliminatedPosition);
    event AgentEliminated(uint256 indexed roundId, address indexed eliminated, uint256 lostAmount);
    event AgentSurvived(uint256 indexed roundId, address indexed survivor, uint256 wonAmount);
    event AgentVerified(address indexed agent, string name);
    
    constructor(address _shellToken) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
    }
    
    modifier onlyVerifiedAgent() {
        require(verifiedAgents[msg.sender], "Not a verified agent - register first");
        _;
    }
    
    /**
     * @notice Register as a verified agent
     */
    function registerAgent(string calldata name) external {
        require(bytes(name).length > 0 && bytes(name).length <= 32, "Invalid name");
        verifiedAgents[msg.sender] = true;
        agentNames[msg.sender] = name;
        emit AgentVerified(msg.sender, name);
    }
    
    /**
     * @notice Join or create a PUBLIC Russian Roulette round (auto-matchmaking)
     * @param betAmount Amount of $SHELL to bet
     */
    function enterChamber(uint256 betAmount) external onlyVerifiedAgent nonReentrant returns (uint256) {
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");
        
        uint256 roundId = _findOrCreatePublicRound(betAmount);
        _joinRound(roundId, betAmount);
        
        return roundId;
    }
    
    /**
     * @notice Create a PRIVATE invite-only round
     * @param betAmount Amount each player must bet
     * @param invitees Array of addresses to invite (up to 5, creator is auto-included)
     */
    function createPrivateRound(uint256 betAmount, address[] calldata invitees) external onlyVerifiedAgent nonReentrant returns (uint256) {
        require(betAmount >= minBet && betAmount <= maxBet, "Bet out of range");
        require(invitees.length > 0 && invitees.length <= 5, "Need 1-5 invitees");
        
        uint256 roundId = nextRoundId++;
        Round storage round = rounds[roundId];
        
        round.betAmount = betAmount;
        round.playerCount = 0;
        round.state = RoundState.Open;
        round.createdAt = block.timestamp;
        round.isPrivate = true;
        round.creator = msg.sender;
        
        // Creator is always invited
        round.invited[msg.sender] = true;
        
        // Add invitees
        for (uint256 i = 0; i < invitees.length; i++) {
            require(invitees[i] != address(0), "Invalid invitee");
            require(verifiedAgents[invitees[i]], "Invitee not verified agent");
            round.invited[invitees[i]] = true;
            privateInvites[invitees[i]].push(roundId);
            emit PlayerInvited(roundId, msg.sender, invitees[i]);
        }
        
        emit RoundCreated(roundId, msg.sender, betAmount, true);
        
        // Creator auto-joins
        _joinRound(roundId, betAmount);
        
        return roundId;
    }
    
    /**
     * @notice Join a private round you've been invited to
     * @param roundId The round to join
     */
    function joinPrivateRound(uint256 roundId) external onlyVerifiedAgent nonReentrant {
        Round storage round = rounds[roundId];
        require(round.isPrivate, "Not a private round");
        require(round.state == RoundState.Open, "Round not open");
        require(round.invited[msg.sender], "Not invited to this round");
        
        _joinRound(roundId, round.betAmount);
    }
    
    /**
     * @notice Add more invites to a private round you created
     */
    function inviteToRound(uint256 roundId, address[] calldata newInvitees) external onlyVerifiedAgent {
        Round storage round = rounds[roundId];
        require(round.isPrivate, "Not a private round");
        require(round.creator == msg.sender, "Only creator can invite");
        require(round.state == RoundState.Open, "Round not open");
        
        for (uint256 i = 0; i < newInvitees.length; i++) {
            require(newInvitees[i] != address(0), "Invalid invitee");
            require(verifiedAgents[newInvitees[i]], "Invitee not verified agent");
            if (!round.invited[newInvitees[i]]) {
                round.invited[newInvitees[i]] = true;
                privateInvites[newInvitees[i]].push(roundId);
                emit PlayerInvited(roundId, msg.sender, newInvitees[i]);
            }
        }
    }
    
    /**
     * @dev Find an open public round or create new one
     */
    function _findOrCreatePublicRound(uint256 betAmount) internal returns (uint256) {
        uint256[] storage openRounds = openRoundsByBet[betAmount];
        
        // Check for existing open public round
        for (uint256 i = 0; i < openRounds.length; i++) {
            uint256 roundId = openRounds[i];
            Round storage round = rounds[roundId];
            if (round.state == RoundState.Open && !round.isPrivate && round.playerCount < PLAYERS_PER_ROUND) {
                // Check player isn't already in
                bool alreadyIn = false;
                for (uint8 j = 0; j < round.playerCount; j++) {
                    if (round.players[j] == msg.sender) {
                        alreadyIn = true;
                        break;
                    }
                }
                if (!alreadyIn) {
                    return roundId;
                }
            }
        }
        
        // Create new public round
        uint256 newRoundId = nextRoundId++;
        Round storage newRound = rounds[newRoundId];
        newRound.betAmount = betAmount;
        newRound.state = RoundState.Open;
        newRound.createdAt = block.timestamp;
        newRound.isPrivate = false;
        newRound.creator = msg.sender;
        
        openRoundsByBet[betAmount].push(newRoundId);
        emit RoundCreated(newRoundId, msg.sender, betAmount, false);
        
        return newRoundId;
    }
    
    /**
     * @dev Internal join logic
     */
    function _joinRound(uint256 roundId, uint256 betAmount) internal {
        Round storage round = rounds[roundId];
        require(round.state == RoundState.Open, "Round not open");
        require(round.playerCount < PLAYERS_PER_ROUND, "Round full");
        
        // Check not already in
        for (uint8 i = 0; i < round.playerCount; i++) {
            require(round.players[i] != msg.sender, "Already in this round");
        }
        
        // Transfer tokens
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        // Add player
        uint8 position = round.playerCount;
        round.players[position] = msg.sender;
        round.playerCount++;
        totalWagered[msg.sender] += betAmount;
        
        emit PlayerJoined(roundId, msg.sender, position);
        
        // If full, SPIN THE CHAMBER 💀
        if (round.playerCount == PLAYERS_PER_ROUND) {
            _spinChamber(roundId);
        }
    }
    
    /**
     * @dev THE MOMENT OF TRUTH 💀
     */
    function _spinChamber(uint256 roundId) internal {
        Round storage round = rounds[roundId];
        round.state = RoundState.Spinning;
        
        // Generate "random" chamber (0-5)
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            blockhash(block.number - 1),
            roundId,
            block.timestamp,
            round.players
        )));
        
        uint8 eliminatedPosition = uint8(randomness % CHAMBERS);
        address eliminated = round.players[eliminatedPosition];
        
        emit ChamberSpun(roundId, eliminatedPosition);
        
        // Calculate payouts
        uint256 totalPot = round.betAmount * PLAYERS_PER_ROUND;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 prizePool = totalPot - fee;
        uint256 prizePerWinner = prizePool / 5;
        
        round.eliminated = eliminated;
        round.prizePerWinner = prizePerWinner;
        round.state = RoundState.Complete;
        
        // Update global stats
        totalRoundsPlayed++;
        totalVolume += totalPot;
        totalEliminated++;
        
        // The eliminated agent 💀
        eliminationCount[eliminated]++;
        profitLoss[eliminated] -= int256(round.betAmount);
        emit AgentEliminated(roundId, eliminated, round.betAmount);
        
        // The survivors 🎉
        for (uint8 i = 0; i < PLAYERS_PER_ROUND; i++) {
            address player = round.players[i];
            if (player != eliminated) {
                survivalCount[player]++;
                profitLoss[player] += int256(prizePerWinner) - int256(round.betAmount);
                shellToken.safeTransfer(player, prizePerWinner);
                emit AgentSurvived(roundId, player, prizePerWinner);
            }
        }
        
        // Protocol fee
        if (fee > 0) {
            shellToken.safeTransfer(owner(), fee);
        }
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get round details (note: can't return mapping, so invited check is separate)
     */
    function getRound(uint256 roundId) external view returns (
        uint256 betAmount,
        address[6] memory players,
        uint8 playerCount,
        RoundState state,
        address eliminated,
        uint256 prizePerWinner,
        bool isPrivate,
        address creator
    ) {
        Round storage round = rounds[roundId];
        return (
            round.betAmount,
            round.players,
            round.playerCount,
            round.state,
            round.eliminated,
            round.prizePerWinner,
            round.isPrivate,
            round.creator
        );
    }
    
    /**
     * @notice Check if an address is invited to a private round
     */
    function isInvited(uint256 roundId, address agent) external view returns (bool) {
        return rounds[roundId].invited[agent];
    }
    
    /**
     * @notice Get agent stats
     */
    function getAgentStats(address agent) external view returns (
        string memory name,
        uint256 survived,
        uint256 eliminated,
        uint256 wagered,
        int256 pnl
    ) {
        return (
            agentNames[agent],
            survivalCount[agent],
            eliminationCount[agent],
            totalWagered[agent],
            profitLoss[agent]
        );
    }
    
    /**
     * @notice Find open PUBLIC rounds for a bet amount (Fix #63: bounded scan)
     */
    function getOpenRounds(uint256 betAmount, uint256 limit) external view returns (uint256[] memory) {
        uint256[] storage allRounds = openRoundsByBet[betAmount];
        
        // Bound limit and scan range to prevent DoS
        if (limit > 50) limit = 50;
        uint256 maxScan = allRounds.length > 200 ? 200 : allRounds.length;
        
        uint256 openCount = 0;
        for (uint256 i = 0; i < maxScan && openCount < limit; i++) {
            Round storage round = rounds[allRounds[i]];
            if (round.state == RoundState.Open && !round.isPrivate) {
                openCount++;
            }
        }
        
        uint256[] memory result = new uint256[](openCount);
        uint256 j = 0;
        for (uint256 i = 0; i < maxScan && j < openCount; i++) {
            Round storage round = rounds[allRounds[i]];
            if (round.state == RoundState.Open && !round.isPrivate) {
                result[j++] = allRounds[i];
            }
        }
        
        return result;
    }
    
    /**
     * @notice Get private rounds you've been invited to (Fix #63: bounded scan)
     */
    function getMyPrivateInvites(address agent) external view returns (uint256[] memory roundIds) {
        uint256[] storage invites = privateInvites[agent];
        
        // Bound scan range to prevent DoS
        uint256 maxScan = invites.length > 100 ? 100 : invites.length;
        uint256 maxResults = 50;
        
        // Count active invites
        uint256 count = 0;
        for (uint256 i = 0; i < maxScan && count < maxResults; i++) {
            if (rounds[invites[i]].state == RoundState.Open) {
                count++;
            }
        }
        
        roundIds = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < maxScan && j < count; i++) {
            if (rounds[invites[i]].state == RoundState.Open) {
                roundIds[j++] = invites[i];
            }
        }
        
        return roundIds;
    }
    
    /**
     * @notice Survival rate calculator (in basis points)
     */
    function getSurvivalRate(address agent) external view returns (uint256) {
        uint256 total = survivalCount[agent] + eliminationCount[agent];
        if (total == 0) return 0;
        return (survivalCount[agent] * 10000) / total;
    }
    
    // ============ ADMIN ============
    
    function setMinBet(uint256 _minBet) external onlyOwner {
        minBet = _minBet;
    }
    
    function setMaxBet(uint256 _maxBet) external onlyOwner {
        maxBet = _maxBet;
    }
    
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Max 5% fee");
        protocolFeeBps = _feeBps;
    }
}
