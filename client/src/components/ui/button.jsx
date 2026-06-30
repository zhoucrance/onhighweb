import React from "react";
import { cn } from "../../lib/utils";

const variants = {
  default: "bg-primary text-white hover:bg-primary/90",
  secondary: "bg-secondary text-white hover:bg-secondary/90",
  outline: "border border-border bg-white text-ink hover:bg-muted",
  ghost: "bg-transparent text-ink hover:bg-muted",
};

export const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded border-0 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        size === "icon" ? "h-10 w-10 p-0" : "h-10 px-4 py-2",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
