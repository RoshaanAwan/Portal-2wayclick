import { PageHeaderMotion } from "./PageHeaderMotion";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  // Render the icon component here (server-safe) into a ReactNode so we never
  // pass a non-serializable component reference across the RSC boundary into
  // the client motion wrapper. lucide icons are plain SVG and render fine here.
  return (
    <PageHeaderMotion
      title={title}
      subtitle={subtitle}
      icon={Icon ? <Icon className="h-5 w-5 text-accent" /> : null}
      action={action}
    />
  );
}
