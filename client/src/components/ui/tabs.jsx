import React from "react";
import { cn } from "../../lib/utils";

export function Tabs({ className, ...props }) {
  return <div className={cn("w-full", className)} {...props} />;
}

export function TabsList({ className, ...props }) {
  return <div className={cn("inline-flex rounded border border-border bg-muted p-1", className)} {...props} />;
}

export function TabsTrigger({ active, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded border-0 px-3 py-2 text-sm font-semibold",
        active ? "bg-white text-primary shadow-sm" : "bg-transparent text-slate-600",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <div className={cn("mt-4", className)} {...props} />;
}
