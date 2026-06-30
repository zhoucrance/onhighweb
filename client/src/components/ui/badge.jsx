import React from "react";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  outline: "border border-border bg-white text-ink",
  muted: "bg-muted text-slate-600",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-bold",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}
