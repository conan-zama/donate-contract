// useDonateContract.tsx
"use client";

import { ethers } from "ethers";
import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FhevmInstance } from "@/fhevm/fhevmTypes";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { DonateContractAddresses } from "@/abi/DonateContractAddresses";
import { DonateContractABI } from "@/abi/DonateContractABI";

type DonateContractInfoType = {
  abi: typeof DonateContractABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

function getDonateContractByChainId(chainId: number | undefined): DonateContractInfoType {
  if (!chainId) return { abi: DonateContractABI.abi };

  const chainIdStr = chainId.toString() as keyof typeof DonateContractAddresses;
  const entry = DonateContractAddresses[chainIdStr];

  if (!entry || !("address" in entry) || entry.address === ethers.ZeroAddress) {
    return { abi: DonateContractABI.abi, chainId };
  }

  return {
    address: entry.address as `0x${string}`,
    chainId: entry.chainId ?? chainId,
    chainName: entry.chainName,
    abi: DonateContractABI.abi,
  };
}

export const useDonateContract = (parameters: {
  instance: FhevmInstance | undefined;
  fhevmDecryptionSignatureStorage: GenericStringStorage;
  eip1193Provider: ethers.Eip1193Provider | undefined;
  chainId: number | undefined;
  ethersSigner: ethers.JsonRpcSigner | undefined;
  ethersReadonlyProvider: ethers.ContractRunner | undefined;
  sameChain: RefObject<(chainId: number | undefined) => boolean>;
  sameSigner: RefObject<(ethersSigner: ethers.JsonRpcSigner | undefined) => boolean>;
}) => {
  const {
    instance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  } = parameters;

  const [campaignActive, setCampaignActive] = useState<boolean>(false);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [hasDonated, setHasDonated] = useState<boolean>(false); 
  const [isDonating, setIsDonating] = useState<boolean>(false);
  const [isEndingCampaign, setIsEndingCampaign] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isRequestingProgress, setIsRequestingProgress] = useState<boolean>(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<{ total: string; target: string; percentage: number } | null>(null);

  const donateContractRef = useRef<DonateContractInfoType | undefined>(undefined);
  const isRefreshingRef = useRef<boolean>(isRefreshing);
  const isDonatingRef = useRef<boolean>(isDonating);
  const isEndingCampaignRef = useRef<boolean>(isEndingCampaign);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const donateContract = useMemo(() => {
    const c = getDonateContractByChainId(chainId);
    donateContractRef.current = c;
    if (!c.address) {
      setMessage(`DonateContract not deployed on chainId=${chainId}`);
    }
    return c;
  }, [chainId]);

  const isDeployed = useMemo(() => {
    return Boolean(donateContract.address) && donateContract.address !== ethers.ZeroAddress;
  }, [donateContract]);

  const canGetState = useMemo(() => {
    return donateContract.address && ethersReadonlyProvider && eip1193Provider && !isRefreshing;
  }, [donateContract.address, ethersReadonlyProvider, eip1193Provider, isRefreshing]);

  const refreshState = useCallback(async () => {
    if (isRefreshingRef.current) return;

    if (
      !donateContractRef.current?.address ||
      !ethersReadonlyProvider ||
      !ethersSigner ||
      !eip1193Provider
    ) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    const contract = new ethers.Contract(
      donateContractRef.current.address,
      donateContractRef.current.abi,
      ethersReadonlyProvider,
    );

    try {
      const userAddress = await ethersSigner.getAddress();

      const [active, owner] = await Promise.all([
        contract.campaignActive(),
        contract.charityOwner(),
      ]);

      setCampaignActive(active);
      setIsOwner(userAddress.toLowerCase() === owner.toLowerCase());
      
    } catch (e) {
      setMessage(`Refresh failed: ${(e as Error).message}`);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [ethersReadonlyProvider, eip1193Provider, ethersSigner]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    if (!donateContract.address || !ethersReadonlyProvider || !ethersSigner) return;

    const contract = new ethers.Contract(
      donateContract.address,
      donateContract.abi,
      ethersReadonlyProvider,
    );

    const userAddress = ethersSigner.address.toLowerCase();

    const handleDonation = () => {
      setHasDonated(true); 
      setMessage("Donation successful!");
      refreshState();
    };

    const handleProgress = (total: bigint, target: bigint, percentage: bigint) => {
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }

      const totalEth = ethers.formatEther(total);
      const targetEth = ethers.formatEther(target);
      const percentageNum = Number(percentage);

      setProgress({
        total: total.toString(),
        target: target.toString(),
        percentage: percentageNum,
      });

      setIsRequestingProgress(false);
      setProgressError(null);
      setMessage(`Progress Updated: ${percentageNum}% | ${totalEth} ETH / ${targetEth} ETH`);
    };

    const handleCampaignChange = () => {
      setMessage("Campaign updated");
      refreshState();
    };

    contract.on(contract.filters.Donation(userAddress), handleDonation);
    contract.on(contract.filters.CampaignProgress(), handleProgress);
    contract.on(contract.filters.CampaignStarted(), handleCampaignChange);
    contract.on(contract.filters.TargetUpdated(), handleCampaignChange);
    contract.on(contract.filters.CampaignEnded(), () => {
      setHasDonated(false); 
      setMessage("Campaign ended");
      refreshState();
    });

    return () => {
      contract.removeAllListeners();
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, [donateContract.address, ethersReadonlyProvider, ethersSigner, refreshState]);

  const canDonate = useMemo(() => {
    return (
      donateContract.address &&
      instance &&
      ethersSigner &&
      !isRefreshing &&
      !isDonating &&
      campaignActive
    );
  }, [donateContract.address, instance, ethersSigner, isRefreshing, isDonating, campaignActive, hasDonated]);

  const canEndCampaign = useMemo(() => {
    return donateContract.address && ethersSigner && !isRefreshing && !isEndingCampaign && isOwner && campaignActive;
  }, [donateContract.address, ethersSigner, isRefreshing, isEndingCampaign, isOwner, campaignActive]);

  const canStartCampaign = useMemo(() => {
    return (
      donateContract.address &&
      instance &&
      ethersSigner &&
      !isRefreshing &&
      !campaignActive
    );
  }, [donateContract.address, instance, ethersSigner, isRefreshing, campaignActive]);

  const canUpdateTarget = useMemo(() => {
    return donateContract.address && instance && ethersSigner && !isRefreshing && isOwner && campaignActive;
  }, [donateContract.address, instance, ethersSigner, isRefreshing, isOwner, campaignActive]);

  const canRequestProgress = useMemo(() => {
    return donateContract.address && ethersSigner && !isRefreshing && campaignActive;
  }, [donateContract.address, ethersSigner, isRefreshing, campaignActive]);

  const donate = useCallback(
    async (clearAmount: number) => {
      if (isDonatingRef.current || !canDonate || clearAmount <= 0) return;

      if (clearAmount > 2 ** 128 - 1) {
        setMessage("Amount exceeds uint128");
        return;
      }

      isDonatingRef.current = true;
      setIsDonating(true);
      setMessage(`Encrypting ${clearAmount} wei...`);

      const contract = new ethers.Contract(donateContract.address!, donateContract.abi, ethersSigner!);
      const signerAddr = await ethersSigner!.getAddress();

      try {
        const input = instance!.createEncryptedInput(donateContract.address!, signerAddr);
        input.add128(clearAmount);
        const encrypted = await input.encrypt();

        setMessage("Sending transaction...");
        const tx = await contract.donate(encrypted.handles[0], encrypted.inputProof, { value: clearAmount });
        setMessage(`Waiting for tx: ${tx.hash}`);
        await tx.wait();

        setMessage("Donation successful!");
        setHasDonated(true); 
        await refreshState();
      } catch (e) {
        setMessage(`Donation failed: ${(e as Error).message}`);
      } finally {
        isDonatingRef.current = false;
        setIsDonating(false);
      }
    },
    [donateContract, instance, ethersSigner, canDonate, refreshState],
  );

  const startCampaign = useCallback(
    async (clearTarget: number) => {
      if (!canStartCampaign || clearTarget <= 0 || clearTarget > 2 ** 128 - 1) {
        setMessage("Invalid target");
        return;
      }

      setMessage("Starting campaign...");
      const contract = new ethers.Contract(donateContract.address!, donateContract.abi, ethersSigner!);
      const signerAddr = await ethersSigner!.getAddress();

      try {
        const input = instance!.createEncryptedInput(donateContract.address!, signerAddr);
        input.add128(clearTarget);
        const encrypted = await input.encrypt();

        const tx = await contract.startCampaign(encrypted.handles[0], encrypted.inputProof);
        await tx.wait();
        setMessage("Campaign started!");
        await refreshState();
      } catch (e) {
        setMessage(`Failed: ${(e as Error).message}`);
      }
    },
    [canStartCampaign, donateContract, instance, ethersSigner, refreshState],
  );

  const updateTarget = useCallback(
    async (clearTarget: number) => {
      if (!canUpdateTarget || clearTarget <= 0 || clearTarget > 2 ** 128 - 1) {
        setMessage("Invalid target");
        return;
      }

      setMessage("Updating target...");
      const contract = new ethers.Contract(donateContract.address!, donateContract.abi, ethersSigner!);
      const signerAddr = await ethersSigner!.getAddress();

      try {
        const input = instance!.createEncryptedInput(donateContract.address!, signerAddr);
        input.add128(clearTarget);
        const encrypted = await input.encrypt();

        const tx = await contract.updateTarget(encrypted.handles[0], encrypted.inputProof);
        await tx.wait();
        setMessage("Target updated!");
        await refreshState();
      } catch (e) {
        setMessage(`Failed: ${(e as Error).message}`);
      }
    },
    [canUpdateTarget, donateContract, instance, ethersSigner, refreshState],
  );

  const endCampaign = useCallback(async () => {
    if (!canEndCampaign) return;

    isEndingCampaignRef.current = true;
    setIsEndingCampaign(true);
    setMessage("Ending campaign...");

    const contract = new ethers.Contract(donateContract.address!, donateContract.abi, ethersSigner!);

    try {
      const tx = await contract.endCampaign();
      setMessage(`Waiting for tx: ${tx.hash}`);
      await tx.wait();
      setMessage("Campaign ended, withdrawing...");
      setHasDonated(false);
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`);
    } finally {
      isEndingCampaignRef.current = false;
      setIsEndingCampaign(false);
      await refreshState();
    }
  }, [canEndCampaign, donateContract, ethersSigner, refreshState]);

  const requestProgress = useCallback(async () => {
    if (!canRequestProgress || isRequestingProgress) return;

    setIsRequestingProgress(true);
    setProgressError(null);
    setMessage("Requesting progress decryption from FHE network...");

    const contract = new ethers.Contract(donateContract.address!, donateContract.abi, ethersSigner!);

    try {
      const tx = await contract.requestProgress();
      setMessage(`Decryption request sent. Waiting up to...`);

      progressTimeoutRef.current = setTimeout(() => {
        setIsRequestingProgress(false);
        setProgressError("Timeout: FHE decryption took too long");
        setMessage("Error: Decryption timeout. Try again later.");
      }, 60_000);

      await tx.wait();
    } catch (e) {
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
      setIsRequestingProgress(false);
      setProgressError("Transaction failed");
      setMessage(`Failed: ${(e as Error).message}`);
    }
  }, [canRequestProgress, donateContract, ethersSigner, isRequestingProgress]);

  return {
    contractAddress: donateContract.address,
    isDeployed,
    canGetState,
    canDonate,
    canEndCampaign,
    canStartCampaign,
    canUpdateTarget,
    canRequestProgress,
    donate,
    endCampaign,
    startCampaign,
    updateTarget,
    requestProgress,
    refreshState,
    message,
    hasDonated,
    campaignActive,
    isRefreshing,
    isDonating,
    isEndingCampaign,
    isOwner,
    progress,
    isRequestingProgress,
    progressError,
  };
};