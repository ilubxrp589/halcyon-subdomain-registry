"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Wallet,
  Copy,
  Check,
  Bell,
  Save,
  Globe,
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Mail,
  Loader2,
} from "lucide-react";
import { truncateAddress } from "@/lib/utils";
import type { Notification, ApiKey, AuthCredentials, EmailStatus, EmailPreferences, DomainDefaults } from "@/services/api";
import { markAllNotificationsRead, getApiKeys, createApiKey, revokeApiKey, getEmailStatus, registerEmail, updateEmailPreferences, deleteEmailRegistration, getDomainDefaults, saveDomainDefaults } from "@/services/api";

interface SettingsTabProps {
  wallet: string;
  notifications: Notification[];
  notificationCount: number;
  onMarkAllRead: () => void;
  onNotificationsChange: (notifications: Notification[]) => void;
  onNotificationCountChange: (count: number) => void;
  currencySymbol: string;
  getAuthCredentials?: () => Promise<AuthCredentials>;
}

interface LocalDomainDefaults {
  ipv4: string;
  ipv6: string;
  cname: string;
  txt: string;
  defaultLayout: string;
  autoApply: boolean;
}

const DEFAULT_DOMAIN_DEFAULTS: LocalDomainDefaults = {
  ipv4: "",
  ipv6: "",
  cname: "",
  txt: "",
  defaultLayout: "standard",
  autoApply: true,
};

