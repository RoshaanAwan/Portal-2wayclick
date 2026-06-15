export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface-2 px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-ink-400 shadow-xs">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <p className="text-sm font-semibold text-ink-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs text-ink-400">{description}</p>
      )}
    </div>
  );
}
