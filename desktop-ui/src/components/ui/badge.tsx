import React from "react";
import { cn } from "../../lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "pending";
}

const badgeVariants = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  outline: "border border-border text-muted-foreground bg-background",
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  pending: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
