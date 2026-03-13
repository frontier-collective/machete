import type { View } from "@/types";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { useRepoPath } from "@/hooks/useRepo";

interface ShellProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: React.ReactNode;
}

export function Shell({ currentView, onNavigate, children }: ShellProps) {
  const { repoPath } = useRepoPath();

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar currentView={currentView} onNavigate={onNavigate} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header repoPath={repoPath} />
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
}
