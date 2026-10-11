export default function PageShell({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[72em] flex-col gap-10 px-4 py-8 md:px-8">
        <header className="flex flex-col gap-2">
          <h1 className="tracking-[-0.02em]">{title}</h1>
          <p className="text-subtle max-w-[40em]">{intro}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
