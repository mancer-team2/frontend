"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PublicKey } from "@solana/web3.js";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Coins,
  ExternalLink,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import type { VestingType } from "@/lib/anchor/types";
import {
  BASE_SOON_MINT,
  IDRX_SOON_MINT,
  USDC_DEV_FAUCET_URL,
  USDC_DEV_MINT,
  USDC_MAINNET_MINT,
  WRAPPED_SOL_MINT,
  type TokenOption,
  useAvailableTokens,
} from "@/hooks/useAvailableTokens";
import { useCreateStream } from "@/hooks/useCreateStream";
import { explorerUrl, shortenAddress, toRawTokenAmount } from "@/lib/utils/format";

const SOLANA_LOGO_URL = "/solana.png";
const BASE_LOGO_URL = "/base.png";
const USDC_LOGO_URL = "/usdc.png";
const IDRX_LOGO_URL = "/idrx.png";

const vestingOptions: Array<{
  type: VestingType;
  title: string;
  description: string;
  detail: string;
  accent: string;
}> = [
  {
    type: "cliff",
    title: "Cliff Vesting",
    description: "All tokens unlock at a single date.",
    detail: "Nothing before, everything after.",
    accent: "text-amber-500",
  },
  {
    type: "linear",
    title: "Linear Vesting",
    description: "Tokens release gradually from start date to end date.",
    detail: "Smooth, proportional unlock.",
    accent: "text-violet-500",
  },
  {
    type: "milestone",
    title: "Milestone Vesting",
    description: "Full release after a time-gated milestone.",
    detail: "Requires creator confirmation.",
    accent: "text-blue-500",
  },
];

