import Asset from "@/components/_ui/asset";
import { cn } from "@/lib/utils";

type AvatarProps = {
  src: string;
  alt: string;
  className?: string;
  name?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const base = "size-5 shrink-0 rounded-full bg-[#f2f2f2] outline-1 -outline-offset-1 outline-white/10";

export default function Avatar({ src, alt, className, name }: AvatarProps) {
  if (!src) {
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn(base, "flex items-center justify-center text-[0.5em] font-medium text-[#2a2a2a]", className)}
      >
        {initials(name ?? alt)}
      </span>
    );
  }
  return (
    <Asset
      type="image"
      src={src}
      alt={alt}
      width={1}
      height={1}
      sizes="48px"
      className={cn(base, className)}
    />
  );
}
