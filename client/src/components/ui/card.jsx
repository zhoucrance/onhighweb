import React from "react";
import { cn } from "../../lib/utils";

export const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded border border-border bg-white shadow-soft", className)}
    {...props}
  />
));

export const CardHeader = ({ className, ...props }) => (
  <div className={cn("border-b border-border px-4 py-3", className)} {...props} />
);

export const CardTitle = ({ className, ...props }) => (
  <h2 className={cn("text-base font-bold text-ink", className)} {...props} />
);

export const CardContent = ({ className, ...props }) => (
  <div className={cn("px-4 py-3", className)} {...props} />
);
