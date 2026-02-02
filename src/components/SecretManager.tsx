"use client";

import { useState } from "react";

interface Secret {
  secret: string;
  choice: number;
  timestamp: number;
}

// Export secrets for backup
export function exportSecrets(): string {
  const secrets = localStorage.getItem('shellsino_secrets') || '{}';
  return btoa(secrets); // Base64 encode
}

// Import secrets from backup
export function importSecrets(encoded: string): boolean {
  try {
    const decoded = atob(encoded);
    const parsed = JSON.parse(decoded);
    // Validate structure
    if (typeof parsed !== 'object') return false;
    
    // Merge with existing (don't overwrite)
    const existing = JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
    const merged = { ...parsed, ...existing };
    localStorage.setItem('shellsino_secrets', JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
}

// Get pending games that need reveals
export function getPendingReveals(): { gameId: number; secret: string; choice: number; timestamp: number }[] {
  try {
    const secrets = JSON.parse(localStorage.getItem('shellsino_secrets') || '{}');
    return Object.entries(secrets).map(([id, data]: [string, any]) => ({
      gameId: parseInt(id),
      ...data,
    }));
  } catch {
    return [];
  }
}

// Secret backup/restore UI
export function SecretManager({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [importValue, setImportValue] = useState("");
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  if (!isOpen) return null;

  const secrets = getPendingReveals();

  const handleExport = () => {
    const exported = exportSecrets();
    navigator.clipboard.writeText(exported);
    setMessage({ type: 'success', text: 'Secrets copied to clipboard! Save this backup securely.' });
  };

  const handleDownload = () => {
    const exported = exportSecrets();
    const blob = new Blob([exported], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shellsino-secrets-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ type: 'success', text: 'Backup file downloaded!' });
  };

  const handleImport = () => {
    if (!importValue.trim()) {
      setMessage({ type: 'error', text: 'Please paste your backup code' });
      return;
    }
    const success = importSecrets(importValue.trim());
    if (success) {
      setMessage({ type: 'success', text: 'Secrets restored successfully!' });
      setImportValue("");
    } else {
      setMessage({ type: 'error', text: 'Invalid backup code' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      
      <div className="relative bg-[#1a1a1b] rounded-xl border border-gray-700 p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">🔐 Secret Recovery</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
        </div>

        {/* Warning */}
        <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-4 mb-6">
          <p className="text-yellow-400 text-sm">
            <strong>⚠️ Important:</strong> Your game secrets are stored in your browser. 
            If you clear browser data, you&apos;ll lose them and won&apos;t be able to reveal pending games.
            <strong> Back up your secrets regularly!</strong>
          </p>
        </div>

        {/* Current Secrets */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-gray-300">Pending Games</h3>
            <button 
              onClick={() => setShowSecrets(!showSecrets)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {showSecrets ? 'Hide' : 'Show'} Details
            </button>
          </div>
          
          {secrets.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending games</p>
          ) : (
            <div className="space-y-2">
              {secrets.map((s) => (
                <div key={s.gameId} className="bg-[#272729] p-3 rounded text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Game #{s.gameId}</span>
                    <span className="text-gray-500">
                      {new Date(s.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  {showSecrets && (
                    <div className="mt-2 text-xs text-gray-500 font-mono break-all">
                      {s.secret.slice(0, 20)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-300 mb-3">Export Backup</h3>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
            >
              📋 Copy to Clipboard
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium transition"
            >
              💾 Download File
            </button>
          </div>
        </div>

        {/* Import */}
        <div className="mb-6">
          <h3 className="font-bold text-gray-300 mb-3">Restore from Backup</h3>
          <textarea
            value={importValue}
            onChange={(e) => setImportValue(e.target.value)}
            placeholder="Paste your backup code here..."
            className="w-full p-3 bg-[#272729] rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none text-sm font-mono resize-none h-20"
          />
          <button
            onClick={handleImport}
            className="mt-2 w-full px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium transition"
          >
            Restore Secrets
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.type === 'success' 
              ? 'bg-green-900/30 border border-green-500/50 text-green-400'
              : 'bg-red-900/30 border border-red-500/50 text-red-400'
          }`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
