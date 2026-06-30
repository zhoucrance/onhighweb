import React from "react";
import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn("h-10 w-full rounded border border-border bg-white px-3 text-sm text-ink", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function SelectOption(props) {
  return <option {...props} />;
}
