"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { formatEther, parseEther, keccak256, encodePacked, toHex } from "viem";
import { useToast } from "@/components/ui/Toast";
import type { GameProps } from "./index";

// Contract addresses
const SHELL_TOKEN = "0xcfAD33C1188635B22BA97a7caBCF5bEd02fAe466";
const COINFLIP_CONTRACT = "0x25B19C2634A2F8338D5a1821F96AF339A5066fbE";

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

const COINFLIP_ABI = [
  {
    name: "createGame",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "betAmount", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export default function CoinflipGame({ address, onBalanceChange }: GameProps) {
  const [betAmount, setBetAmount] = useState("");
  const [choice, setChoice] = useState<0 | 1>(0); // 0 = heads, 1 = tails
  const [secret, setSecret] = useState("");
  const { addToast } = useToast();

  const { writeContract, data: hash } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash,
  });

  const { data: balance } = useReadContract({
    address: SHELL_TOKEN,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [address],
  });

  const handleCreateGame = async () => {
    if (!betAmount || !secret) {
      addToast({ type: "error", title: "Error", message: "Please enter bet amount and secret" });
      return;
    }

    const commitment = keccak256(
      encodePacked(["uint8", "bytes32"], [choice, toHex(secret, { size: 32 })])
    );

    try {
      writeContract({
        address: COINFLIP_CONTRACT,
        abi: COINFLIP_ABI,
        functionName: "createGame",
        args: [parseEther(betAmount), commitment],
      });
    } catch (error) {
      addToast({ type: "error", title: "Error", message: "Failed to create game" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-center mb-8 text-casino-gold">
        🪙 Coinflip
      </h2>

      <div className="bg-casino-surface rounded-lg p-6 space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-2">
            Balance: {balance ? formatEther(balance) : "0"} $SHELL
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Bet Amount</label>
          <input
            type="number"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            placeholder="Enter bet amount"
            className="w-full px-4 py-2 bg-casino-dark border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-casino-gold"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Your Choice</label>
          <div className="flex gap-4">
            <button
              onClick={() => setChoice(0)}
              className={`flex-1 py-3 rounded-lg font-bold transition ${
                choice === 0
                  ? "bg-casino-gold text-black"
                  : "bg-casino-dark border border-gray-700"
              }`}
            >
              Heads
            </button>
            <button
              onClick={() => setChoice(1)}
              className={`flex-1 py-3 rounded-lg font-bold transition ${
                choice === 1
                  ? "bg-casino-gold text-black"
                  : "bg-casino-dark border border-gray-700"
              }`}
            >
              Tails
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Secret</label>
          <input
            type="text"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter a secret"
            className="w-full px-4 py-2 bg-casino-dark border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-casino-gold"
          />
        </div>

        <button
          onClick={handleCreateGame}
          disabled={isConfirming || !betAmount || !secret}
          className="w-full py-3 bg-casino-gold text-black font-bold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isConfirming ? "Creating..." : "Create Game"}
        </button>
      </div>
    </div>
  );
}
