import { Plus, Trash2, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type AvailableIcons = "trash" | "close" | "plus";

interface IconProps {
  name: AvailableIcons;
  className?: string;
}

const Icon = ({ name, className }: IconProps) => {
  const iconMap: Record<AvailableIcons, LucideIcon> = {
    trash: Trash2,
    close: X,
    plus: Plus,
  };

  const Component = iconMap[name];

  return <Component className={cn("h-5 w-5", className)} aria-hidden="true" />;
};

export default Icon;
