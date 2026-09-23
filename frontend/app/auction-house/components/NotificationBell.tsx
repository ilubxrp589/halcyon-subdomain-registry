"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useWeb3ModalAccount } from "@/lib/web3modal";
import {
  getNotifications,
  markNotificationsRead,
  checkWatchlistNotifications,
  type Notification as NotificationType,
} from "@/services/auctionHouseApi";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";

export default function NotificationBell() {
  const { isConnected } = useWeb3ModalAccount();
  const { getAuthCredentials } = useAuth();
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!isConnected) return;
    try {
      const creds = await getAuthCredentials();
      // Check for new watchlist state changes
      await checkWatchlistNotifications(creds).catch(() => {});
      // Fetch notifications
      const res = await getNotifications(creds, { limit: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // silently fail
    }
  }, [isConnected, getAuthCredentials]);

  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, 60000); // Poll every 60s
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const creds = await getAuthCredentials();
      await markNotificationsRead(creds, { all: true });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      toast.error("Failed to mark notifications read");
    }
  };

  if (!isConnected) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setOpen(!open); if (!open) fetchNotifications(); }}
        className="relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-halcyon-teal/20 bg-background/95 backdrop-blur-sm shadow-xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-halcyon-teal/10">
            <span className="text-xs font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-[10px] text-halcyon-teal hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No notifications yet</p>
          ) : (
            <div className="divide-y divide-halcyon-teal/5">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={`/auction-house/${encodeURIComponent(n.name)}`}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-2 hover:bg-halcyon-teal/5 transition-colors ${!n.read ? "bg-halcyon-teal/3" : ""}`}
                >
                  <p className="text-xs">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
