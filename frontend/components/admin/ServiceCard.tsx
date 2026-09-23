"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "./StatusIndicator";
import { Loader2, Play, Square, RefreshCw } from "lucide-react";

type ServiceStatus = "running" | "stopped" | "error" | "unknown";

interface ServiceAction {
  label: string;
  action: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface ServiceCardProps {
  name: string;
  description?: string;
  status: ServiceStatus;
  details?: { label: string; value: string | number }[];
  actions?: ServiceAction[];
  onAction?: (action: string) => Promise<void>;
  icon?: React.ReactNode;
}

export function ServiceCard({
  name,
  description,
  status,
  details = [],
  actions = [],
  onAction,
  icon,
}: ServiceCardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (action: string) => {
    if (!onAction) return;

    setLoadingAction(action);
    try {
      await onAction(action);
    } catch (error) {
      console.error(`Action ${action} failed:`, error);
    } finally {
      setLoadingAction(null);
    }
  };

  // Default actions based on status
  const defaultActions: ServiceAction[] = [];
  if (status === "stopped" && onAction) {
    defaultActions.push({
      label: "Start",
      action: "start",
      icon: <Play className="w-4 h-4" />,
    });
  }
  if (status === "running" && onAction) {
    defaultActions.push({
      label: "Stop",
      action: "stop",
      variant: "destructive",
      icon: <Square className="w-4 h-4" />,
    });
  }

  const allActions = [...defaultActions, ...actions];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                {icon}
              </div>
            )}
            <div>
              <CardTitle className="text-lg">{name}</CardTitle>
              {description && (
                <CardDescription>{description}</CardDescription>
              )}
            </div>
          </div>
          <StatusIndicator status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Details */}
        {details.length > 0 && (
          <div className="space-y-2">
            {details.map((detail, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{detail.label}</span>
                <span className="font-mono">{detail.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        {allActions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {allActions.map((actionItem) => (
              <Button
                key={actionItem.action}
                size="sm"
                variant={actionItem.variant || "outline"}
                onClick={() => handleAction(actionItem.action)}
                disabled={loadingAction !== null || actionItem.disabled}
              >
                {loadingAction === actionItem.action ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  actionItem.icon && <span className="mr-2">{actionItem.icon}</span>
                )}
                {actionItem.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ServiceCard;
