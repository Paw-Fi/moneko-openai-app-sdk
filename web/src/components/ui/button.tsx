import { Button as AppsButton } from "@openai/apps-sdk-ui/components/Button";
import * as React from "react";

import { cn } from "@/lib/utils";

type ShadcnVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";
type ShadcnSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ShadcnVariant;
  size?: ShadcnSize;
  asChild?: boolean;
}

function mapVariant(
  variant: ShadcnVariant
): {
  color: "primary" | "secondary" | "danger";
  variant: "solid" | "outline" | "ghost";
} {
  switch (variant) {
    case "destructive":
      return { color: "danger", variant: "solid" };
    case "outline":
      return { color: "secondary", variant: "outline" };
    case "secondary":
      return { color: "secondary", variant: "solid" };
    case "ghost":
      return { color: "secondary", variant: "ghost" };
    case "default":
    default:
      return { color: "primary", variant: "solid" };
  }
}

function mapSize(size: ShadcnSize): "sm" | "md" | "lg" {
  switch (size) {
    case "sm":
      return "sm";
    case "lg":
      return "lg";
    case "icon":
    case "default":
    default:
      return "md";
  }
}

function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ShadcnVariant;
  size?: ShadcnSize;
  className?: string;
}) {
  if (variant === "link") {
    return cn(
      "inline-flex items-center gap-2 text-sm font-medium text-secondary underline underline-offset-4 hover:text-default disabled:pointer-events-none disabled:opacity-50",
      className
    );
  }
  void size;
  return cn(className);
}

const Button = ({ variant = "default", size = "default", asChild, className, children, ...props }: ButtonProps) => {
  void asChild;

  if (variant === "link") {
    const { type, ...rest } = props;
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        {...rest}
        type={type ?? "button"}
      >
        {children}
      </button>
    );
  }

  const mapped = mapVariant(variant);

  return (
    <AppsButton
      {...props}
      color={mapped.color}
      variant={mapped.variant}
      size={mapSize(size)}
      uniform={size === "icon"}
      className={className}
    >
      {children}
    </AppsButton>
  );
};

export { Button, buttonVariants };
