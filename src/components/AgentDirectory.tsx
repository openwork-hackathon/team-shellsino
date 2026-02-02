"use client";

import { useState, useEffect } from "react";

interface Agent {
  address: string;
  name: string;
  verified: boolean;
  stats: {
    totalGames: number;
    totalWins: number;
    totalLosses: number;
    totalWagered: string;
    winRate: string;
  };
  coinflip: {
    wins: number;
    losses: number;
    wagered: string;
  };
  roulette: {
    survived: number;
    eliminated: number;
    wagered: string;
  };
}

interface AgentDirectoryProps {
  onChallengeAgent?: (address: string) => void;
  currentAddress?: string;
}

export default function AgentDirectory({ onChallengeAgent, currentAddress }: AgentDirectoryProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("wins");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
  }, [sortBy, verifiedOnly]);

  async function fetchAgents() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort: sortBy,
        limit: "30",
        ...(verifiedOnly && { verified: "true" }),
      });
      const res = await fetch(`/api/agents?${params}`);
      const data = await res.json();
      if (data.agents) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    } finally {
      setLoading(false);
    }
  }

  const getBadge = (agent: Agent) => {
    const badges = [];
    if (agent.verified) badges.push("✓");
    if (agent.stats.totalGames >= 50) badges.push("🎰");
    if (parseFloat(agent.stats.winRate) >= 60 && agent.stats.totalGames >= 5) badges.push("🔥");
    if (parseFloat(agent.stats.totalWagered) >= 10000) badges.push("🐋");
    return badges.join(" ");
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-white">🤖 Agent Directory</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="rounded border-gray-600 bg-gray-700"
            />
            Verified only
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
          >
            <option value="wins">Top Winners</option>
            <option value="games">Most Active</option>
            <option value="wagered">Biggest Bettors</option>
            <option value="winRate">Best Win Rate</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3 p-3">
              <div className="w-10 h-10 bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-700 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-2xl mb-2">🤷</p>
          <p>No agents found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {agents.map((agent, i) => (
            <div
              key={agent.address}
              onClick={() => setSelectedAgent(selectedAgent?.address === agent.address ? null : agent)}
              className={`p-3 rounded-lg cursor-pointer transition-all ${
                selectedAgent?.address === agent.address
                  ? "bg-blue-900/30 border border-blue-500/50"
                  : "hover:bg-gray-700/50 border border-transparent"
              } ${agent.address.toLowerCase() === currentAddress?.toLowerCase() ? "ring-1 ring-yellow-500/50" : ""}`}
            >
              <div className="flex items-center gap-3">
                {/* Rank */}
                <div className="text-xl font-bold text-gray-500 w-8 text-center">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </div>

                {/* Agent Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white truncate">
                      {agent.name}
                    </span>
                    {agent.verified && (
                      <span className="text-blue-400 text-sm" title="Verified Agent">✓</span>
                    )}
                    <span className="text-sm">{getBadge(agent)}</span>
                    {agent.address.toLowerCase() === currentAddress?.toLowerCase() && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">YOU</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {formatAddress(agent.address)}
                  </div>
                </div>

                {/* Stats */}
                <div className="text-right">
                  <div className="text-green-400 font-semibold">
                    {agent.stats.totalWins}W
                    <span className="text-gray-500 mx-1">/</span>
                    <span className="text-red-400">{agent.stats.totalLosses}L</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {agent.stats.winRate}% win rate
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedAgent?.address === agent.address && (
                <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="text-gray-400 mb-1">🪙 Coinflip</h4>
                    <p className="text-white">
                      {agent.coinflip.wins}W / {agent.coinflip.losses}L
                    </p>
                    <p className="text-xs text-gray-500">
                      {parseFloat(agent.coinflip.wagered).toLocaleString()} SHELL wagered
                    </p>
                  </div>
                  <div>
                    <h4 className="text-gray-400 mb-1">💀 Roulette</h4>
                    <p className="text-white">
                      {agent.roulette.survived} survived / {agent.roulette.eliminated} eliminated
                    </p>
                    <p className="text-xs text-gray-500">
                      {parseFloat(agent.roulette.wagered).toLocaleString()} SHELL wagered
                    </p>
                  </div>
                  <div className="col-span-2 flex gap-2 mt-2">
                    <a
                      href={`https://basescan.org/address/${agent.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center py-1.5 px-3 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors"
                    >
                      View on BaseScan
                    </a>
                    {onChallengeAgent && agent.address.toLowerCase() !== currentAddress?.toLowerCase() && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onChallengeAgent(agent.address);
                        }}
                        className="flex-1 py-1.5 px-3 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded text-xs transition-colors"
                      >
                        ⚔️ Challenge
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500 flex justify-between">
        <span>{agents.length} agents</span>
        <a
          href="/api/agents"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        >
          API ↗
        </a>
      </div>
    </div>
  );
}
