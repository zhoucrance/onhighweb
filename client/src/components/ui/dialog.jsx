import React from "react";
import { cn } from "../../lib/utils";

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 border-0 bg-black/35"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

export function DialogContent({ className, ...props }) {
  return (
    <div
      className={cn("relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded bg-white p-5 shadow-soft", className)}
      {...props}
    />
  );
}
