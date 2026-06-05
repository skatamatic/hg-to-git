import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[length:var(--text-ui-base)] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_20px_rgba(6,182,212,0.15)] hover:brightness-110",
        secondary:
          "bg-elevated text-foreground border border-border hover:bg-muted",
        outline:
          "border border-border/80 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
        ghost:
          "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        hg: "bg-hg-muted/60 text-hg border border-hg/25 hover:bg-hg-muted",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/25 hover:bg-destructive/15",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-md px-3 text-[length:var(--text-ui-sm)]",
        lg: "h-11 rounded-lg px-5 text-[length:var(--text-ui-lg)] font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
