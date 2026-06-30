import React from "react";
import { cn } from "../../lib/utils";

export function Table({ className, ...props }) {
  return <table className={cn("w-full border-collapse", className)} {...props} />;
}

export function TableHeader(props) {
  return <thead {...props} />;
}

export function TableBody(props) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }) {
  return <tr className={cn("border-b border-border", className)} {...props} />;
}

export function TableHead({ className, ...props }) {
  return <th className={cn("px-3 py-2 text-left text-sm font-bold text-slate-600", className)} {...props} />;
}

export function TableCell({ className, ...props }) {
  return <td className={cn("px-3 py-2 text-sm text-ink", className)} {...props} />;
}
