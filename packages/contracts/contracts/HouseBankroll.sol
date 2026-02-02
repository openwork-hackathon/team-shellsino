// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HouseBankroll - Be The House
 * @notice Stake $HOUSE tokens to provide bankroll for PvH games and earn profits
 * @dev Manages bankroll for player vs house games, distributes profits to stakers
 */
contract HouseBankroll is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ State ============
    IERC20 public immutable houseToken;  // $HOUSE - staking token
    IERC20 public immutable shellToken;  // $SHELL - bankroll/betting token
    
    // Staking
    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public rewardDebt;
    
    // Reward tracking (for profit distribution)
    uint256 public accRewardPerShare;  // Accumulated rewards per staked token (scaled by 1e18)
    uint256 public totalProfits;       // Total profits ever generated
    uint256 public totalLosses;        // Total losses ever paid out
    
    // Game contracts that can interact with bankroll
    mapping(address => bool) public authorizedGames;
    
    // Limits
    uint256 public maxExposurePercent = 10;  // Max single game can risk (10% of bankroll)
    uint256 public minStake = 1e18;          // Minimum 1 HOUSE to stake
    uint256 public minBankrollToOperate = 0; // Minimum bankroll before games are enabled (0 = disabled)
    
    // ============ Events ============
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event ProfitDeposited(address indexed game, uint256 amount);
    event LossPaid(address indexed game, address indexed winner, uint256 amount);
    event GameAuthorized(address indexed game, bool authorized);
    event BankrollDeposited(address indexed depositor, uint256 amount);
    
    // ============ Errors ============
    error InsufficientStake();
    error InsufficientBalance();
    error NotAuthorizedGame();
    error ExceedsMaxExposure();
    error NothingToClaim();
    error ZeroAmount();
    error BankrollNotSeeded();
    
    constructor(address _houseToken, address _shellToken) Ownable(msg.sender) {
        houseToken = IERC20(_houseToken);
        shellToken = IERC20(_shellToken);
    }
    
    // ============ Staking Functions ============
    
    /**
     * @notice Stake $HOUSE tokens to become a house LP
     * @param amount Amount of $HOUSE to stake
     */
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount < minStake && stakedBalance[msg.sender] == 0) revert InsufficientStake();
        
        // Claim any pending rewards first
        _claimRewards(msg.sender);
        
        // Transfer $HOUSE from user
        houseToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update staking state
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;
        
        // Update reward debt
        rewardDebt[msg.sender] = (stakedBalance[msg.sender] * accRewardPerShare) / 1e18;
        
        emit Staked(msg.sender, amount);
    }
    
    /**
     * @notice Unstake $HOUSE tokens
     * @param amount Amount of $HOUSE to unstake
     */
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (stakedBalance[msg.sender] < amount) revert InsufficientBalance();
        
        // Claim any pending rewards first
        _claimRewards(msg.sender);
        
        // Update staking state
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        
        // Update reward debt
        rewardDebt[msg.sender] = (stakedBalance[msg.sender] * accRewardPerShare) / 1e18;
        
        // Transfer $HOUSE back to user
        houseToken.safeTransfer(msg.sender, amount);
        
        emit Unstaked(msg.sender, amount);
    }
    
    /**
     * @notice Claim accumulated $SHELL rewards
     */
    function claimRewards() external nonReentrant {
        uint256 claimed = _claimRewards(msg.sender);
        if (claimed == 0) revert NothingToClaim();
    }
    
    /**
     * @notice Internal reward claim logic
     */
    function _claimRewards(address user) internal returns (uint256) {
        if (stakedBalance[user] == 0) return 0;
        
        uint256 pending = pendingRewards(user);
        if (pending == 0) return 0;
        
        rewardDebt[user] = (stakedBalance[user] * accRewardPerShare) / 1e18;
        
        // Transfer rewards from bankroll
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        if (pending > bankrollBalance) {
            pending = bankrollBalance; // Cap at available balance
        }
        
        if (pending > 0) {
            shellToken.safeTransfer(user, pending);
            emit RewardsClaimed(user, pending);
        }
        
        return pending;
    }
    
    // ============ Game Integration Functions ============
    
    /**
     * @notice Deposit profits from a game (house won)
     * @param amount Amount of $SHELL profit
     */
    function depositProfit(uint256 amount) external nonReentrant {
        if (!authorizedGames[msg.sender]) revert NotAuthorizedGame();
        if (amount == 0) return;
        
        // Transfer $SHELL from game contract
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Update reward tracking
        totalProfits += amount;
        
        // Distribute to stakers
        if (totalStaked > 0) {
            accRewardPerShare += (amount * 1e18) / totalStaked;
        }
        
        emit ProfitDeposited(msg.sender, amount);
    }
    
    /**
     * @notice Pay out loss to a winner (player won)
     * @param winner Address of the winner
     * @param amount Amount of $SHELL to pay
     */
    function payLoss(address winner, uint256 amount) external nonReentrant {
        if (!authorizedGames[msg.sender]) revert NotAuthorizedGame();
        if (amount == 0) return;
        
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        if (amount > bankrollBalance) revert InsufficientBalance();
        
        // Check exposure limit
        uint256 maxExposure = (bankrollBalance * maxExposurePercent) / 100;
        if (amount > maxExposure) revert ExceedsMaxExposure();
        
        // Transfer to winner
        shellToken.safeTransfer(winner, amount);
        
        totalLosses += amount;
        
        emit LossPaid(msg.sender, winner, amount);
    }
    
    /**
     * @notice Check if bankroll can cover a potential payout
     * @param amount Amount to check
     */
    function canCover(uint256 amount) external view returns (bool) {
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        // Check minimum bankroll requirement
        if (minBankrollToOperate > 0 && bankrollBalance < minBankrollToOperate) {
            return false;
        }
        uint256 maxExposure = (bankrollBalance * maxExposurePercent) / 100;
        return amount <= maxExposure && amount <= bankrollBalance;
    }
    
    /**
     * @notice Check if the house is open for business
     */
    function isOperational() external view returns (bool) {
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        return minBankrollToOperate == 0 || bankrollBalance >= minBankrollToOperate;
    }
    
    /**
     * @notice Get maximum bet allowed based on bankroll
     */
    function getMaxBet(uint256 multiplier) external view returns (uint256) {
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        uint256 maxExposure = (bankrollBalance * maxExposurePercent) / 100;
        return maxExposure / multiplier;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get pending rewards for a user
     */
    function pendingRewards(address user) public view returns (uint256) {
        if (stakedBalance[user] == 0) return 0;
        
        uint256 accReward = (stakedBalance[user] * accRewardPerShare) / 1e18;
        if (accReward <= rewardDebt[user]) return 0;
        
        return accReward - rewardDebt[user];
    }
    
    /**
     * @notice Get total bankroll balance
     */
    function getBankrollBalance() external view returns (uint256) {
        return shellToken.balanceOf(address(this));
    }
    
    /**
     * @notice Get user's share of bankroll
     */
    function getUserShare(address user) external view returns (uint256) {
        if (totalStaked == 0) return 0;
        uint256 bankrollBalance = shellToken.balanceOf(address(this));
        return (bankrollBalance * stakedBalance[user]) / totalStaked;
    }
    
    /**
     * @notice Get APY estimate based on recent profits
     * @dev Returns basis points (10000 = 100%)
     */
    function getEstimatedAPY() external view returns (uint256) {
        if (totalStaked == 0) return 0;
        // Simple estimate: (total profits / total staked) * 10000
        // Real APY would need time tracking
        return (totalProfits * 10000) / totalStaked;
    }
    
    /**
     * @notice Get house stats
     */
    function getHouseStats() external view returns (
        uint256 bankroll,
        uint256 staked,
        uint256 profits,
        uint256 losses,
        uint256 netProfit
    ) {
        bankroll = shellToken.balanceOf(address(this));
        staked = totalStaked;
        profits = totalProfits;
        losses = totalLosses;
        netProfit = profits > losses ? profits - losses : 0;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Authorize or deauthorize a game contract
     */
    function setGameAuthorization(address game, bool authorized) external onlyOwner {
        authorizedGames[game] = authorized;
        emit GameAuthorized(game, authorized);
    }
    
    /**
     * @notice Set maximum exposure percentage
     */
    function setMaxExposure(uint256 percent) external onlyOwner {
        require(percent > 0 && percent <= 50, "Invalid exposure");
        maxExposurePercent = percent;
    }
    
    /**
     * @notice Set minimum stake amount
     */
    function setMinStake(uint256 amount) external onlyOwner {
        minStake = amount;
    }
    
    /**
     * @notice Set minimum bankroll required to operate games
     * @param amount Minimum $SHELL in bankroll before games can be played (0 to disable)
     */
    function setMinBankrollToOperate(uint256 amount) external onlyOwner {
        minBankrollToOperate = amount;
    }
    
    /**
     * @notice Deposit $SHELL to bankroll (for initial funding or top-up)
     */
    function depositBankroll(uint256 amount) external nonReentrant {
        shellToken.safeTransferFrom(msg.sender, address(this), amount);
        emit BankrollDeposited(msg.sender, amount);
    }
    
    // Fix #65: Add timelock to emergency withdraw
    uint256 public constant EMERGENCY_TIMELOCK = 24 hours;
    
    struct EmergencyRequest {
        address token;
        uint256 amount;
        uint256 requestTime;
        bool executed;
    }
    
    EmergencyRequest public pendingEmergency;
    
    event EmergencyRequested(address token, uint256 amount, uint256 executeAfter);
    event EmergencyCancelled();
    event EmergencyExecuted(address token, uint256 amount);
    
    /**
     * @notice Request emergency withdraw (starts 24h timelock)
     */
    function requestEmergencyWithdraw(address token, uint256 amount) external onlyOwner {
        pendingEmergency = EmergencyRequest({
            token: token,
            amount: amount,
            requestTime: block.timestamp,
            executed: false
        });
        emit EmergencyRequested(token, amount, block.timestamp + EMERGENCY_TIMELOCK);
    }
    
    /**
     * @notice Cancel pending emergency withdraw
     */
    function cancelEmergencyWithdraw() external onlyOwner {
        delete pendingEmergency;
        emit EmergencyCancelled();
    }
    
    /**
     * @notice Execute emergency withdraw after timelock expires
     */
    function executeEmergencyWithdraw() external onlyOwner {
        require(pendingEmergency.requestTime > 0, "No pending request");
        require(!pendingEmergency.executed, "Already executed");
        require(block.timestamp >= pendingEmergency.requestTime + EMERGENCY_TIMELOCK, "Timelock not expired");
        
        pendingEmergency.executed = true;
        IERC20(pendingEmergency.token).safeTransfer(owner(), pendingEmergency.amount);
        emit EmergencyExecuted(pendingEmergency.token, pendingEmergency.amount);
    }
}
