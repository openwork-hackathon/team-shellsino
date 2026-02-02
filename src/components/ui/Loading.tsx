"use client";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export default function Loading({ size = "md", text }: LoadingProps) {
  const sizeClasses = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
  };

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className={`${sizeClasses[size]} animate-pulse mb-2`}>🎰</div>
      {text && <p className="text-gray-400 text-sm">{text}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-shimmer bg-gray-700 rounded ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-[#1a1a1b] rounded-lg p-4 border border-gray-800">
      <Skeleton className="h-6 w-1/3 mb-3" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
