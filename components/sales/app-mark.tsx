export default function AppMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="bg-foreground/8 text-foreground flex size-10 shrink-0 items-center justify-center rounded-[0.6em] text-[1.05em] font-semibold tracking-[-0.02em] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