export function SettingsTab({
  wallet,
  notifications,
  notificationCount,
  onMarkAllRead,
  onNotificationsChange,
  onNotificationCountChange,
  currencySymbol,
  getAuthCredentials,
}: SettingsTabProps) {
  const [copied, setCopied] = useState(false);
  const [defaults, setDefaults] = useState<LocalDomainDefaults>(DEFAULT_DOMAIN_DEFAULTS);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsSaving, setDefaultsSaving] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<number | null>(null);

  // Email state
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState(false);

  // Don't auto-load authenticated data on mount - user must click to load
  // This avoids CSP issues with WalletConnect iframe blocking

  const loadDomainDefaults = async () => {
    if (!getAuthCredentials) return;
    setDefaultsLoading(true);
    try {
      const creds = await getAuthCredentials();
      const data = await getDomainDefaults(creds);
      setDefaults({
        ipv4: data.ipv4 || "",
        ipv6: data.ipv6 || "",
        cname: data.cname || "",
        txt: data.txt || "",
        defaultLayout: data.defaultLayout || "standard",
        autoApply: data.autoApply !== false,
      });
      setDefaultsLoaded(true);
    } catch {
      // Silently fail - defaults table may not exist yet
      setDefaultsLoaded(true); // Mark as loaded even on error so UI shows form
    } finally {
      setDefaultsLoading(false);
    }
  };

  const loadApiKeys = async () => {
    if (!getAuthCredentials) return;
    setApiKeysLoading(true);
    try {
      const creds = await getAuthCredentials();
      const keys = await getApiKeys(creds);
      setApiKeys(keys);
    } catch {
      // Silently fail - table may not exist yet
    } finally {
      setApiKeysLoading(false);
    }
  };

  const loadEmailStatus = async () => {
    if (!getAuthCredentials) return;
    setEmailLoading(true);
    try {
      const creds = await getAuthCredentials();
      const status = await getEmailStatus(creds);
      setEmailStatus(status);
    } catch {
      // Silently fail - email system may not be available
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailRegister = async () => {
    if (!getAuthCredentials || !newEmail) return;
    setEmailSubmitting(true);
    setEmailMessage(null);
    try {
      const creds = await getAuthCredentials();
      const result = await registerEmail(creds, newEmail);
      setEmailMessage({ type: "success", text: result.message });
      setNewEmail("");
      await loadEmailStatus();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to register email";
      setEmailMessage({ type: "error", text: message });
    } finally {
      setEmailSubmitting(false);
    }
  };

  const handleEmailPreferenceChange = async (key: keyof EmailPreferences, value: boolean) => {
    if (!getAuthCredentials || !emailStatus?.registered) return;
    try {
      const creds = await getAuthCredentials();
      const result = await updateEmailPreferences(creds, { [key]: value });
      if (result.success) {
        setEmailStatus((prev) =>
          prev ? { ...prev, preferences: result.preferences } : prev
        );
      }
    } catch {
      // Silently fail - preference update failed
    }
  };

  const handleDeleteEmail = async () => {
    if (!getAuthCredentials) return;
    try {
      const creds = await getAuthCredentials();
      await deleteEmailRegistration(creds);
      setEmailStatus({ registered: false });
      setDeleteEmailConfirm(false);
      setEmailMessage({ type: "success", text: "Email registration deleted" });
    } catch {
      setEmailMessage({ type: "error", text: "Failed to delete email" });
    }
  };

  const handleCreateKey = async () => {
    if (!getAuthCredentials) return;
    setCreating(true);
    try {
      const creds = await getAuthCredentials();
      const result = await createApiKey(creds, newKeyLabel || "My API Key");
      setNewlyCreatedKey(result.key);
      setNewKeyLabel("");
      await loadApiKeys();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create key";
      alert(message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (keyId: number) => {
    if (!getAuthCredentials) return;
    try {
      const creds = await getAuthCredentials();
      await revokeApiKey(creds, keyId);
      setRevokeConfirm(null);
      await loadApiKeys();
    } catch {
      alert("Failed to revoke key");
    }
  };

  const copyNewKey = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const copyWallet = () => {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDefaults = async () => {
    if (!getAuthCredentials) return;
    setDefaultsSaving(true);
    try {
      const creds = await getAuthCredentials();
      await saveDomainDefaults(creds, defaults);
      setDefaultsSaved(true);
      setTimeout(() => setDefaultsSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save defaults:", err);
    } finally {
      setDefaultsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Connected Wallet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Connected Wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 font-mono text-sm bg-secondary/50 p-3 rounded-lg break-all">
              {wallet}
            </div>
            <Button variant="outline" size="sm" onClick={copyWallet}>
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5" />
              <span>Flare Coston2 Testnet</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notifications
            {notificationCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {notificationCount} unread
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You receive automatic expiry reminders at 30, 7, and 1 day intervals.
          </p>

          {notificationCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await markAllNotificationsRead(wallet);
                onNotificationCountChange(0);
                onNotificationsChange(
                  notifications.map((n) => ({ ...n, is_read: true }))
                );
                onMarkAllRead();
              }}
            >
              Mark All Read ({notificationCount})
            </Button>
          )}

          {/* Notification History */}
          {notifications.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className="flex items-center justify-between p-2 rounded border text-sm"
                >
                  <div>
                    <span className="font-medium">{notif.fqdn}</span>
                    <span className="text-muted-foreground ml-2">
                      {notif.reminder_days}d reminder
                    </span>
                  </div>
                  <Badge variant={notif.is_read ? "secondary" : "default"} className="text-xs">
                    {notif.is_read ? "Read" : "Unread"}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {notifications.length === 0 && (
            <p className="text-sm text-muted-foreground">No notifications.</p>
          )}
        </CardContent>
      </Card>

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading email settings...
            </div>
          ) : emailStatus === null ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Click below to load your email notification settings.
              </p>
              <Button size="sm" variant="outline" onClick={loadEmailStatus} disabled={!getAuthCredentials}>
                <Mail className="h-4 w-4 mr-2" />
                Load Email Settings
              </Button>
            </div>
          ) : !emailStatus?.registered ? (
            <>
              <p className="text-sm text-muted-foreground">
                Subscribe to receive email notifications for domain registrations, marketplace activity, and renewal reminders.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={handleEmailRegister}
                  disabled={emailSubmitting || !newEmail}
                >
                  {emailSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Subscribe"
                  )}
                </Button>
              </div>
              {emailMessage && (
                <p className={`text-sm ${emailMessage.type === "success" ? "text-green-400" : "text-red-400"}`}>
                  {emailMessage.text}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{emailStatus.email}</span>
                    {emailStatus.verified ? (
                      <Badge variant="default" className="text-xs bg-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Pending Verification
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {!emailStatus.verified && (
                <p className="text-sm text-amber-400">
                  Please check your inbox and verify your email to receive notifications.
                </p>
              )}

              {emailStatus.verified && emailStatus.preferences && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Registration Confirmations</Label>
                      <p className="text-xs text-muted-foreground">Get notified when you register a domain</p>
                    </div>
                    <Switch
                      checked={emailStatus.preferences.registration}
                      onCheckedChange={(v) => handleEmailPreferenceChange("registration", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Marketplace Activity</Label>
                      <p className="text-xs text-muted-foreground">Bids, offers, and sales on your domains</p>
                    </div>
                    <Switch
                      checked={emailStatus.preferences.marketplace}
                      onCheckedChange={(v) => handleEmailPreferenceChange("marketplace", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Renewal Reminders</Label>
                      <p className="text-xs text-muted-foreground">Alerts when domains are about to expire</p>
                    </div>
                    <Switch
                      checked={emailStatus.preferences.renewal}
                      onCheckedChange={(v) => handleEmailPreferenceChange("renewal", v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Marketing & Updates</Label>
                      <p className="text-xs text-muted-foreground">News about new features and promotions</p>
                    </div>
                    <Switch
                      checked={emailStatus.preferences.marketing}
                      onCheckedChange={(v) => handleEmailPreferenceChange("marketing", v)}
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border">
                {deleteEmailConfirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Delete email?</span>
                    <Button variant="destructive" size="sm" onClick={handleDeleteEmail}>
                      Confirm
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteEmailConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteEmailConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove Email
                  </Button>
                )}
              </div>

              {emailMessage && (
                <p className={`text-sm ${emailMessage.type === "success" ? "text-green-400" : "text-red-400"}`}>
                  {emailMessage.text}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Domain Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save className="h-4 w-4" />
            Domain Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {defaultsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading defaults...
            </div>
          ) : !defaultsLoaded ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Set default DNS records that automatically apply when you register new domains.
              </p>
              <Button size="sm" variant="outline" onClick={loadDomainDefaults} disabled={!getAuthCredentials}>
                <Save className="h-4 w-4 mr-2" />
                Load Domain Defaults
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Set default DNS records that automatically apply when you register new domains.
              </p>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <div>
                  <Label className="text-sm">Auto-Apply on Registration</Label>
                  <p className="text-xs text-muted-foreground">Automatically configure DNS for new domains</p>
                </div>
                <Switch
                  checked={defaults.autoApply}
                  onCheckedChange={(v) => setDefaults({ ...defaults, autoApply: v })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="default-ipv4">Default A Record (IPv4)</Label>
                  <Input
                    id="default-ipv4"
                    placeholder="192.168.1.1"
                    value={defaults.ipv4}
                    onChange={(e) => setDefaults({ ...defaults, ipv4: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-ipv6">Default AAAA Record (IPv6)</Label>
                  <Input
                    id="default-ipv6"
                    placeholder="2001:db8::1"
                    value={defaults.ipv6}
                    onChange={(e) => setDefaults({ ...defaults, ipv6: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-cname">Default CNAME Record</Label>
                  <Input
                    id="default-cname"
                    placeholder="example.com"
                    value={defaults.cname}
                    onChange={(e) => setDefaults({ ...defaults, cname: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default-txt">Default TXT Record</Label>
                  <Input
                    id="default-txt"
                    placeholder="v=spf1 include:..."
                    value={defaults.txt}
                    onChange={(e) => setDefaults({ ...defaults, txt: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Default Profile Layout</Label>
                <div className="flex gap-2">
                  {["standard", "minimal", "card"].map((l) => (
                    <Button
                      key={l}
                      variant={defaults.defaultLayout === l ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDefaults({ ...defaults, defaultLayout: l })}
                    >
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <Button onClick={saveDefaults} disabled={defaultsSaving}>
                {defaultsSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : defaultsSaved ? (
                  <>
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Defaults
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Create API keys for programmatic access. Keys are shown only once after creation.
          </p>

          {/* Newly created key banner */}
          {newlyCreatedKey && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-green-400">
                Key created! Copy it now — it won't be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-secondary/50 p-2 rounded break-all">
                  {newlyCreatedKey}
                </code>
                <Button variant="outline" size="sm" onClick={copyNewKey}>
                  {keyCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setNewlyCreatedKey(null)}>
                Dismiss
              </Button>
            </div>
          )}

          {/* Create new key */}
          {apiKeys.length < 5 && getAuthCredentials && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Key label (optional)"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                className="max-w-xs"
              />
              <Button size="sm" onClick={handleCreateKey} disabled={creating}>
                <Plus className="h-4 w-4 mr-1" />
                {creating ? "Creating..." : "Generate Key"}
              </Button>
            </div>
          )}
          {apiKeys.length >= 5 && (
            <p className="text-sm text-amber-400">Maximum 5 keys reached. Revoke a key to create a new one.</p>
          )}

          {/* Key list */}
          {apiKeysLoading ? (
            <p className="text-sm text-muted-foreground">Loading keys...</p>
          ) : apiKeys.length > 0 ? (
            <div className="space-y-2">
              {apiKeys.map((k) => {
                const usagePercent = k.daily_limit > 0 ? Math.min(100, (k.requests_today / k.daily_limit) * 100) : 0;
                return (
                  <div key={k.id} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/20">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{k.label}</span>
                        <Badge variant="secondary" className="text-xs uppercase">
                          {k.tier}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                        {k.last_request_at && (
                          <span>Last used {new Date(k.last_request_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      {/* Usage bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-secondary rounded-full max-w-40">
                          <div
                            className={`h-full rounded-full ${usagePercent > 80 ? "bg-amber-500" : "bg-amber-500"}`}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {k.requests_today}/{k.daily_limit} today
                        </span>
                      </div>
                    </div>
                    <div>
                      {revokeConfirm === k.id ? (
                        <div className="flex items-center gap-1">
                          <Button variant="destructive" size="sm" onClick={() => handleRevokeKey(k.id)}>
                            Confirm
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRevokeConfirm(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setRevokeConfirm(k.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