export default function CreateStreamPage() {
  const { create, status, signature, error: txError, reset } = useCreateStream();
  const { tokens, isLoading: tokensLoading } = useAvailableTokens();

  const [vestingType, setVestingType] = useState<VestingType>("linear");
  const [recipient, setRecipient] = useState("");
  const [mint, setMint] = useState(WRAPPED_SOL_MINT);
  const [manualToken, setManualToken] = useState<TokenOption | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [cancelable, setCancelable] = useState(true);
  const [validationError, setValidationError] = useState("");
  const selectedToken = useMemo(
    () => tokens.find((token) => token.mint === mint) ?? (manualToken?.mint === mint ? manualToken : null),
    [manualToken, mint, tokens]
  );

  useEffect(() => {
    [SOLANA_LOGO_URL, BASE_LOGO_URL, USDC_LOGO_URL, IDRX_LOGO_URL].forEach((src) => {
      const image = new window.Image();
      image.src = src;
    });
  }, []);

  const handleSelectToken = (token: TokenOption) => {
    setMint(token.mint);
    setManualToken(token.source === "manual" ? token : null);
    setValidationError("");
    setTokenModalOpen(false);
  };

  const validate = (): string | null => {
    try { new PublicKey(recipient); } catch { return "Invalid recipient address"; }
    try { new PublicKey(mint); } catch { return "Invalid token mint address"; }
    if (!/^[1-9]\d*$/.test(amount.trim())) return "Amount must be a whole number greater than zero";
    if (selectedToken?.source !== "manual" && selectedToken?.decimals !== undefined) {
      const requestedAmount = toRawTokenAmount(amount, selectedToken.decimals);
      const availableAmount = BigInt(selectedToken.balanceRaw ?? "0");

      if (availableAmount < requestedAmount) {
        return `Insufficient ${selectedToken.symbol} balance`;
      }
    }
    if (vestingType === "cliff") {
      if (!unlockDate) return "Unlock date is required";
      return null;
    }
    if (vestingType === "linear") {
      if (!startDate) return "Start date is required";
      if (!endDate) return "End date is required";
      const start = Math.floor(new Date(startDate).getTime() / 1000);
      const end = Math.floor(new Date(endDate).getTime() / 1000);
      if (start >= end) return "Start date must be before end date";
      return null;
    }
    if (!milestoneDate) return "Milestone gate date is required";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    const err = validate();
    if (err) { setValidationError(err); return; }

    const now = Math.floor(Date.now() / 1000);
    const unlock = unlockDate ? Math.floor(new Date(unlockDate).getTime() / 1000) : now + 1;
    const milestone = milestoneDate ? Math.floor(new Date(milestoneDate).getTime() / 1000) : now + 1;
    const start = vestingType === "linear"
      ? Math.floor(new Date(startDate).getTime() / 1000)
      : vestingType === "cliff"
        ? Math.max(0, unlock - 1)
        : now;
    const cliff = vestingType === "linear"
      ? start
      : vestingType === "cliff"
        ? unlock
        : now;
    const end = vestingType === "linear"
      ? Math.floor(new Date(endDate).getTime() / 1000)
      : vestingType === "cliff"
        ? unlock
        : now + 1;

    await create({
      recipient,
      mint,
      amount,
      startTime: start,
      cliffTime: cliff,
      endTime: end,
      cancelable,
      vestingType,
      milestoneTime: vestingType === "milestone" ? milestone : 0,
    });
  };

  const handleAmountChange = (value: string) => {
    setAmount(value.replace(/\D/g, ""));
  };

  const getDatePart = (value: string) => value.split("T")[0] ?? "";
  const getTimePart = (value: string) => value.split("T")[1] ?? "";
  const updateDatePart = (value: string, date: string) => `${date}T${getTimePart(value) || "00:00"}`;
  const updateTimePart = (value: string, time: string) => `${getDatePart(value) || new Date().toISOString().slice(0, 10)}T${time}`;

  const displayError = validationError || txError;

  if (status === "success") {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 rounded-[32px] border border-zinc-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(24,24,27,0.08)]">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <CircleCheck size={34} strokeWidth={1.75} />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Stream Created</h2>
        <p className="text-sm leading-relaxed text-zinc-500">
          Your {getVestingTypeLabel(vestingType).toLowerCase()} stream is now active on-chain.
        </p>
        {signature && (
          <a
            href={explorerUrl(signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-violet-600 transition-colors hover:text-violet-500"
          >
            View on Explorer -&gt;
          </a>
        )}
        <button onClick={reset} className="mt-2 text-sm font-medium text-zinc-500 hover:text-zinc-700">
          Create another stream
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-[32px] border border-zinc-200 bg-white p-5 shadow-[0_18px_70px_rgba(24,24,27,0.055)]">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Create Stream</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">Lock tokens in escrow with a vesting schedule.</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
          <p className="text-sm font-semibold text-zinc-950">Vesting Type</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {vestingOptions.map((option) => {
              const active = vestingType === option.type;

              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => {
                    setVestingType(option.type);
                    setValidationError("");
                  }}
                  className={`group relative min-h-44 cursor-pointer rounded-[24px] border p-5 text-left transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
                    active
                      ? "border-zinc-400 bg-zinc-100 text-zinc-950 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.12)] ring-4 ring-zinc-200/70"
                      : "border-zinc-200 bg-white text-zinc-950 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  {active ? (
                    <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-white shadow-sm">
                      <Check size={15} strokeWidth={2.6} />
                    </span>
                  ) : null}
                  <VestingGlyph type={option.type} className={option.accent} />
                  <p className="mt-6 text-base font-semibold">{option.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-500">{option.description}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-500">{option.detail}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="recipient-address" className="text-sm font-semibold text-zinc-700">Recipient Address</label>
          <input
            id="recipient-address"
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Solana wallet address"
            autoComplete="off"
            spellCheck={false}
            className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-950 transition-all placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/10"
          />
        </div>

        <fieldset className="rounded-[28px] border border-zinc-200 bg-white p-4 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
          <legend className="sr-only">Amount and token</legend>
          <div className="flex min-h-[104px] items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <label htmlFor="stream-amount" className="text-sm font-semibold text-zinc-500">Amount</label>
              <input
                id="stream-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                autoComplete="off"
                className="mt-2 w-full bg-transparent font-mono text-4xl font-medium leading-none tracking-tight text-zinc-950 placeholder:text-zinc-300 focus:outline-none"
              />
              <p className="mt-3 text-sm font-medium text-zinc-400">
                {selectedToken?.balanceLabel ? `Balance ${selectedToken.balanceLabel}` : "$0"}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2 pt-5">
              <button
                id="token-selector"
                type="button"
                onClick={() => setTokenModalOpen(true)}
                className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border p-1 pr-3 text-left text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 active:scale-[0.98] ${
                  selectedToken
                    ? "border-zinc-200 bg-zinc-100/80 text-zinc-950 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.03)] hover:bg-zinc-100"
                    : "border-violet-200 bg-violet-600 px-4 text-white hover:bg-violet-500"
                }`}
              >
                {selectedToken ? (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full">
                      <TokenMark token={selectedToken} compact />
                    </span>
                    <span className="max-w-28 truncate text-base">{selectedToken.symbol}</span>
                  </>
                ) : (
                  <>
                    <Coins size={17} />
                    <span>Select token</span>
                  </>
                )}
                <ChevronDown size={17} className={selectedToken ? "text-zinc-500" : "text-white/80"} />
              </button>
              {selectedToken?.mint === USDC_DEV_MINT && !selectedToken.balanceRaw ? (
                <a
                  href={USDC_DEV_FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-500"
                >
                  Get USDC-Dev <ExternalLink size={12} />
                </a>
              ) : null}
            </div>
          </div>
        </fieldset>

        {vestingType === "cliff" ? (
          <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
            <p className="text-sm font-semibold text-zinc-950">Vesting Schedule</p>
            <div className="mt-7 flex max-w-xl flex-col gap-7">
              <ScheduleDateTimeField
                id="unlock"
                label="Unlock Date"
                value={unlockDate}
                onDateChange={(date) => setUnlockDate(updateDatePart(unlockDate, date))}
                onTimeChange={(time) => setUnlockDate(updateTimePart(unlockDate, time))}
                onNowChange={() => setUnlockDate(formatScheduleInputNow())}
              />
            </div>
          </div>
        ) : vestingType === "linear" ? (
          <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
            <p className="text-sm font-semibold text-zinc-950">Vesting Schedule</p>
            <div className="mt-7 flex max-w-xl flex-col gap-7">
              <ScheduleDateTimeField
                id="start"
                label="Start Date"
                value={startDate}
                onDateChange={(date) => setStartDate(updateDatePart(startDate, date))}
                onTimeChange={(time) => setStartDate(updateTimePart(startDate, time))}
                onNowChange={() => setStartDate(formatScheduleInputNow())}
              />
              <ScheduleDateTimeField
                id="end"
                label="End Date"
                value={endDate}
                onDateChange={(date) => setEndDate(updateDatePart(endDate, date))}
                onTimeChange={(time) => setEndDate(updateTimePart(endDate, time))}
                onNowChange={() => setEndDate(formatScheduleInputNow())}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
            <p className="text-sm font-semibold text-zinc-950">Milestone Gate</p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">
              Tokens unlock only after this gate time has passed and the creator marks the milestone complete.
            </p>
            <div className="mt-7 flex max-w-xl flex-col gap-7">
              <ScheduleDateTimeField
                id="milestone"
                label="Gate Date"
                value={milestoneDate}
                onDateChange={(date) => setMilestoneDate(updateDatePart(milestoneDate, date))}
                onTimeChange={(time) => setMilestoneDate(updateTimePart(milestoneDate, time))}
                onNowChange={() => setMilestoneDate(formatScheduleInputNow())}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCancelable(!cancelable)}
            className={`relative h-7 w-12 rounded-full transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 ${cancelable ? "bg-violet-600" : "bg-zinc-200"}`}
            aria-pressed={cancelable}
          >
            <div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${cancelable ? "left-6" : "left-1"}`} />
          </button>
          <span className="text-sm font-medium text-zinc-700">Cancelable stream</span>
        </div>

        <div className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_18px_60px_rgba(24,24,27,0.045)]">
          <p className="text-sm font-semibold text-zinc-950">Unlock Preview</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">{getVestingPreview(vestingType)}</p>
        </div>

        {displayError && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-3.5 py-2.5">
            <CircleAlert size={16} className="shrink-0 text-red-500" />
            <span className="text-sm text-red-600">{displayError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={status === "preparing" || status === "awaiting_signature" || status === "confirming"}
          className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60 active:-translate-y-[1px] active:scale-[0.97] focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20"
        >
          {status === "preparing" || status === "awaiting_signature" || status === "confirming" ? (
            <><LoaderCircle size={16} className="animate-spin" /> {
              status === "preparing" ? "Preparing transaction..." :
              status === "awaiting_signature" ? "Approve in wallet..." :
              "Confirming..."
            }</>
          ) : (
            <>Create {getVestingTypeLabel(vestingType)} Stream <ArrowRight size={14} strokeWidth={2.5} /></>
          )}
        </button>
      </form>

      <TokenSelectModal
        open={tokenModalOpen}
        tokens={tokens}
        selectedMint={mint}
        isLoading={tokensLoading}
        onClose={() => setTokenModalOpen(false)}
        onSelect={handleSelectToken}
      />
    </div>
  );
}

type TokenSelectModalProps = {
  open: boolean;
  tokens: TokenOption[];
  selectedMint: string;
  isLoading: boolean;
  onClose: () => void;
  onSelect: (token: TokenOption) => void;
};

type ScheduleDateTimeFieldProps = {
  id: string;
  label: string;
  value: string;
  optionalLabel?: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onNowChange: () => void;
};

function getVestingTypeLabel(vestingType: VestingType) {
  if (vestingType === "cliff") return "Cliff";
  if (vestingType === "linear") return "Linear";

  return "Milestone";
}

function getVestingPreview(vestingType: VestingType) {
  if (vestingType === "cliff") {
    return "Tokens remain fully locked until the unlock date. At that moment, the entire allocation becomes withdrawable.";
  }

  if (vestingType === "linear") {
    return "Tokens unlock proportionally from the start date to the end date. The recipient can withdraw newly vested tokens over time.";
  }

  return "Tokens stay locked until the gate date passes and the creator confirms the milestone. Then the full allocation becomes withdrawable.";
}

function VestingGlyph({ type, className }: { type: VestingType; className: string }) {
  const path = type === "cliff"
    ? "M5 14h5V6h9"
    : type === "linear"
      ? "M5 15h4l6-9h4"
      : "M4 15h5v-5h5V6h6";

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-10 w-10 ${className}`}>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" />
    </svg>
  );
}

function ScheduleDateTimeField({
  id,
  label,
  value,
  optionalLabel,
  onDateChange,
  onTimeChange,
  onNowChange,
}: ScheduleDateTimeFieldProps) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonth(value));
  const [date = "", time = "00:00"] = value.split("T");
  const dateLabel = date ? formatScheduleDate(date) : "Pick a date";
  const timeLabel = time || "00:00";
  const [timeDraft, setTimeDraft] = useState(timeLabel);
  const [timeEditing, setTimeEditing] = useState(false);
  const today = new Date();
  const openDatePicker = () => {
    setCalendarMonth(getCalendarMonth(value));
    setCalendarOpen((open) => !open);
    setTimeOpen(false);
  };
  const selectedDate = parseScheduleDate(date);
  const calendarDays = getCalendarDays(calendarMonth);

  useEffect(() => {
    if (!calendarOpen && !timeOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!calendarRef.current?.contains(event.target as Node)) {
        setCalendarOpen(false);
      }

      if (!timeRef.current?.contains(event.target as Node)) {
        setTimeOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [calendarOpen, timeOpen]);

  return (
    <div className="flex gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-3">
          <label htmlFor={`${id}-date-trigger`} className="px-1 text-sm font-semibold text-violet-600">{label}</label>
          {optionalLabel ? <span className="text-[11px] font-medium text-zinc-400">{optionalLabel}</span> : null}
          <button
            type="button"
            onClick={() => {
              onNowChange();
              setCalendarOpen(false);
              setTimeOpen(false);
              setTimeDraft(formatInputTime(new Date()));
              setTimeEditing(false);
            }}
            className="ml-auto cursor-pointer rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition-colors hover:border-violet-200 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
          >
            Now
          </button>
        </div>
        <div ref={calendarRef} className="relative">
          <button
            id={`${id}-date-trigger`}
            type="button"
            onClick={openDatePicker}
            className="flex h-12 w-full cursor-pointer items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 text-left text-sm font-medium text-zinc-950 shadow-[0_8px_24px_rgba(24,24,27,0.04)] transition-all hover:border-zinc-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
          >
            <span className={date ? "" : "text-zinc-400"}>{dateLabel}</span>
            <ChevronDown size={16} className="text-violet-600" />
          </button>
          {calendarOpen ? (
            <div className="absolute left-0 top-14 z-40 w-[268px] rounded-[22px] border border-zinc-200 bg-white p-4 shadow-[0_20px_70px_rgba(24,24,27,0.16)]">
              <div className="mb-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  aria-label="Previous month"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
                >
                  <ChevronLeft size={18} />
                </button>
                <p className="text-sm font-semibold text-zinc-950">
                  {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  aria-label="Next month"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                  <span key={day} className="py-1 text-xs font-medium text-zinc-500">{day}</span>
                ))}
                {calendarDays.map((day) => {
                  const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const selected = selectedDate ? isSameCalendarDay(day, selectedDate) : false;
                  const isToday = isSameCalendarDay(day, today);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        onDateChange(formatInputDate(day));
                        setCalendarOpen(false);
                      }}
                      className={`mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-sm transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
                        selected
                          ? "bg-zinc-100 font-semibold text-zinc-950"
                          : isToday
                            ? "bg-zinc-100 font-semibold text-zinc-950 ring-1 ring-inset ring-zinc-200"
                          : inCurrentMonth
                            ? "text-zinc-950 hover:bg-zinc-50"
                            : "text-zinc-400 hover:bg-zinc-50"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div ref={timeRef} className="relative flex w-32 shrink-0 flex-col gap-4">
        <label htmlFor={`${id}-time`} className="invisible px-1 text-sm font-semibold text-violet-600">Time</label>
        <div className="flex h-12 items-center rounded-2xl border border-zinc-200 bg-white px-4 shadow-[0_8px_24px_rgba(24,24,27,0.04)] transition-all focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-500/10">
          <input
            id={`${id}-time`}
            type="text"
            inputMode="numeric"
            value={timeEditing ? timeDraft : timeLabel}
            onFocus={(event) => {
              setTimeEditing(true);
              setTimeDraft(timeLabel);
              event.currentTarget.select();
            }}
            onChange={(event) => setTimeDraft(normalizeTimeInput(event.target.value))}
            onBlur={(event) => {
              const nextTime = completeTimeInput(event.target.value);
              setTimeDraft(nextTime);
              setTimeEditing(false);
              onTimeChange(nextTime);
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm font-medium text-zinc-950 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setTimeOpen((open) => !open);
              setCalendarOpen(false);
            }}
            aria-label="Open time picker"
            className="-mr-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
          >
            <ClockIcon />
          </button>
        </div>
        {timeOpen ? (
          <TimePickerPopover
            value={timeLabel}
            onChange={(nextTime) => {
              setTimeDraft(nextTime);
              setTimeEditing(false);
              onTimeChange(nextTime);
              setTimeOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function formatScheduleDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "Pick a date";

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseScheduleDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function getCalendarMonth(value: string) {
  const [date = ""] = value.split("T");
  const parsed = parseScheduleDate(date);
  const source = parsed ?? new Date();

  return new Date(source.getFullYear(), source.getMonth(), 1);
}

function getCalendarDays(month: Date) {
  const firstVisibleDay = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());

  return Array.from({ length: 42 }, (_, index) => (
    new Date(firstVisibleDay.getFullYear(), firstVisibleDay.getMonth(), firstVisibleDay.getDate() + index)
  ));
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatInputTime(date: Date) {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function formatScheduleInputNow() {
  const now = new Date();

  return `${formatInputDate(now)}T${formatInputTime(now)}`;
}

function normalizeTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function completeTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").padEnd(4, "0").slice(0, 4);
  const hour = Math.min(Number(digits.slice(0, 2) || "0"), 23);
  const minute = Math.min(Number(digits.slice(2) || "0"), 59);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function TimePickerPopover({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const [selectedHour = "00", selectedMinute = "00"] = value.split(":");
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

  return (
    <div className="absolute right-0 top-14 z-40 w-[188px] overflow-hidden rounded-[22px] border border-zinc-200 bg-white p-3 shadow-[0_20px_70px_rgba(24,24,27,0.16)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm font-semibold text-zinc-950">Pick time</p>
        <p className="font-mono text-xs font-semibold text-violet-600">{selectedHour}:{selectedMinute}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Hour</p>
          <div className="max-h-56 overflow-y-auto pr-1">
            {hours.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => onChange(`${hour}:${selectedMinute}`)}
                className={`mb-1 flex h-9 w-full cursor-pointer items-center justify-center rounded-xl font-mono text-sm transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
                  selectedHour === hour
                    ? "bg-zinc-100 font-semibold text-zinc-950"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {hour}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Minute</p>
          <div className="max-h-56 overflow-y-auto pr-1">
            {minutes.map((minute) => (
              <button
                key={minute}
                type="button"
                onClick={() => onChange(`${selectedHour}:${minute}`)}
                className={`mb-1 flex h-9 w-full cursor-pointer items-center justify-center rounded-xl font-mono text-sm transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
                  selectedMinute === minute
                    ? "bg-zinc-100 font-semibold text-zinc-950"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {minute}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-zinc-600">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 5.8v4.6l3 1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TokenSelectModal({ open, tokens, selectedMint, isLoading, onClose, onSelect }: TokenSelectModalProps) {
  const [search, setSearch] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customMint, setCustomMint] = useState("");
  const [customError, setCustomError] = useState("");

  const resetModalState = useCallback(() => {
    setSearch("");
    setCustomOpen(false);
    setCustomMint("");
    setCustomError("");
  }, []);

  const handleClose = useCallback(() => {
    resetModalState();
    onClose();
  }, [onClose, resetModalState]);

  const handleSelect = useCallback((token: TokenOption) => {
    resetModalState();
    onSelect(token);
  }, [onSelect, resetModalState]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose, open]);

  const filteredTokens = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tokens;

    return tokens.filter((token) =>
      token.symbol.toLowerCase().includes(query)
      || token.name.toLowerCase().includes(query)
      || token.mint.toLowerCase().includes(query)
    );
  }, [search, tokens]);

  if (!open) return null;

  const handleUseCustomMint = () => {
    setCustomError("");

    try {
      const publicKey = new PublicKey(customMint.trim());
      handleSelect({
        mint: publicKey.toBase58(),
        symbol: "Custom",
        name: "Custom SPL token",
        source: "manual",
      });
    } catch {
      setCustomError("Enter a valid SPL token mint address.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 px-3 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="token-select-title"
        className="flex max-h-[86dvh] w-full max-w-[500px] flex-col overflow-hidden rounded-[30px] border border-zinc-200 bg-white shadow-[0_24px_90px_rgba(24,24,27,0.2)]"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 id="token-select-title" className="text-lg font-semibold tracking-tight text-zinc-950">Select a token</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close token selector"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pb-4">
          <label htmlFor="token-search" className="sr-only">Search tokens</label>
          <div className="flex h-14 items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 transition-colors focus-within:border-violet-300 focus-within:bg-white">
            <Search size={20} className="text-zinc-400" />
            <input
              id="token-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tokens"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-base text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-zinc-100 px-5 pb-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Available tokens</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {isLoading ? (
            <div className="flex flex-col gap-2 px-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                  <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-100" />
                  <div className="flex-1">
                    <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-100" />
                    <div className="mt-2 h-3 w-36 animate-pulse rounded-full bg-zinc-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredTokens.length > 0 ? (
            <div className="flex flex-col gap-1">
              {filteredTokens.map((token) => (
                <button
                  type="button"
                  key={token.mint}
                  disabled={token.disabled}
                  onClick={() => handleSelect(token)}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
                >
                  <TokenMark token={token} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-950">{token.symbol}</span>
                      {token.mint === USDC_DEV_MINT ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                          Demo
                        </span>
                      ) : null}
                      {token.badge ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200">
                          {token.badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-zinc-500">
                      {getTokenDescription(token)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {token.balanceLabel ? (
                      <span className="font-mono text-xs font-semibold text-zinc-600">{token.balanceLabel}</span>
                    ) : token.mint === USDC_DEV_MINT ? (
                      <a
                        href={USDC_DEV_FAUCET_URL}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="hidden items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-500 sm:inline-flex"
                      >
                        Faucet <ExternalLink size={12} />
                      </a>
                    ) : null}
                    {selectedMint === token.mint ? <Check size={18} className="text-violet-600" /> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mx-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-zinc-950">No token found</p>
              <p className="mt-1 text-sm text-zinc-500">Paste a custom mint address to use a token that is not listed.</p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 p-5">
          {customOpen ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <label htmlFor="custom-token-mint" className="text-sm font-semibold text-zinc-700">Custom mint</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="custom-token-mint"
                  type="text"
                  value={customMint}
                  onChange={(event) => {
                    setCustomMint(event.target.value);
                    setCustomError("");
                  }}
                  placeholder="SPL token mint address"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={customError ? "true" : undefined}
                  aria-describedby={customError ? "custom-token-error" : undefined}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
                />
                <button
                  type="button"
                  onClick={handleUseCustomMint}
                  className="min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20"
                >
                  Use this mint
                </button>
              </div>
              {customError ? <p id="custom-token-error" className="mt-2 text-xs text-red-600">{customError}</p> : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              className="text-sm font-semibold text-violet-600 transition-colors hover:text-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/15"
            >
              Use custom mint
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function TokenMark({ token, compact = false }: { token: TokenOption; compact?: boolean }) {
  const label = token.symbol.slice(0, 2).toUpperCase();
  const sizeClass = compact ? "h-10 w-10" : "h-11 w-11";
  const imageSize = compact ? 40 : 44;
  const logoUrl = token.mint === WRAPPED_SOL_MINT
    ? SOLANA_LOGO_URL
    : token.mint === BASE_SOON_MINT
      ? BASE_LOGO_URL
      : token.mint === USDC_MAINNET_MINT
        ? USDC_LOGO_URL
        : token.mint === USDC_DEV_MINT
          ? USDC_LOGO_URL
          : token.mint === IDRX_SOON_MINT
            ? IDRX_LOGO_URL
      : null;

  if (logoUrl) {
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-950 ring-1 ring-inset ring-white/20 ${sizeClass}`}>
        <Image
          src={logoUrl}
          alt=""
          width={imageSize}
          height={imageSize}
          loading="eager"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-zinc-950 font-bold text-white ring-1 ring-inset ring-white/20 ${sizeClass} ${compact ? "text-[10px]" : "text-xs"}`}>
      {label}
    </span>
  );
}

function getTokenDescription(token: TokenOption) {
  if (token.mint === BASE_SOON_MINT) return "Base chain support is coming soon.";
  if (token.mint === IDRX_SOON_MINT) return "Indonesian Rupiah stablecoin support is coming soon.";
  if (token.mint === USDC_MAINNET_MINT) return "Mainnet USDC is listed for reference.";
  if (token.mint === USDC_DEV_MINT) return `Devnet demo token - ${shortenAddress(token.mint, 4)}`;
  if (token.mint === WRAPPED_SOL_MINT) return `Solana SPL token - ${shortenAddress(token.mint, 4)}`;

  return `${token.name} - ${shortenAddress(token.mint, 4)}`;
}
