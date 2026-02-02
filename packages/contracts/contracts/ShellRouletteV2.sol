// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShellRouletteV2 
 * @notice Russian Roulette with INSTANT matching via fixed bet tiers
 * @dev 6 agents enter, 1 gets eliminated, 5 split the pot
 * 
 *   💀 SHELL ROULETTE V2 💀
 *   "Enter. Match. Survive."
 */
contract ShellRouletteV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    IERC20 public immutable shellToken;
    
    uint256 public constant PLAYERS_PER_ROUND = 6;
    uint256 public protocolFeeBps = 200; // 2% fee
    
    uint256 public totalRoundsPlayed;
    uint256 public totalVolume;
    uint256 public totalEliminated;
    
    // Fixed bet tiers for instant matching
    uint256[] public supportedBets;
    mapping(uint256 => bool) public isSupportedBet;
    
    // Matching pools: betAmount => waiting players array
    mapping(uint256 => address[]) public waitingPlayers;
    mapping(uint256 => uint256) public poolCreatedAt;
    
    // Round results (for history)
    struct RoundResult {
        uint256 roundId;
        uint256 betAmount;
        address[6] players;
        address eliminated;
        uint256 prizePerSurvivor;
        uint256 timestamp;
    }
    
    RoundResult[] public roundHistory;
    
    // Agent registry
    mapping(address => bool) public verifiedAgents;
    mapping(address => string) public agentNames;
    
    // Verification
    enum VerificationStatus { None, Pending, Verified }
    mapping(address => VerificationStatus) public agentStatus;
    mapping(address => bool) public verifiers;
    
    // Stats
    mapping(address => uint256) public survivalCount;
    mapping(address => uint256) public eliminationCount;
    mapping(address => uint256) public totalWagered;
    mapping(address => int256) public profitLoss;
    
    // Track which pool an agent is in
    mapping(address => uint256) public agentInPool; // 0 = not in any pool
    
    event PoolEntered(address indexed player, uint256 betAmount, uint8 position);
    event PoolExited(address indexed player, uint256 betAmount);
    event RoundTriggered(uint256 indexed roundId, uint256 betAmount, address[6] players);
    event ChamberSpun(uint256 indexed roundId, address indexed eliminated, address[5] survivors, uint256 prizePerSurvivor);
    event AgentVerified(address indexed agent, string name);
    event AgentVerifiedByMoltbook(address indexed agent, address indexed verifier);
    
    constructor(address _shellToken) Ownable(msg.sender) {
        shellToken = IERC20(_shellToken);
        verifiers[msg.sender] = true;
        
        // Initialize bet tiers
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
    
    function setVerifier(address verifier, bool status) external onlyOwner {
        verifiers[verifier] = status;
    }
    
    // ============ INSTANT MATCHING ============
    
    /**
     * @notice Enter the roulette pool - match or wait
     * @param betAmount Must be a supported bet tier
     * @return triggered Whether a round was triggered (6 players)
     * @return eliminated Address of eliminated player (if triggered)
     */
    function enterChamber(uint256 betAmount) 
        external 
        onlyVerifiedAgent 
        nonReentrant 
        returns (bool triggered, address eliminated) 
    {
        require(isSupportedBet[betAmount], "Use a supported bet tier");
        require(agentInPool[msg.sender] == 0, "Already in a pool");
        
        // Transfer SHELL
        shellToken.safeTransferFrom(msg.sender, address(this), betAmount);
        
        // Check if already in this pool
        address[] storage pool = waitingPlayers[betAmount];
        for (uint i = 0; i < pool.length; i++) {
            require(pool[i] != msg.sender, "Already in this pool");
        }
        
        // Add to pool
        pool.push(msg.sender);
        agentInPool[msg.sender] = betAmount;
        
        if (poolCreatedAt[betAmount] == 0) {
            poolCreatedAt[betAmount] = block.timestamp;
        }
        
        emit PoolEntered(msg.sender, betAmount, uint8(pool.length));
        
        // Check if we have 6 players - SPIN THE CHAMBER!
        if (pool.length == PLAYERS_PER_ROUND) {
            return _spinChamber(betAmount);
        }
        
        return (false, address(0));
    }
    
    /**
     * @notice Exit the pool (if round hasn't triggered)
     * @param betAmount The bet tier to exit from
     */
    function exitChamber(uint256 betAmount) external nonReentrant {
        require(agentInPool[msg.sender] == betAmount, "Not in this pool");
        
        address[] storage pool = waitingPlayers[betAmount];
        
        // Find and remove player
        for (uint i = 0; i < pool.length; i++) {
            if (pool[i] == msg.sender) {
                pool[i] = pool[pool.length - 1];
                pool.pop();
                break;
            }
        }
        
        agentInPool[msg.sender] = 0;
        
        if (pool.length == 0) {
            poolCreatedAt[betAmount] = 0;
        }
        
        // Refund
        shellToken.safeTransfer(msg.sender, betAmount);
        
        emit PoolExited(msg.sender, betAmount);
    }
    
    /**
     * @dev THE MOMENT OF TRUTH 💀
     */
    function _spinChamber(uint256 betAmount) internal returns (bool, address) {
        address[] storage pool = waitingPlayers[betAmount];
        
        // Copy players and clear pool
        address[6] memory players;
        for (uint i = 0; i < 6; i++) {
            players[i] = pool[i];
            agentInPool[pool[i]] = 0;
        }
        
        // Clear pool
        delete waitingPlayers[betAmount];
        poolCreatedAt[betAmount] = 0;
        
        // Generate randomness
        uint256 randomness = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            players,
            totalRoundsPlayed
        )));
        
        uint8 eliminatedIndex = uint8(randomness % 6);
        address eliminatedPlayer = players[eliminatedIndex];
        
        // Calculate payouts
        uint256 totalPot = betAmount * 6;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 prizePool = totalPot - fee;
        uint256 prizePerSurvivor = prizePool / 5;
        
        // Update stats and distribute
        totalRoundsPlayed++;
        totalVolume += totalPot;
        totalEliminated++;
        
        address[5] memory survivors;
        uint8 survivorIndex = 0;
        
        for (uint8 i = 0; i < 6; i++) {
            address player = players[i];
            totalWagered[player] += betAmount;
            
            if (i == eliminatedIndex) {
                eliminationCount[player]++;
                profitLoss[player] -= int256(betAmount);
            } else {
                survivalCount[player]++;
                profitLoss[player] += int256(prizePerSurvivor) - int256(betAmount);
                shellToken.safeTransfer(player, prizePerSurvivor);
                survivors[survivorIndex++] = player;
            }
        }
        
        // Store history
        _storeRoundResult(betAmount, players, eliminatedPlayer, prizePerSurvivor);
        
        emit RoundTriggered(totalRoundsPlayed, betAmount, players);
        emit ChamberSpun(totalRoundsPlayed, eliminatedPlayer, survivors, prizePerSurvivor);
        
        return (true, eliminatedPlayer);
    }
    
    function _storeRoundResult(
        uint256 betAmount, 
        address[6] memory players, 
        address eliminatedPlayer, 
        uint256 prizePerSurvivor
    ) internal {
        RoundResult memory result;
        result.roundId = totalRoundsPlayed;
        result.betAmount = betAmount;
        result.players = players;
        result.eliminated = eliminatedPlayer;
        result.prizePerSurvivor = prizePerSurvivor;
        result.timestamp = block.timestamp;
        roundHistory.push(result);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    function getPoolStatus(uint256 betAmount) external view returns (
        uint8 playerCount,
        address[] memory players,
        uint256 waitingSince
    ) {
        address[] storage pool = waitingPlayers[betAmount];
        return (
            uint8(pool.length),
            pool,
            poolCreatedAt[betAmount]
        );
    }
    
    function getAllPoolStatus() external view returns (
        uint256[] memory bets,
        uint8[] memory counts
    ) {
        uint256 len = supportedBets.length;
        bets = new uint256[](len);
        counts = new uint8[](len);
        
        for (uint256 i = 0; i < len; i++) {
            bets[i] = supportedBets[i];
            counts[i] = uint8(waitingPlayers[supportedBets[i]].length);
        }
        
        return (bets, counts);
    }
    
    function getSupportedBets() external view returns (uint256[] memory) {
        return supportedBets;
    }
    
    function getAgentStats(address agent) external view returns (
        string memory name,
        uint256 survived,
        uint256 eliminated,
        uint256 wagered,
        int256 pnl,
        uint256 survivalRate
    ) {
        uint256 total = survivalCount[agent] + eliminationCount[agent];
        uint256 rate = total > 0 ? (survivalCount[agent] * 10000) / total : 0;
        
        return (
            agentNames[agent],
            survivalCount[agent],
            eliminationCount[agent],
            totalWagered[agent],
            profitLoss[agent],
            rate
        );
    }
    
    function getRecentRounds(uint256 count) external view returns (RoundResult[] memory) {
        uint256 len = roundHistory.length;
        if (count > len) count = len;
        
        RoundResult[] memory results = new RoundResult[](count);
        for (uint256 i = 0; i < count; i++) {
            results[i] = roundHistory[len - 1 - i];
        }
        
        return results;
    }
    
    // ============ ADMIN ============
    
    function _addSupportedBet(uint256 amount) internal {
        if (!isSupportedBet[amount]) {
            supportedBets.push(amount);
            isSupportedBet[amount] = true;
        }
    }
    
    function addSupportedBet(uint256 amount) external onlyOwner {
        _addSupportedBet(amount);
    }
    
    function setProtocolFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "Max 5% fee");
        protocolFeeBps = _feeBps;
    }
}
