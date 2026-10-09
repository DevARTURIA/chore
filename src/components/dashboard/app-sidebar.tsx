'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BookOpen, Bookmark, Brain, HomeIcon } from 'lucide-react';

import { AgentMark } from '@/components/logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { brand } from '@/config/brand';
import { APP_VERSION } from '@/lib/constants';

import { AppSidebarAutomations } from './app-sidebar-automations';
import { AppSidebarConversations } from './app-sidebar-conversations';
import { AppSidebarUser } from './app-sidebar-user';

const AppSidebarHeader = () => {
  return (
    <SidebarHeader>
      <div className="flex items-center justify-between px-1 py-1">
        <Link
          href="/home"
          className="flex items-center gap-[0.3em] pl-1 text-xl leading-none tracking-[-0.03em]"
          aria-label={brand.name}
        >
          <AgentMark size={20} />
          <span className="font-extrabold group-data-[collapsible=icon]:hidden">
            {brand.name}
          </span>
        </Link>
        <span className="select-none font-mono text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          v{APP_VERSION}
        </span>
      </div>
    </SidebarHeader>
  );
};

const AppSidebarFooter = () => {
  return (
    <SidebarFooter>
      <AppSidebarUser />
    </SidebarFooter>
  );
};

const ExploreItems = [
  {
    title: 'Home',
    url: '/home',
    segment: 'home',
    icon: HomeIcon,
    external: false,
  },
  {
    title: 'Docs',
    url: brand.docsUrl,
    segment: 'docs',
    icon: BookOpen,
    external: true,
  },
  {
    title: 'Memories',
    url: '/memories',
    segment: 'memories',
    icon: Brain,
    external: false,
  },
  {
    title: 'Saved Prompts',
    url: '/saved-prompts',
    segment: 'saved-prompts',
    icon: Bookmark,
    external: false,
  },
  // {
  //     title: "Agents",
  //     url: "/agents",
  //     segment: "agents",
  //     icon: Bot,
  //     external: false,
  // },
  // {
  //     title: "Automations",
  //     url: "/automations",
  //     segment: "automations",
  //     icon: Workflow,
  //     external: false,
  // }
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  const getIsActive = (itemSegment: string) => {
    if (itemSegment === 'home') {
      return pathname === '/home';
    }
    return pathname.startsWith(`/${itemSegment}`);
  };

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="hidden md:flex">
      <AppSidebarHeader />

      <SidebarContent>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Explore</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ExploreItems.filter((item) => item.url).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={getIsActive(item.segment)}
                    >
                      <Link
                        href={item.url}
                        target={item.external ? '_blank' : undefined}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <AppSidebarConversations />
          <AppSidebarAutomations />
        </SidebarContent>
      </SidebarContent>

      <AppSidebarFooter />
    </Sidebar>
  );
}
