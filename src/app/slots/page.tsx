"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatEther, parseEther } from "viem";
import Link from "next/link";

// Contract addresses
const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
const SLOTS_CONTRACT = "0x0000000000000000000000000000000000000000"; // Placeholder - will be updated after deployment

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

// Slots Contract ABI
const SLOTS_ABI = [
  {
    name: "spin",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "betAmount", type: "uint256" }],
    outputs: [{ name: "spinId", type: "uint256" }],
  },
  {
    name: "getSpin",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "spinId", type: "uint256" }],
    outputs: [
      { name: "player", type: "address" },
      { name: "bet", type: "uint256" },
      { name: "reels", type: "uint256[3]" },
      { name: "payout", type: "uint256" },
      { name: "timestamp", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
  },
  {
    name: "getPlayerSpins",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
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
    name: "symbolMultipliers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalWagered",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalPaidOut",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "spinCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "SpinResult",
    type: "event",
    inputs: [
      { name: "spinId", type: "uint256", indexed: true },
      { name: "reels", type: "uint256[3]" },
      { name: "payout", type: "uint256" },
      { name: "result", type: "string" },
    ],
  },
] as const;

// Slot symbols - index 0-6
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '7️⃣', '🎰'];
const SYMBOL_NAMES = ['Cherry', 'Lemon', 'Orange', 'Plum', 'Bell', 'Seven', 'BAR'];
const SYMBOL_COLORS = ['text-red-400', 'text-yellow-400', 'text-orange-400', 'text-purple-400', 'text-yellow-500', 'text-red-500', 'text-blue-400'];

// Payout multipliers (in display format)
const PAYOUT_DISPLAY: Record<number, { name: string; multiplier: number }> = {
  0: { name: 'Triple Cherry', multiplier: 2 },
  1: { name: 'Triple Lemon', multiplier: 3 },
  2: { name: 'Triple Orange', multiplier: 5 },
  3: { name: 'Triple Plum', multiplier: 8 },
  4: { name: 'Triple Bell', multiplier: 15 },
  5: { name: 'Triple Seven', multiplier: 50 },
  6: { name: 'JACKPOT - Triple BAR', multiplier: 100 },
};

