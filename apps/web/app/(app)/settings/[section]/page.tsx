"use client";

import { use } from "react";
import Link from "next/link";
import { cn } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/states";
import { AreasSection, GeneralSection, TagsSection } from "@/components/settings/basic";
import { RulesSection } from "@/components/settings/rules";
import { AiSection } from "@/components/settings/ai";
import { CaptureSection, DataSection, StorageSection } from "@/components/settings/system";

const SECTIONS = {
  general: { label: "General", C: GeneralSection },
  areas: { label: "Areas", C: AreasSection },
  tags: { label: "Tags", C: TagsSection },
  rules: { label: "Rules", C: RulesSection },
  ai: { label: "AI", C: AiSection },
  capture: { label: "Capture", C: CaptureSection },
  storage: { label: "Storage", C: StorageSection },
  data: { label: "Data", C: DataSection },
} as const;

export default function SettingsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const key = (section in SECTIONS ? section : "general") as keyof typeof SECTIONS;
  const { C } = SECTIONS[key];
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Settings" />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 md:w-48 md:flex-col md:border-r md:border-b-0 md:px-2 md:py-3" aria-label="Settings sections">
          {Object.entries(SECTIONS).map(([k, v]) => (
            <Link key={k} href={`/settings/${k}`} aria-current={k === key ? "page" : undefined} className={cn("shrink-0 rounded-md px-2.5 py-1.5 text-[13px]", k === key ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-6">
          <div className="max-w-2xl">
            <C />
          </div>
        </div>
      </div>
    </div>
  );
}
