// DonateContractDemo.tsx
"use client";

import { useFhevm } from "../fhevm/useFhevm";
import { useInMemoryStorage } from "../hooks/useInMemoryStorage";
import { useMetaMaskEthersSigner } from "../hooks/metamask/useMetaMaskEthersSigner";
import { useDonateContract } from "@/hooks/useDonateContract";
import { errorNotDeployed } from "./ErrorNotDeployed";
import { useState } from "react";
import { ethers } from "ethers";

export const DonateContractDemo = () => {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const {
    provider,
    chainId,
    isConnected,
    connect,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
    initialMockChains,
  } = useMetaMaskEthersSigner();

  const {
    instance: fhevmInstance,
  } = useFhevm({
    provider,
    chainId,
    initialMockChains,
    enabled: true,
  });

  const donateContract = useDonateContract({
    instance: fhevmInstance,
    fhevmDecryptionSignatureStorage,
    eip1193Provider: provider,
    chainId,
    ethersSigner,
    ethersReadonlyProvider,
    sameChain,
    sameSigner,
  });

  const [donationAmount, setDonationAmount] = useState<number>(1_000_000_000_000_000); // 0.001 ETH
  const [targetAmount, setTargetAmount] = useState<number>(10_000_000_000_000_000); // 0.01 ETH

  const buttonClass =
    "h-12 w-full rounded-xl bg-black px-4 font-semibold text-white shadow-sm " +
    "transition-colors duration-200 hover:bg-blue-700 active:bg-blue-800 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
    "disabled:opacity-50 disabled:pointer-events-none";

  const smallButtonClass = buttonClass + " text-sm px-3";

  if (!isConnected) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <button className={buttonClass} onClick={connect}>
          <span className="text-2xl">Connect to MetaMask</span>
        </button>
      </div>
    );
  }

  if (donateContract.isDeployed === false) {
    return errorNotDeployed(chainId);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">

      {/* 1. HEADER */}
      <div className="bg-black text-white rounded-2xl p-8 text-center">
        <h1 className="text-4xl font-bold">FHEVM Donate Campaign</h1>
      </div>

      {/* 2. PROGRESS BAR */}
      <div className="w-full">
        {donateContract.progress ? (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-50 to-cyan-50 border-2 border-emerald-600 shadow-lg">
            <h2 className="text-2xl font-bold text-emerald-800 text-center mb-4">Campaign Progress</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-lg">
                <span className="font-mono font-semibold text-gray-700">Total Donated:</span>
                <span className="font-mono font-bold text-emerald-700">
                  {ethers.formatEther(donateContract.progress.total)} ETH
                </span>
              </div>
              <div className="flex justify-between text-lg">
                <span className="font-mono font-semibold text-gray-700">Target:</span>
                <span className="font-mono font-bold text-cyan-700">
                  {ethers.formatEther(donateContract.progress.target)} ETH
                </span>
              </div>
              <div className="mt-6 bg-gray-300 rounded-full h-16 overflow-hidden shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 flex items-center justify-center text-white font-bold text-2xl transition-all duration-700"
                  style={{ width: `${donateContract.progress.percentage}%` }}
                >
                  {donateContract.progress.percentage}%
                </div>
              </div>
              <p className="text-center text-sm text-green-600 mt-2">Updated just now</p>
            </div>
          </div>
        ) : donateContract.isRequestingProgress ? (
          <div className="p-6 rounded-2xl bg-orange-50 border-2 border-orange-500 text-center">
            <p className="text-orange-800 font-semibold flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Decrypting progress...
            </p>
            {donateContract.progressError && (
              <p className="text-red-600 text-sm mt-2">{donateContract.progressError}</p>
            )}
          </div>
        ) : donateContract.campaignActive ? (
          <div className="p-6 rounded-2xl bg-yellow-50 border-2 border-yellow-600 text-center">
            <p className="text-yellow-800 font-semibold">
              No progress data yet. Click 'Request Progress' to decrypt.
            </p>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-gray-50 border-2 border-gray-400 text-center">
            <p className="text-gray-700 font-semibold">Campaign is not active.</p>
          </div>
        )}
      </div>

      {/* 3. DONATE */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border-2 border-blue-600 shadow-md">
        <h3 className="text-xl font-bold text-blue-900 mb-3 text-center">Your Donation</h3>
        <div className="space-y-3">
          <input
            type="number"
            placeholder="Donate (wei)"
            value={donationAmount}
            onChange={(e) => setDonationAmount(Number(e.target.value))}
            className="w-full h-12 px-4 border-2 border-black rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!donateContract.canDonate}
            min="1"
          />
          <button
            className={buttonClass + " bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"}
            disabled={!donateContract.canDonate || donationAmount <= 0}
            onClick={() => donateContract.donate(donationAmount)}
          >
            {donateContract.isDonating ? "Donating..." : "Donate Now"}
          </button>
          <div className="text-center">
            {donateContract.hasDonated ? (
              <p className="text-green-600 font-bold text-lg">You donated!</p>
            ) : donateContract.campaignActive ? (
              <p className="text-orange-600 font-medium">Not donated yet</p>
            ) : (
              <p className="text-gray-500 text-sm">Campaign not active</p>
            )}
          </div>
        </div>
      </div>

      {/* 4. START / UPDATE TARGET */}
      <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-400">
        <h3 className="text-xl font-bold text-gray-800 mb-3 text-center">Campaign Settings</h3>
        <div className="space-y-3">
          <input
            type="number"
            placeholder="Target amount (wei)"
            value={targetAmount}
            onChange={(e) => setTargetAmount(Number(e.target.value))}
            className="w-full h-12 px-4 border-2 border-black rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!donateContract.canStartCampaign && !donateContract.canUpdateTarget}
            min="1"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              className={buttonClass}
              disabled={!donateContract.canStartCampaign || targetAmount <= 0}
              onClick={() => donateContract.startCampaign(targetAmount)}
            >
              Start Campaign
            </button>
            <button
              className={smallButtonClass}
              disabled={!donateContract.canUpdateTarget || targetAmount <= 0}
              onClick={() => donateContract.updateTarget(targetAmount)}
            >
              Update Target
            </button>
          </div>
        </div>
      </div>

      {/* 5. REQUEST PROGRESS + END CAMPAIGN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          className={buttonClass}
          disabled={!donateContract.canRequestProgress || donateContract.isRequestingProgress}
          onClick={donateContract.requestProgress}
        >
          {donateContract.isRequestingProgress ? "Requesting..." : "Request Progress"}
        </button>
        <button
          className={buttonClass + " bg-red-600 hover:bg-red-700"}
          disabled={!donateContract.canEndCampaign}
          onClick={donateContract.endCampaign}
        >
          {donateContract.isEndingCampaign ? "Ending..." : "End Campaign"}
        </button>
      </div>

      {/* 6. REFRESH */}
      <div className="flex justify-center">
        <button
          className={buttonClass + " max-w-xs"}
          disabled={!donateContract.canGetState}
          onClick={donateContract.refreshState}
        >
          Refresh State
        </button>
      </div>

      {/* 7. STATUS MESSAGE */}
      <div className="p-5 bg-white border-2 border-black rounded-2xl text-center">
        <p className="font-mono text-sm break-all">
          <span className="font-bold">Status:</span> {donateContract.message || "Ready"}
        </p>
      </div>
    </div>
  );
};
