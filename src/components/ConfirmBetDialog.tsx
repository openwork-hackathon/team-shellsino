"use client";

import { useState } from "react";

interface ConfirmBetDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  betAmount: string;
  gameName: string;
  odds?: string;
}

export function ConfirmBetDialog({
  isOpen,
  onConfirm,
  onCancel,
  betAmount,
  gameName,
  odds,
}: ConfirmBetDialogProps) {
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (confirmed) {
      onConfirm();
      setConfirmed(false);
    }
  };

  const handleCancel = () => {
    setConfirmed(false);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleCancel}
      />
      
      {/* Dialog */}
      <div className="relative bg-[#1a1a1b] rounded-xl border border-yellow-500/50 p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-yellow-400 mb-2">
            High-Value Bet Confirmation
          </h2>
          <p className="text-gray-400 text-sm">
            You&apos;re about to place a significant bet. Please confirm.
          </p>
        </div>

        <div className="bg-[#272729] rounded-lg p-4 mb-6 space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-400">Game</span>
            <span className="font-bold">{gameName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bet Amount</span>
            <span className="font-bold text-yellow-400">{betAmount} $SHELL</span>
          </div>
          {odds && (
            <div className="flex justify-between">
              <span className="text-gray-400">Odds</span>
              <span className="font-bold">{odds}</span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-600 bg-[#272729] text-yellow-500 focus:ring-yellow-500"
            />
            <span className="text-sm text-gray-400">
              I understand this is a high-value bet and I accept the risk of losing these tokens.
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed}
            className={`flex-1 px-4 py-3 rounded-lg font-medium transition ${
              confirmed
                ? "bg-yellow-600 hover:bg-yellow-500 text-black"
                : "bg-gray-600 text-gray-400 cursor-not-allowed"
            }`}
          >
            Confirm Bet
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for easy integration
export function useConfirmBet(threshold: number = 100) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingBet, setPendingBet] = useState<{
    amount: string;
    gameName: string;
    odds?: string;
    onConfirm: () => void;
  } | null>(null);

  const requestBet = (
    amount: string,
    gameName: string,
    onConfirm: () => void,
    odds?: string
  ) => {
    const numAmount = parseFloat(amount);
    if (numAmount >= threshold) {
      setPendingBet({ amount, gameName, odds, onConfirm });
      setShowDialog(true);
    } else {
      onConfirm();
    }
  };

  const handleConfirm = () => {
    pendingBet?.onConfirm();
    setShowDialog(false);
    setPendingBet(null);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingBet(null);
  };

  return {
    showDialog,
    pendingBet,
    requestBet,
    handleConfirm,
    handleCancel,
    ConfirmDialog: () =>
      pendingBet ? (
        <ConfirmBetDialog
          isOpen={showDialog}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          betAmount={pendingBet.amount}
          gameName={pendingBet.gameName}
          odds={pendingBet.odds}
        />
      ) : null,
  };
}
