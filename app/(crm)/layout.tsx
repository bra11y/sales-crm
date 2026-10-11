import Sidebar from "@/components/_common/sidebar/sidebar";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh max-w-full overflow-hidden">
      <a
        href="#main"
        className="bg-background text-foreground focus-visible:ring-ring sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus-visible:ring-2"
      >
        Skip to content
      </a>
      <Sidebar />
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        {children}
      </main>
    </div>
  );
}
