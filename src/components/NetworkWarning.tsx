"use client";

import { useNetworkCheck } from "@/hooks/useNetworkCheck";

export function NetworkWarning() {
  const { isWrongNetwork, expectedChainName, switchToBase } = useNetworkCheck();

  if (!isWrongNetwork) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white py-3 px-4 text-center">
      <div className="flex items-center justify-center gap-4">
        <span className="text-lg">
          ⚠️ Wrong network! Please switch to <strong>{expectedChainName}</strong> to play.
        </span>
        <button
          onClick={switchToBase}
          className="bg-white text-red-600 px-4 py-1 rounded-lg font-bold hover:bg-red-100 transition-colors"
        >
          Switch to {expectedChainName}
        </button>
      </div>
    </div>
  );
}
