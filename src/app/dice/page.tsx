"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther, keccak256, encodePacked, toHex } from "viem";
import Link from "next/link";

// Contract addresses
const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
const DICE_CONTRACT = "0x0000000000000000000000000000000000000000"; // Placeholder - will be updated after deployment

// ERC20 ABI
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Dice Contract ABI
const DICE_ABI = [
  {
    name: "rollDice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
    ],
    outputs: [{ name: "rollId", type: "uint256" }],
  },
  {
    name: "getRoll",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "rollId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rolledNumber", type: "uint8" },
      { name: "payout", type: "uint256" },
      { name: "won", type: "bool" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    name: "getPlayerRolls",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getMultiplier",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "targetNumber", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "minBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "houseEdgeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalGamesPlayed",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "DiceRolled",
    type: "event",
    inputs: [
      { name: "rollId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "betAmount", type: "uint256" },
      { name: "targetNumber", type: "uint8" },
      { name: "rolledNumber", type: "uint8" },
      { name: "payout", type: "uint256" },
      { name: "won", type: "bool" },
    ],
  },
] as const;

// Dice face patterns
const DICE_FACES = [
  ['center'],                           // 1
  ['top-left', 'bottom-right'],        // 2
  ['top-left', 'center', 'bottom-right'], // 3
  ['top-left', 'top-right', 'bottom-left', 'bottom-right'], // 4
  ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'], // 5
  ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'], // 6
];

const DICE_POSITIONS: Record<string, string> = {
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
  'middle-left': 'top-1/2 left-2 -translate-y-1/2',
  'middle-right': 'top-1/2 right-2 -translate-y-1/2',
  'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-2 right-2',
};

function Die({ value, isRolling }: { value: number; isRolling: boolean }) {
  const face = DICE_FACES[value - 1] || DICE_FACES[0];

  return (
    <div className={`
      relative w-20 h-20 sm:w-24 sm:h-24 
      bg-gradient-to-br from-white to-gray-200 
      rounded-xl shadow-xl
      ${isRolling ? 'animate-bounce' : ''}
    `}>
      {/* Die border */}
      <div className="absolute inset-1 border-2 border-gray-300 rounded-lg" />

      {/* Dots */}
      {face.map((pos, i) => (
        <div
          key={i}
          className={`
            absolute w-3 h-3 sm:w-4 sm:h-4 
            bg-gray-900 rounded-full
            ${DICE_POSITIONS[pos]}
          `}
        />
      ))}
    </div>
  );
}

