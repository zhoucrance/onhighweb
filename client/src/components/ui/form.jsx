import React from "react";
import { cn } from "../../lib/utils";

export function Form({ className, ...props }) {
  return <form className={cn("space-y-4", className)} {...props} />;
}

export function FormItem({ className, ...props }) {
  return <div className={cn("space-y-1.5", className)} {...props} />;
}

export function FormLabel({ className, ...props }) {
  return <label className={cn("text-sm font-bold text-ink", className)} {...props} />;
}

export function FormMessage({ className, children, ...props }) {
  if (!children) return null;
  return (
    <p className={cn("text-xs font-semibold text-red-600", className)} {...props}>
      {children}
    </p>
  );
}
