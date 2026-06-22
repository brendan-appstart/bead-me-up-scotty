import { AppShell } from "@/components/app-shell";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <AppShell projectId={projectId} />;
}