export default function SlotsPage() {
  const { address, isConnected } = useAccount();
  const [betAmount, setBetAmount] = useState("10");
  const [reels, setReels] = useState([0, 1, 2]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<{ spinId: number; reels: number[]; payout: bigint; win: boolean; resultText: string } | null>(null);
  const [spinHistory, setSpinHistory] = useState<Array<{ spinId: number; reels: number[]; payout: string; win: boolean }>>([]);

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
    args: address ? [address, SLOTS_CONTRACT] : undefined,
  });

  // Get min/max bets
  const { data: minBet } = useReadContract({
    address: SLOTS_CONTRACT,
    abi: SLOTS_ABI,
    functionName: "minBet",
  });

  const { data: maxBet } = useReadContract({
    address: SLOTS_CONTRACT,
    abi: SLOTS_ABI,
    functionName: "maxBet",
  });

  // Get player spins
  const { data: playerSpins, refetch: refetchPlayerSpins } = useReadContract({
    address: SLOTS_CONTRACT,
    abi: SLOTS_ABI,
    functionName: "getPlayerSpins",
    args: address ? [address] : undefined,
  });

  // Contract writes
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  const { writeContract: spin, data: spinHash, isPending: isSpinningTx } = useWriteContract();
  const { isSuccess: spinSuccess, data: spinReceipt } = useWaitForTransactionReceipt({ hash: spinHash });

  const needsApproval = allowance !== undefined && parseEther(betAmount || "0") > allowance;

  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess]);

  useEffect(() => {
    if (spinSuccess) {
      refetchBalance();
      refetchPlayerSpins();
    }
  }, [spinSuccess]);

  const handleApprove = () => {
    approve({
      address: SHELL_TOKEN,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [SLOTS_CONTRACT, parseEther("1000000")],
    });
  };

  // Demo spin function (local randomization for demo mode)
  const handleDemoSpin = async () => {
    setIsSpinning(true);
    setLastResult(null);

    const spinDuration = 2500;
    const spinInterval = 80;
    let elapsed = 0;

    const interval = setInterval(() => {
      setReels([
        Math.floor(Math.random() * 7),
        Math.floor(Math.random() * 7),
        Math.floor(Math.random() * 7),
      ]);
      elapsed += spinInterval;

      if (elapsed >= spinDuration) {
        clearInterval(interval);
        finalizeSpin();
      }
    }, spinInterval);
  };

  const finalizeSpin = () => {
    // Weighted random for demo (house edge)
    const weights = [200, 200, 150, 150, 150, 100, 50];
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const getWeightedSymbol = () => {
      const roll = Math.random() * totalWeight;
      let cumulative = 0;
      for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (roll < cumulative) return i;
      }
      return 0;
    };

    const finalReels = [getWeightedSymbol(), getWeightedSymbol(), getWeightedSymbol()];
    setReels(finalReels);

    // Calculate payout
    let payout = BigInt(0);
    let resultText = "No match - Try again!";
    let win = false;

    const betWei = parseEther(betAmount);
    const netBet = (betWei * BigInt(99)) / BigInt(100); // 1% fee

    if (finalReels[0] === finalReels[1] && finalReels[1] === finalReels[2]) {
      // 3 of a kind
      const symbol = finalReels[0];
      const multipliers = [20000, 30000, 50000, 80000, 150000, 500000, 1000000];
      const multiplier = multipliers[symbol];
      payout = (netBet * BigInt(multiplier)) / BigInt(10000);
      win = true;
      resultText = PAYOUT_DISPLAY[symbol].name + "!";
    } else if (finalReels[0] === finalReels[1] || finalReels[1] === finalReels[2] || finalReels[0] === finalReels[2]) {
      // 2 match
      payout = netBet * BigInt(2);
      win = true;
      resultText = "Two match - Small Win!";
    } else if (finalReels[0] === 0 || finalReels[1] === 0 || finalReels[2] === 0) {
      // Any cherry
      payout = netBet / BigInt(2);
      win = true;
      resultText = "Cherry consolation!";
    }

    const spinId = Date.now();
    setLastResult({
      spinId,
      reels: finalReels,
      payout,
      win,
      resultText,
    });

    setSpinHistory(prev => [{
      spinId,
      reels: finalReels,
      payout: formatEther(payout),
      win,
    }, ...prev.slice(0, 9)]);

    setIsSpinning(false);
  };

  const handleSpin = () => {
    if (SLOTS_CONTRACT === "0x0000000000000000000000000000000000000000") {
      handleDemoSpin();
      return;
    }

    spin({
      address: SLOTS_CONTRACT,
      abi: SLOTS_ABI,
      functionName: "spin",
      args: [parseEther(betAmount)],
    });
  };

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
                <span className="text-3xl">🎰</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
                  shellsino
                </h1>
                <p className="text-[10px] text-gray-500">slots</p>
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
          <h2 className="text-3xl font-bold mb-2">🎰 Classic Slots</h2>
          <p className="text-gray-400">Match 3 symbols to win big!</p>
          {SLOTS_CONTRACT === "0x0000000000000000000000000000000000000000" && (
            <span className="inline-block mt-2 bg-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1 rounded-full border border-yellow-500/50">
              DEMO MODE
            </span>
          )}
        </div>

        {/* Slot Machine */}
        <div className="bg-gradient-to-b from-[#1a1a1b] to-[#0f0f10] rounded-2xl p-8 mb-8 border border-gray-800">
          {/* Reels Container */}
          <div className="relative bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-6 mb-6 border-4 border-yellow-600/50 shadow-2xl">
            {/* Win Line */}
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-red-500/50 z-10" />

            {/* Reels */}
            <div className="flex justify-center gap-4">
              {reels.map((symbolIndex, i) => (
                <div
                  key={i}
                  className={`
                    w-24 h-32 sm:w-32 sm:h-40 
                    bg-gradient-to-b from-white to-gray-200 
                    rounded-lg flex items-center justify-center 
                    text-5xl sm:text-6xl shadow-inner
                    border-2 border-gray-400
                    ${isSpinning ? 'animate-pulse' : ''}
                  `}
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <span className={SYMBOL_COLORS[symbolIndex]}>
                    {SLOT_SYMBOLS[symbolIndex]}
                  </span>
                </div>
              ))}
            </div>

            {/* Machine Decorations */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-600 text-yellow-100 text-xs font-bold px-4 py-1 rounded-full">
              WIN LINE
            </div>
          </div>

          {/* Result Display */}
          {lastResult && !isSpinning && (
            <div className={`
              text-center p-4 rounded-xl mb-6
              ${lastResult.win 
                ? 'bg-gradient-to-r from-green-900/50 to-emerald-900/50 border border-green-500/50 animate-win' 
                : 'bg-gradient-to-r from-red-900/30 to-red-800/30 border border-red-500/30'
              }
            `}>
              {lastResult.win ? (
                <div>
                  <div className="text-4xl mb-2">🎉</div>
                  <div className="text-2xl font-bold text-green-400 animate-jackpot">
                    {lastResult.resultText}
                  </div>
                  <div className="text-xl text-yellow-400 mt-2">
                    +{parseFloat(formatEther(lastResult.payout)).toFixed(2)} $SHELL
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-3xl mb-2">😔</div>
                  <div className="text-lg text-red-400">{lastResult.resultText}</div>
                </div>
              )}
            </div>
          )}

          {/* Bet Selection */}
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-3 text-center">Bet Amount ($SHELL)</label>
            <div className="flex flex-wrap justify-center gap-2">
              {['1', '5', '10', '25', '50', '100'].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setBetAmount(amt)}
                  disabled={isSpinning}
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
            <p className="text-xs text-gray-500 text-center mt-2">
              Min: {minBetDisplay} | Max: {maxBetDisplay} $SHELL
            </p>
          </div>

          {/* Spin Button */}
          {needsApproval && SLOTS_CONTRACT !== "0x0000000000000000000000000000000000000000" ? (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-700 rounded-xl font-bold text-lg transition"
            >
              {isApproving ? "Approving..." : "Approve $SHELL"}
            </button>
          ) : (
            <button
              onClick={handleSpin}
              disabled={isSpinning || isSpinningTx}
              className="w-full py-5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:bg-gray-700 rounded-xl font-bold text-xl transition transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-600/20"
            >
              {isSpinning || isSpinningTx ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">🎰</span>
                  SPINNING...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  🎰 SPIN ({betAmount} $SHELL)
                </span>
              )}
            </button>
          )}
        </div>

        {/* Payout Table */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-[#1a1a1b] rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold mb-4 text-center">💰 Payout Table</h3>
            <div className="space-y-2">
              {Object.entries(PAYOUT_DISPLAY).reverse().map(([symbol, data]) => (
                <div key={symbol} className="flex justify-between items-center bg-[#272729] p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{SLOT_SYMBOLS[parseInt(symbol)]}{SLOT_SYMBOLS[parseInt(symbol)]}{SLOT_SYMBOLS[parseInt(symbol)]}</span>
                    <span className="text-sm text-gray-400">{data.name}</span>
                  </div>
                  <span className="text-yellow-400 font-bold">{data.multiplier}x</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-[#272729] p-3 rounded-lg">
                <span className="text-sm text-gray-400">Any two matching</span>
                <span className="text-green-400 font-bold">2x</span>
              </div>
              <div className="flex justify-between items-center bg-[#272729] p-3 rounded-lg">
                <span className="text-sm text-gray-400">Any cherry 🍒</span>
                <span className="text-blue-400 font-bold">0.5x</span>
              </div>
            </div>
          </div>

          {/* Recent Spins */}
          <div className="bg-[#1a1a1b] rounded-xl p-6 border border-gray-800">
            <h3 className="text-lg font-bold mb-4 text-center">📜 Recent Spins</h3>
            {spinHistory.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No spins yet. Good luck! 🍀</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {spinHistory.map((spin, i) => (
                  <div key={spin.spinId} className={`
                    flex justify-between items-center p-3 rounded-lg
                    ${spin.win ? 'bg-green-900/20 border border-green-500/20' : 'bg-[#272729]'}
                  `}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">#{spinHistory.length - i}</span>
                      <span className="text-lg">
                        {spin.reels.map(r => SLOT_SYMBOLS[r]).join('')}
                      </span>
                    </div>
                    {spin.win ? (
                      <span className="text-green-400 font-bold text-sm">+{parseFloat(spin.payout).toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-500 text-sm">-</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Game Info */}
        <div className="bg-[#1a1a1b] rounded-xl p-6 border border-gray-800">
          <h3 className="font-bold mb-3">How to Play</h3>
          <ul className="text-sm text-gray-400 space-y-2">
            <li>• Choose your bet amount and click SPIN</li>
            <li>• Match 3 symbols for big payouts (up to 100x for BAR!)</li>
            <li>• Any 2 matching symbols = 2x win</li>
            <li>• Any cherry = 0.5x consolation prize</li>
            <li>• 1% protocol fee on all spins</li>
            <li>• RTP: ~96.5% (varies by bet size)</li>
          </ul>
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
