"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { getPM2Logs, ReadAuthCredentials } from "@/services/adminApi";

interface PM2LogViewerProps {
  processName: string | null;
  onClose: () => void;
  getCredentials: () => Promise<ReadAuthCredentials>;
}

export function PM2LogViewer({ processName, onClose, getCredentials }: PM2LogViewerProps) {
  const [logs, setLogs] = useState<{ stdout: string; stderr: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (!processName) return;
    setLoading(true);
    try {
      const credentials = await getCredentials();
      const data = await getPM2Logs(processName, credentials);
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (processName) {
      fetchLogs();
    }
  }, [processName]);

  return (
    <Dialog open={!!processName} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Logs: {processName}</DialogTitle>
            <Button size="sm" variant="ghost" onClick={fetchLogs} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0">
          {loading && !logs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <pre className="text-xs font-mono bg-black text-green-400 p-4 rounded-lg overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">
              {logs?.stdout || logs?.stderr || "No logs available"}
              {logs?.stderr && logs?.stdout && (
                <>
                  {"\n\n--- STDERR ---\n\n"}
                  {logs.stderr}
                </>
              )}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PM2LogViewer;