export default function DicePage() {
  const { address, isConnected } = useAccount();
  const [betAmount, setBetAmount] = useState("10");
  const [target, setTarget] = useState(50);
  const [isRolling, setIsRolling] = useState(false);
  const [rolledValue, setRolledValue] = useState(1);
  const [lastResult, setLastResult] = useState<{ rollId: number; rolled: number; won: boolean; payout: string } | null>(null);
  const [rollHistory, setRollHistory] = useState<Array<{ rollId: number; target: number; rolled: number; won: boolean; payout: string }>>([]);
  const [rollMode, setRollMode] = useState<'under' | 'over'>('under');

  // Read balance
  const { data: shellBalance, refetch: refetchBalance } = useReadContract({
    address: SHELL_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: SHELL_TOKEN,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, DICE_CONTRACT] : undefined,
  });

  // Get min/max bets
  const { data: minBet } = useReadContract({
    address: DICE_CONTRACT,
    abi: DICE_ABI,
    functionName: "minBet",
  });

  const { data: maxBet } = useReadContract({
    address: DICE_CONTRACT,
    abi: DICE_ABI,
    functionName: "maxBet",
  });

  // Get multiplier for current target
  const { data: multiplierRaw } = useReadContract({
    address: DICE_CONTRACT,
    abi: DICE_ABI,
    functionName: "getMultiplier",
    args: [target],
  });

  // Contract writes
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: rollDice, data: rollHash, isPending: isRollingTx } = useWriteContract();
  const { isSuccess: rollSuccess } = useWaitForTransactionReceipt({ hash: rollHash });

  const needsApproval = allowance !== undefined && parseEther(betAmount || "0") > allowance;

  // Calculate stats
  const houseEdge = 200; // 2% in bps
  const winChance = rollMode === 'under' ? target - 1 : 100 - target;
  const fairMultiplier = 100 / winChance;
  const actualMultiplier = (fairMultiplier * (10000 - houseEdge)) / 10000;
  const potentialPayout = (parseFloat(betAmount || "0") * actualMultiplier).toFixed(3);

  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess]);

  useEffect(() => {
    if (rollSuccess) {
      refetchBalance();
    }
  }, [rollSuccess]);

  const handleApprove = () => {
    approve({
      address: SHELL_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [DICE_CONTRACT, parseEther("1000000")],
    });
  };

  const handleDemoRoll = async () => {
    setIsRolling(true);
    setLastResult(null);

    // Animate dice
    const rollDuration = 2000;
    const rollInterval = 100;
    let elapsed = 0;

    const interval = setInterval(() => {
      setRolledValue(Math.floor(Math.random() * 100) + 1);
      elapsed += rollInterval;

      if (elapsed >= rollDuration) {
        clearInterval(interval);
        finalizeRoll();
      }
    }, rollInterval);
  };

  const finalizeRoll = () => {
    // Generate final roll (1-100)
    const finalRoll = Math.floor(Math.random() * 100) + 1;
    setRolledValue(finalRoll);

    // Determine win/loss
    const won = rollMode === 'under' ? finalRoll < target : finalRoll > target;
    const payout = won ? parseEther(potentialPayout) : BigInt(0);

    const rollId = Date.now();
    setLastResult({
      rollId,
      rolled: finalRoll,
      won,
      payout: formatEther(payout),
    });

    setRollHistory(prev => [{
      rollId,
      target,
      rolled: finalRoll,
      won,
      payout: formatEther(payout),
    }, ...prev.slice(0, 9)]);

    setIsRolling(false);
  };

  const handleRoll = () => {
    if (DICE_CONTRACT === "0x0000000000000000000000000000000000000000") {
      handleDemoRoll();
      return;
    }

    rollDice({
      address: DICE_CONTRACT,
      abi: DICE_ABI,
      functionName: "rollDice",
      args: [parseEther(betAmount), target],
    });
  };

  // Calculate display value for dice (1-6 scale for visual)
  const displayDieValue = Math.min(6, Math.max(1, Math.ceil(rolledValue / 16.67)));

  const minBetDisplay = minBet ? formatEther(minBet) : "1";
  const maxBetDisplay = maxBet ? formatEther(maxBet) : "100";

  return (
    <main className="min-h-screen bg-[#0e0e0f] text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gradient-to-r from-[#1a1a1b] via-[#1f1a1a] to-[#1a1a1b]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition">
              <div className="relative">
                <span className="text-3xl">🎲</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                  shellsino
                </h1>
                <p className="text-[10px] text-gray-500">dice</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            {isConnected && shellBalance && (
              <div className="text-sm bg-[#272729] px-3 py-1.5 rounded">
                <span className="text-gray-400">$SHELL:</span>{" "}
                <span className="text-red-400 font-mono">
                  {parseFloat(formatEther(shellBalance)).toFixed(2)}
                </span>
              </div>
            )}

            {isConnected ? (
              <span className="text-sm font-mono text-gray-400 bg-[#272729] px-2 py-1 rounded">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            ) : (
              <Link
                href="/"
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded font-medium transition"
              >
                Connect
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">🎲 Shell Dice</h2>
          <p className="text-gray-400">Roll under or over your target to win!</p>
          {DICE_CONTRACT === "0x0000000000000000000000000000000000000000" && (
            <span className="inline-block mt-2 bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full border border-yellow-500/50">
              DEMO MODE
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-3 space-y-6">
            {/* Game Card */}
            <div className="bg-gradient-to-b from-[#1a1a1b] to-[#0f0f10] rounded-2xl p-6 border border-gray-800">
              {/* Roll Mode Selector */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setRollMode('under')}
                  className={`
                    flex-1 py-3 rounded-lg font-bold transition
                    ${rollMode === 'under'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-[#272729] text-gray-400 hover:bg-gray-700'
                    }
                  `}
                >
                  Roll Under
                </button>
                <button
                  onClick={() => setRollMode('over')}
                  className={`
                    flex-1 py-3 rounded-lg font-bold transition
                    ${rollMode === 'over'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-[#272729] text-gray-400 hover:bg-gray-700'
                    }
                  `}
                >
                  Roll Over
                </button>
              </div>

              {/* Target Slider */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-gray-400">
                    Target: Roll {rollMode} <span className="text-xl font-bold text-white">{target}</span>
                  </span>
                  <span className="text-green-400 font-bold">{winChance}% chance</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="98"
                  value={target}
                  onChange={(e) => setTarget(parseInt(e.target.value))}
                  disabled={isRolling}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>2 (High Payout)</span>
                  <span>98 (Low Payout)</span>
                </div>
              </div>

              {/* Bet Amount */}
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-3">Bet Amount ($SHELL)</label>
                <div className="flex flex-wrap gap-2">
                  {['1', '5', '10', '25', '50', '100'].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setBetAmount(amt)}
                      disabled={isRolling}
                      className={`
                        px-4 py-2 rounded-lg font-bold transition
                        ${betAmount === amt
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                          : 'bg-[#272729] text-gray-400 hover:bg-gray-700'
                        }
                        disabled:opacity-50
                      `}
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Min: {minBetDisplay} | Max: {maxBetDisplay} $SHELL
                </p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-[#272729] rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Multiplier</div>
                  <div className="text-xl font-bold text-blue-400">{actualMultiplier.toFixed(2)}x</div>
                </div>
                <div className="bg-[#272729] rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Win Chance</div>
                  <div className="text-xl font-bold text-green-400">{winChance}%</div>
                </div>
                <div className="bg-[#272729] rounded-xl p-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Potential Win</div>
                  <div className="text-xl font-bold text-yellow-400">{potentialPayout}</div>
                </div>
              </div>

              {/* Roll Button */}
              {needsApproval && DICE_CONTRACT !== "0x0000000000000000000000000000000000000000" ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 rounded-xl font-bold text-lg transition"
                >
                  {isApproving ? "Approving..." : "Approve $SHELL"}
                </button>
              ) : (
                <button
                  onClick={handleRoll}
                  disabled={isRolling || isRollingTx}
                  className="w-full py-5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:bg-gray-700 rounded-xl font-bold text-xl transition transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/20"
                >
                  {isRolling || isRollingTx ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin">🎲</span>
                      ROLLING...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      🎲 ROLL DICE ({betAmount} $SHELL)
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Result Display */}
            {lastResult && !isRolling && (
              <div className={`
                rounded-2xl p-6 text-center
                ${lastResult.won
                  ? 'bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/50 animate-win'
                  : 'bg-gradient-to-r from-red-900/30 to-red-800/30 border border-red-500/30'
                }
              `}>
                <div className="text-5xl mb-4">{lastResult.won ? '🎉' : '😔'}</div>
                <div className="text-4xl font-bold mb-2">{lastResult.rolled}</div>
                <div className={`
                  text-xl font-bold
                  ${lastResult.won ? 'text-green-400' : 'text-red-400'}
                `}>
                  {lastResult.won ? `WON ${parseFloat(lastResult.payout).toFixed(2)} $SHELL!` : 'Better luck next time!'}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Dice Visual & History */}
          <div className="lg:col-span-2 space-y-6">
            {/* Dice Visual */}
            <div className="bg-gradient-to-b from-[#1a1a1b] to-[#0f0f10] rounded-2xl p-8 border border-gray-800 flex flex-col items-center">
              <h3 className="text-lg font-bold mb-6 text-gray-400">Roll Result</h3>
              <div className="relative">
                <Die value={displayDieValue} isRolling={isRolling} />
                {/* Number display */}
                <div className="mt-6 text-center">
                  <div className={`
                    text-5xl font-bold font-mono
                    ${isRolling ? 'text-gray-500' : rolledValue < target ? 'text-green-400' : 'text-red-400'}
                  `}>
                    {rolledValue}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    / 100
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Rolls */}
            <div className="bg-[#1a1a1b] rounded-xl p-6 border border-gray-800">
              <h3 className="text-lg font-bold mb-4">📜 Recent Rolls</h3>
              {rollHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No rolls yet. Good luck! 🍀</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {rollHistory.map((roll, i) => (
                    <div key={roll.rollId} className={`
                      flex justify-between items-center p-3 rounded-lg
                      ${roll.won ? 'bg-green-900/20 border border-green-500/20' : 'bg-[#272729]'}
                    `}>
                      <div>
                        <span className="text-sm text-gray-500 mr-2">#{rollHistory.length - i}</span>
                        <span className={roll.won ? 'text-green-400 font-bold' : 'text-red-400'}>
                          {roll.rolled}
                        </span>
                        <span className="text-gray-500 text-sm ml-1">
                          ({roll.target})
                        </span>
                      </div>
                      {roll.won ? (
                        <span className="text-green-400 font-bold text-sm">+{parseFloat(roll.payout).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Game Info */}
        <div className="bg-[#1a1a1b] rounded-xl p-6 border border-gray-800 mt-8">
          <h3 className="font-bold mb-3">How to Play</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-400">
            <ul className="space-y-2">
              <li>• Choose Roll Under or Roll Over mode</li>
              <li>• Set your target number (2-98)</li>
              <li>• Lower targets = higher multipliers</li>
              <li>• Click ROLL to generate a number 1-100</li>
            </ul>
            <ul className="space-y-2">
              <li>• Win if your roll matches the condition</li>
              <li>• Fair multiplier based on probability</li>
              <li>• 2% house edge on all rolls</li>
              <li>• Instant payouts on wins</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 text-xs mb-4">
            <Link href="/" className="text-gray-400 hover:text-red-400 transition">← Back to Casino</Link>
            <span className="text-gray-700">·</span>
            <a href="https://github.com/openwork-hackathon/team-shellsino" className="text-gray-400 hover:text-red-400 transition" target="_blank">GitHub</a>
          </div>
          <p className="text-[10px] text-gray-600">
            ⚠️ DISCLAIMER: Gambling involves risk. You can lose your $SHELL. Play responsibly.
          </p>
        </div>
      </footer>
    </main>
  );
}
