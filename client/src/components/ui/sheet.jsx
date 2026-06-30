import React from "react";
import { cn } from "../../lib/utils";

export function Sheet({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] lg:hidden">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 border-0 bg-black/35"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

export function SheetContent({ className, children }) {
  return (
    <aside
      className={cn(
        "absolute left-0 top-0 h-full w-[280px] max-w-[86vw] overflow-y-auto bg-secondary p-4 shadow-soft",
        className
      )}
    >
      {children}
    </aside>
  );
}

export function SheetHeader({ className, ...props }) {
  return <div className={cn("mb-4", className)} {...props} />;
}

export function SheetTitle({ className, ...props }) {
  return <h2 className={cn("text-xl font-bold text-white", className)} {...props} />;
}
