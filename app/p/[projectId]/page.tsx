import { Suspense } from "react";
import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { projectTitle } from "@/lib/app-title";
import { getProject } from "@/lib/config";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { projectId } = await params;
  const project = getProject(projectId);

  return project ? { title: projectTitle(project.name) } : {};
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;
  // A project route owns transient UI state (drawer trails, palettes, and the
  // notification watcher baseline). A distinct key prevents state from one
  // client-side project visit leaking into the next one.
  return <Suspense fallback={<div className="p-6 text-sm">Loading project…</div>}><AppShell key={projectId} projectId={projectId} /></Suspense>;
}
