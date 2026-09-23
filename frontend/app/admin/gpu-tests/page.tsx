"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Pause,
  BarChart3,
  ImageIcon,
  Filter,
  Download,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface SectionProgress {
  section_id: string;
  test_run_id: string | null;
  status: "pending" | "running" | "completed" | "failed";
  total_batches: number;
  completed_batches: number;
  started_at: string | null;
  completed_at: string | null;
  avg_style_score: number | null;
  avg_theme_score: number | null;
  pass_rate: number | null;
}

interface TestStats {
  totalImages: number;
  successCount: number;
  failedCount: number;
  avgStyleScore: number;
  avgThemeScore: number;
  avgQualityScore: number;
  passRate: number;
}

interface SectionConfig {
  name: string;
  phase: string;
  description: string;
  estimatedTime: string;
  estimatedImages: number;
}

const SECTION_CONFIGS: Record<string, SectionConfig> = {
  A1: { name: "Anime Themes", phase: "A", description: "61 themes x 2 models x 3 styles", estimatedTime: "5h", estimatedImages: 366 },
  A2: { name: "Business Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A3: { name: "Exotic Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A4: { name: "Fantasy Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A5: { name: "Fractal Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A6: { name: "Jobs Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A7: { name: "Nature Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  A8: { name: "Space Themes", phase: "A", description: "50 themes x 2 models x 3 styles", estimatedTime: "4h", estimatedImages: 300 },
  B1: { name: "Artistic Styles - Playground", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B2: { name: "Digital Styles - Playground", phase: "B", description: "7 styles x 102 themes", estimatedTime: "5h", estimatedImages: 714 },
  B3: { name: "Film Styles - Playground", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B4: { name: "Movements Styles - Playground", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B5: { name: "Rendering Styles - Playground", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B6: { name: "Mood Styles - Playground", phase: "B", description: "9 styles x 80 themes", estimatedTime: "5h", estimatedImages: 720 },
  B7: { name: "Artistic Styles - Animagine", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B8: { name: "Digital Styles - Animagine", phase: "B", description: "7 styles x 102 themes", estimatedTime: "5h", estimatedImages: 714 },
  B9: { name: "Film Styles - Animagine", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B10: { name: "Movements Styles - Animagine", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B11: { name: "Rendering Styles - Animagine", phase: "B", description: "10 styles x 72 themes", estimatedTime: "5h", estimatedImages: 720 },
  B12: { name: "Mood Styles - Animagine", phase: "B", description: "9 styles x 80 themes", estimatedTime: "5h", estimatedImages: 720 },
};

export default function GPUTestsPage() {
  const { getReadAuthCredentials } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections] = useState<SectionProgress[]>([]);
  const [stats, setStats] = useState<TestStats | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<string>("all");

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      if (!credentials?.wallet) return;

      // Fetch section progress
      const progressRes = await fetch(`${API_URL}/admin/gpu-tests/progress`, {
        headers: {
          "Content-Type": "application/json",
          "x-wallet": credentials.wallet,
          "x-signature": credentials.signature,
          "x-timestamp": credentials.timestamp.toString(),
        },
      });

      if (progressRes.ok) {
        const data = await progressRes.json();
        setSections(data.sections || []);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("Failed to fetch GPU test data:", err);
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="text-green-600 border-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-500">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="text-red-600 border-red-500">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-gray-500 border-gray-400">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return "bg-green-500";
    if (progress >= 50) return "bg-blue-500";
    if (progress > 0) return "bg-yellow-500";
    return "bg-gray-600";
  };

  const filteredSections = selectedPhase === "all"
    ? Object.keys(SECTION_CONFIGS)
    : Object.keys(SECTION_CONFIGS).filter(id => SECTION_CONFIGS[id].phase === selectedPhase);

  // Merge config with progress data
  const sectionData = filteredSections.map(id => {
    const config = SECTION_CONFIGS[id];
    const progress = sections.find(s => s.section_id === id);
    return {
      id,
      ...config,
      status: progress?.status || "pending",
      completedBatches: progress?.completed_batches || 0,
      totalBatches: progress?.total_batches || 0,
      avgStyleScore: progress?.avg_style_score,
      avgThemeScore: progress?.avg_theme_score,
      passRate: progress?.pass_rate,
    };
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">GPU Test Dashboard</h1>
          <p className="text-muted-foreground">
            Comprehensive style and theme testing with LLaVA validation
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalImages.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Total Images</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.successCount.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Successful</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.failedCount}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.avgStyleScore?.toFixed(1) || "-"}</div>
              <div className="text-sm text-muted-foreground">Avg Style Score</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.avgThemeScore?.toFixed(1) || "-"}</div>
              <div className="text-sm text-muted-foreground">Avg Theme Score</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.avgQualityScore?.toFixed(1) || "-"}</div>
              <div className="text-sm text-muted-foreground">Avg Quality</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.passRate?.toFixed(1) || 0}%</div>
              <div className="text-sm text-muted-foreground">Pass Rate</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Phase Filter */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={selectedPhase} onValueChange={setSelectedPhase}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by phase" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            <SelectItem value="A">Phase A: Theme Coverage</SelectItem>
            <SelectItem value="B">Phase B: Style Coverage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Section Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sectionData.map((section) => {
          const progress = section.totalBatches > 0
            ? (section.completedBatches / section.totalBatches) * 100
            : 0;

          return (
            <Card key={section.id} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                      {section.id}
                    </span>
                    {section.name}
                  </CardTitle>
                  {getStatusBadge(section.status)}
                </div>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getProgressColor(progress)} transition-all`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{section.completedBatches} / {section.totalBatches || "?"} batches</span>
                    <span>~{section.estimatedTime}</span>
                  </div>
                </div>

                {/* Scores */}
                {section.status === "completed" && (
                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-semibold">
                        {section.avgStyleScore?.toFixed(1) || "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">Style</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-semibold">
                        {section.avgThemeScore?.toFixed(1) || "-"}
                      </div>
                      <div className="text-xs text-muted-foreground">Theme</div>
                    </div>
                    <div className="bg-muted/50 rounded p-2">
                      <div className="text-lg font-semibold">
                        {section.passRate?.toFixed(0) || 0}%
                      </div>
                      <div className="text-xs text-muted-foreground">Pass</div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Link href={`/admin/gpu-tests/${section.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Details
                      <ChevronRight className="w-4 h-4 ml-auto" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Running Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Tests are run from the command line. Use the following commands:
          </p>
          <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-2">
            <div># List all available sections</div>
            <div className="text-primary">node backend/scripts/comprehensive-gpu-test.js --list</div>
            <div className="mt-4"># Run a specific section</div>
            <div className="text-primary">node backend/scripts/comprehensive-gpu-test.js --section A1</div>
            <div className="mt-4"># Resume an interrupted section</div>
            <div className="text-primary">node backend/scripts/comprehensive-gpu-test.js --section A1 --resume</div>
            <div className="mt-4"># Preview without generating</div>
            <div className="text-primary">node backend/scripts/comprehensive-gpu-test.js --section A1 --dry-run</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
