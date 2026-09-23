"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw, RefreshCw, Cpu, Globe } from "lucide-react";

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  action: () => Promise<void>;
  variant?: "default" | "outline";
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export function QuickActions({ actions }: QuickActionsProps) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);

  const handleAction = async (idx: number) => {
    setLoadingIdx(idx);
    try {
      await actions[idx].action();
    } catch (err) {
      console.error("Quick action failed:", err);
    } finally {
      setLoadingIdx(null);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2">
          {actions.map((action, idx) => (
            <Button
              key={idx}
              variant={action.variant || "outline"}
              className="justify-start"
              onClick={() => handleAction(idx)}
              disabled={loadingIdx !== null}
            >
              {loadingIdx === idx ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <span className="mr-2">{action.icon}</span>
              )}
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default QuickActions;
