"use client";

import { useState, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  content?: ReactNode;
}

interface TabGroupProps {
  tabs: Tab[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  children?: (activeTab: string) => ReactNode;
  className?: string;
  tabsClassName?: string;
  contentClassName?: string;
  variant?: "default" | "pills" | "underline";
}

export function TabGroup({
  tabs,
  defaultTab,
  onTabChange,
  children,
  className,
  tabsClassName,
  contentClassName,
  variant = "default",
}: TabGroupProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "");

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const tabStyles = {
    default: {
      container: "flex gap-1 p-1 bg-muted/50 rounded-lg",
      tab: "px-4 py-2 text-sm font-medium rounded-md transition-all",
      active: "bg-background text-foreground shadow-sm",
      inactive: "text-muted-foreground hover:text-foreground hover:bg-background/50",
    },
    pills: {
      container: "flex gap-2 flex-wrap",
      tab: "px-4 py-2 text-sm font-medium rounded-full transition-all border",
      active: "bg-primary text-primary-foreground border-primary",
      inactive: "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
    },
    underline: {
      container: "flex gap-4 border-b border-border",
      tab: "px-1 py-3 text-sm font-medium transition-all border-b-2 -mb-px",
      active: "text-foreground border-primary",
      inactive: "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30",
    },
  };

  const styles = tabStyles[variant];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Tab Headers */}
      <div
        className={cn(styles.container, tabsClassName)}
        role="tablist"
        aria-orientation="horizontal"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              styles.tab,
              activeTab === tab.id ? styles.active : styles.inactive
            )}
          >
            <span className="flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-xs rounded-full",
                    activeTab === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={contentClassName}>
        {children ? (
          children(activeTab)
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              id={`tabpanel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={tab.id}
              hidden={activeTab !== tab.id}
            >
              {tab.content}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Simplified horizontal scrolling tabs for mobile
interface ScrollableTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function ScrollableTabs({
  tabs,
  activeTab,
  onTabChange,
  className,
}: ScrollableTabsProps) {
  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent -mx-4 px-4",
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex-shrink-0 px-4 py-2 text-sm font-medium rounded-full transition-all border whitespace-nowrap",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-2">
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.5 text-xs rounded-full",
                  activeTab === tab.id
                    ? "bg-primary-foreground/20"
                    : "bg-muted"
                )}
              >
                {tab.badge}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
