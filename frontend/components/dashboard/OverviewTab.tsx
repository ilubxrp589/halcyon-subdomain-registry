"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DomainStatsHero } from "@/components/dashboard/DomainStatsHero";
import {
  Bell,
  BellRing,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
  AlertCircle,
  Clock,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { Notification } from "@/services/api";
import { dismissNotification, markAllNotificationsRead } from "@/services/api";

interface DomainWithExpiry {
  id: number;
  fqdn: string;
  token_id: number;
  expiration_date: string;
  status: string;
  dns_active: boolean;
  resolvedAddress?: string | null;
}

interface OverviewTabProps {
  domains: DomainWithExpiry[];
  stats: {
    total: number;
    active: number;
    dnsConfigured: number;
    walletResolved: number;
    tldCount: number;
  };
  notifications: Notification[];
  notificationCount: number;
  credits: number;
  isLoadingCredits: boolean;
  address: string;
  onDomainClick: (domainId: number) => void;
  onRefresh: () => void;
  onNotificationsChange: (notifications: Notification[]) => void;
  onNotificationCountChange: (count: number) => void;
}

export function OverviewTab({
  domains,
  stats,
  notifications,
  notificationCount,
  credits,
  isLoadingCredits,
  address,
  onDomainClick,
  onRefresh,
  onNotificationsChange,
  onNotificationCountChange,
}: OverviewTabProps) {
  const [showNotifications, setShowNotifications] = useState(false);

  // Domains expiring within 30 days
  const expiringSoon = domains.filter((d) => {
    if (!d.expiration_date) return false;
    const days = Math.ceil(
      (new Date(d.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return days > 0 && days <= 30;
  });

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <DomainStatsHero stats={stats} />

      {/* Credits Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {isLoadingCredits ? "..." : credits}
              </div>
              <div className="text-xs text-muted-foreground">NFT Credits</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expiring Soon Alert */}
      {expiringSoon.length > 0 && (
        <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Expiring Soon
              <Badge variant="outline" className="text-xs">
                {expiringSoon.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiringSoon.map((domain) => {
              const daysLeft = Math.ceil(
                (new Date(domain.expiration_date).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
              );
              const isCritical = daysLeft <= 7;
              return (
                <div
                  key={domain.id}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer hover:bg-secondary/50 transition-colors",
                    isCritical
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-amber-500/30 bg-amber-500/5"
                  )}
                  onClick={() => onDomainClick(domain.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        isCritical ? "bg-red-500" : "bg-amber-500"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{domain.fqdn}</p>
                      <p
                        className={cn(
                          "text-xs",
                          isCritical ? "text-red-400" : "text-amber-400"
                        )}
                      >
                        {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-green-500/50 text-green-400 hover:bg-green-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDomainClick(domain.id);
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Renew
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Notifications Panel */}
      {notifications.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <div className="relative">
                  {notificationCount > 0 ? (
                    <BellRing className="h-5 w-5 text-amber-500" />
                  ) : (
                    <Bell className="h-5 w-5 text-muted-foreground" />
                  )}
                  {notificationCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </span>
                  )}
                </div>
                <CardTitle className="text-base">Notifications</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {notifications.length}
                </Badge>
                {showNotifications ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
              <div className="flex items-center gap-2">
                {notificationCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={async () => {
                      await markAllNotificationsRead(address);
                      onNotificationCountChange(0);
                      onNotificationsChange(
                        notifications.map((n) => ({ ...n, is_read: true }))
                      );
                    }}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          {showNotifications && (
            <CardContent className="pt-0 space-y-2">
              {notifications.map((notif) => {
                const daysLeft = notif.expiration_date
                  ? Math.ceil(
                      (new Date(notif.expiration_date).getTime() - Date.now()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : notif.reminder_days;
                const isCritical = daysLeft <= 7;
                const isWarning = daysLeft > 7 && daysLeft <= 30;

                return (
                  <div
                    key={notif.id}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors",
                      !notif.is_read && "bg-card/80",
                      notif.is_read && "opacity-70",
                      isCritical && "border-red-500/40 bg-red-500/5",
                      isWarning && "border-amber-500/30 bg-amber-500/5",
                      !isCritical && !isWarning && "border-blue-500/20 bg-blue-500/5"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          isCritical && "bg-red-500",
                          isWarning && "bg-amber-500",
                          !isCritical && !isWarning && "bg-blue-500"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{notif.fqdn}</p>
                        <p
                          className={cn(
                            "text-xs",
                            isCritical
                              ? "text-red-400"
                              : isWarning
                                ? "text-amber-400"
                                : "text-blue-400"
                          )}
                        >
                          {daysLeft <= 0
                            ? "Expired"
                            : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={async () => {
                        await dismissNotification(notif.id);
                        onNotificationsChange(
                          notifications.filter((n) => n.id !== notif.id)
                        );
                        if (!notif.is_read) {
                          onNotificationCountChange(
                            Math.max(0, notificationCount - 1)
                          );
                        }
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Quick Summary */}
      {domains.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No domains yet. Register your first domain to get started.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
