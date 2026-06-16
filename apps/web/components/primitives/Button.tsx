"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--bg)] hover:bg-[var(--accent-quiet)] active:brightness-95",
        secondary:
          "border border-[var(--border-hi)] bg-[var(--panel)] text-[var(--text-hi)] hover:bg-[var(--panel-2)] hover:border-[var(--border-hi)]",
        ghost:
          "text-[var(--text-mid)] hover:text-[var(--text-hi)] hover:bg-[var(--panel-2)]",
        danger:
          "bg-[var(--risk-critical)] text-[var(--bg)] hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[14px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner className="h-4 w-4" /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
