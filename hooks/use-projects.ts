"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
}
