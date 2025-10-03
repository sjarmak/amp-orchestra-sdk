import {
  CheckCircle,
  AlertCircle,
  Loader2,
  XCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type SessionStatus =
  | "detecting"
  | "spawning"
  | "running"
  | "auth"
  | "error"
  | "dead"
  | "offline";

interface SessionStatusBadgeProps {
  status: SessionStatus;
  className?: string;
  showLabel?: boolean;
  animate?: boolean;
}

const statusConfig = {
  detecting: {
    icon: Loader2,
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    label: "Detecting",
    animate: true,
  },
  spawning: {
    icon: Loader2,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    label: "Starting",
    animate: true,
  },
  running: {
    icon: CheckCircle,
    color: "text-green-500",
    bg: "bg-green-500/10",
    label: "Online",
    animate: false,
  },
  auth: {
    icon: Wifi,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    label: "Authenticating",
    animate: false,
  },
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    label: "Error",
    animate: false,
  },
  dead: {
    icon: XCircle,
    color: "text-gray-500",
    bg: "bg-gray-500/10",
    label: "Stopped",
    animate: false,
  },
  offline: {
    icon: WifiOff,
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    label: "Offline",
    animate: false,
  },
};

export function SessionStatusBadge({
  status,
  className,
  showLabel = false,
  animate = true,
}: SessionStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all duration-200",
        config.bg,
        config.color,
        className
      )}
    >
      <Icon
        className={cn("w-3 h-3", animate && config.animate && "animate-spin")}
      />
      {showLabel && <span className="whitespace-nowrap">{config.label}</span>}
    </div>
  );
}

export function SessionStatusDot({
  status,
  className,
}: {
  status: SessionStatus;
  className?: string;
}) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full transition-all duration-200",
        config.color.replace("text-", "bg-"),
        config.animate && "animate-pulse",
        className
      )}
    />
  );
}
