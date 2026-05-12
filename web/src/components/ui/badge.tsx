import { Badge as AppsBadge, type BadgeProps as AppsBadgeProps } from "@openai/apps-sdk-ui/components/Badge";
import * as React from "react";

type ShadcnVariant = "default" | "secondary" | "destructive" | "outline";

export interface BadgeProps extends Omit<AppsBadgeProps, "variant" | "color" | "size"> {
  variant?: ShadcnVariant;
}

function mapBadge(variant: ShadcnVariant): { variant: "solid" | "soft" | "outline"; color: AppsBadgeProps["color"] } {
  switch (variant) {
    case "secondary":
      return { variant: "soft", color: "secondary" };
    case "destructive":
      return { variant: "solid", color: "danger" };
    case "outline":
      return { variant: "outline", color: "secondary" };
    case "default":
    default:
      return { variant: "solid", color: "info" };
  }
}

function Badge({ variant = "default", className, ...props }: BadgeProps) {
  const mapped = mapBadge(variant);
  const pill = typeof className === "string" && className.includes("rounded-full") ? true : undefined;

  return (
    <AppsBadge
      {...props}
      className={className}
      variant={mapped.variant}
      color={mapped.color}
      pill={pill}
    />
  );
}

export { Badge };
