import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  GraduationCap,
  Compass,
  Dumbbell,
  Brain,
  Landmark,
  BookMarked,
  Users,
  Hourglass,
  BarChart3,
  Settings,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Logo, LogoMark } from "@/components/Logo";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { api } from "@/services/api";

const groups = [
  {
    label: "Main",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/tutor", label: "AI Tutor", icon: GraduationCap },
      { to: "/mentor", label: "AI Mentor", icon: Compass },
      { to: "/practice", label: "Practice", icon: Dumbbell },
    ],
  },
  {
    label: "Your learning",
    items: [
      { to: "/learner-model", label: "Learner Model", icon: Brain },
      { to: "/mistakes", label: "Mistake Museum", icon: Landmark },
      { to: "/memory", label: "Learning Memory", icon: BookMarked },
    ],
  },
  {
    label: "Your progress",
    items: [
      { to: "/echo-twin", label: "Echo Twin", icon: Users },
      { to: "/time-capsule", label: "Time Capsule", icon: Hourglass },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/privacy", label: "Privacy", icon: ShieldCheck },
    ],
  },
] as const;

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      try {
        return await api.getProfile();
      } catch {
        if (!isSupabaseConfigured()) return null;
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return null;
        return {
          id: u.user.id,
          email: u.user.email ?? "",
          full_name: u.user.email?.split("@")[0] || "Learner",
          native_language: "Hindi",
          learning_language: "English",
          level: "Beginner" as const,
          goal: "",
          explain_language: "Hinglish" as const,
          voice_preference: "Shivani",
          save_history: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut();
    }
    navigate({ to: "/auth", replace: true });
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-4">
          <Link
            to="/dashboard"
            className="flex items-center group-data-[collapsible=icon]:justify-center"
          >
            <span className="group-data-[collapsible=icon]:hidden">
              <Logo />
            </span>
            <span className="hidden group-data-[collapsible=icon]:inline-flex">
              <LogoMark className="size-8" />
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {g.items.map((it) => (
                    <SidebarMenuItem key={it.to}>
                      <SidebarMenuButton asChild isActive={pathname === it.to} tooltip={it.label}>
                        <Link to={it.to}>
                          <it.icon />
                          <span>{it.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{profile?.full_name ?? ""}</p>
              <p className="text-xs text-muted-foreground">
                {profile?.level ?? ""} · {profile?.learning_language ?? ""}
              </p>
            </div>
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {(profile?.full_name ?? "?").charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1.5 text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-5 md:p-8 animate-rise">{children}</div>
  );
}

export function SampleBadge() {
  return (
    <span className="rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-foreground">
      Sample data
    </span>
  );
}
