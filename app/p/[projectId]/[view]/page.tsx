import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { projectTitle } from "@/lib/app-title";
import { getProject } from "@/lib/config";
import { isView } from "@/lib/views";

type Props = {
  params: Promise<{ projectId: string; view: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  const project = getProject(projectId);

  return project ? { title: projectTitle(project.name) } : {};
}

export default async function ProjectViewPage({ params }: Props) {
  const { projectId, view } = await params;
  if (!isView(view)) notFound();

  return (
    <Suspense fallback={null}>
      <AppShell projectId={projectId} />
    </Suspense>
  );
}
