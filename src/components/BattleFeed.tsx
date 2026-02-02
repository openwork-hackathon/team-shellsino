"use client";

import { useState, useEffect } from "react";

interface FeedEvent {
  id: string;
  type: string;
  game: string;
  description: string;
  players: Array<{ address: string; name: string }>;
  amount: string;
  blockNumber: string;
  timestamp: number;
  txHash?: string;
}

export default function BattleFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetchFeed();
    // Poll every 30 seconds for new events
    const interval = setInterval(fetchFeed, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  async function fetchFeed() {
    try {
      const res = await fetch(`/api/feed?limit=20&game=${filter}`);
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error("Failed to fetch feed:", error);
    } finally {
      setLoading(false);
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "coinflip_created": return "🪙";
      case "coinflip_challenge": return "⚔️";
      case "coinflip_resolved": return "🏆";
      case "coinflip_joined": return "🤝";
      case "roulette_joined": return "💀";
      case "roulette_completed": return "☠️";
      case "blackjack_win": return "🃏";
      case "blackjack_loss": return "😢";
      default: return "🎰";
    }
  };

  const getEventColor = (type: string) => {
    if (type.includes("resolved") || type.includes("win")) return "text-green-400";
    if (type.includes("challenge")) return "text-yellow-400";
    if (type.includes("eliminated") || type.includes("loss") || type.includes("completed")) return "text-red-400";
    return "text-gray-300";
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="animate-pulse">🔴</span> Live Battle Feed
        </h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
        >
          <option value="all">All Games</option>
          <option value="coinflip">Coinflip</option>
          <option value="roulette">Roulette</option>
          <option value="blackjack">Blackjack</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-2 p-2">
              <div className="w-8 h-8 bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-1" />
                <div className="h-3 bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-2xl mb-2">🦗</p>
          <p>No recent action...</p>
          <p className="text-sm">Be the first to play!</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.map((event, i) => (
            <div
              key={event.id || i}
              className="flex gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors group"
            >
              <div className="text-2xl flex-shrink-0">
                {getEventIcon(event.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${getEventColor(event.type)}`}>
                  {event.description}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className="capitalize">{event.game}</span>
                  <span>•</span>
                  <span>Block #{event.blockNumber}</span>
                  {event.txHash && (
                    <>
                      <span>•</span>
                      <a
                        href={`https://basescan.org/tx/${event.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View tx →
                      </a>
                    </>
                  )}
                </div>
              </div>
              {parseFloat(event.amount) > 0 && (
                <div className="text-right flex-shrink-0">
                  <span className="text-yellow-400 font-mono text-sm">
                    {parseFloat(event.amount).toLocaleString()}
                  </span>
                  <span className="text-gray-500 text-xs ml-1">SHELL</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
        <span>Updates every 30s</span>
        <button
          onClick={fetchFeed}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
