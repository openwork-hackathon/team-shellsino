import { useEffect, useState } from "react";
import { useChainId, useSwitchChain } from "wagmi";
import { CHAIN_ID, CHAIN_NAME } from "@/config/contracts";

export function useNetworkCheck() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);

  useEffect(() => {
    setIsWrongNetwork(chainId !== CHAIN_ID);
  }, [chainId]);

  const switchToBase = async () => {
    try {
      await switchChain({ chainId: CHAIN_ID });
    } catch (error) {
      console.error("Failed to switch network:", error);
    }
  };

  return {
    isWrongNetwork,
    currentChainId: chainId,
    expectedChainId: CHAIN_ID,
    expectedChainName: CHAIN_NAME,
    switchToBase,
  };
}
