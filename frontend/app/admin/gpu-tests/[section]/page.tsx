"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
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
  ArrowLeft,
  Download,
  Filter,
  ImageIcon,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface TestResult {
  id: number;
  test_run_id: string;
  section_id: string;
  batch_number: number;
  model: string;
  theme_id: string;
  theme_category: string;
  style_id: string | null;
  style_category: string | null;
  prompt: string;
  image_path: string | null;
  generation_time_ms: number;
  gpu_server: string;
  llava_style_score: number | null;
  llava_theme_score: number | null;
  llava_prompt_score: number | null;
  llava_quality_score: number | null;
  llava_reasoning: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

interface SectionStats {
  totalImages: number;
  successCount: number;
  failedCount: number;
  avgStyleScore: number | null;
  avgThemeScore: number | null;
  avgQualityScore: number | null;
  passRate: number;
  byModel: Record<string, { count: number; avgScore: number }>;
  byThemeCategory: Record<string, { count: number; avgScore: number }>;
  byStyleCategory: Record<string, { count: number; avgScore: number }>;
}

export default function SectionDetailPage() {
  const params = useParams();
  const sectionId = (params.section as string)?.toUpperCase();

  const { getReadAuthCredentials } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [stats, setStats] = useState<SectionStats | null>(null);
  const [selectedImage, setSelectedImage] = useState<TestResult | null>(null);

  // Filters
  const [filterModel, setFilterModel] = useState<string>("all");
  const [filterThemeCategory, setFilterThemeCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterMinScore, setFilterMinScore] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 50;

  const getCredentialsRef = useRef(getReadAuthCredentials);
  getCredentialsRef.current = getReadAuthCredentials;

  const fetchData = useCallback(async () => {
    try {
      const credentials = await getCredentialsRef.current();
      if (!credentials?.wallet) return;

      // Build query params
      const queryParams = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      if (filterModel !== "all") queryParams.append("model", filterModel);
      if (filterThemeCategory !== "all") queryParams.append("themeCategory", filterThemeCategory);
      if (filterStatus !== "all") queryParams.append("success", filterStatus === "success" ? "true" : "false");
      if (filterMinScore !== "all") queryParams.append("minScore", filterMinScore);

      // Fetch results
      const resultsRes = await fetch(
        `${API_URL}/admin/gpu-tests/results/${sectionId}?${queryParams}`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-wallet": credentials.wallet,
            "x-signature": credentials.signature,
            "x-timestamp": credentials.timestamp.toString(),
          },
        }
      );

      if (resultsRes.ok) {
        const data = await resultsRes.json();
        setResults(data.results || []);
        setStats(data.stats || null);
        setTotalPages(Math.ceil((data.total || 0) / pageSize));
      }
    } catch (err) {
      console.error("Failed to fetch section data:", err);
    }
  }, [sectionId, page, filterModel, filterThemeCategory, filterStatus, filterMinScore]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return "text-gray-500";
    if (score >= 8) return "text-green-500";
    if (score >= 6) return "text-blue-500";
    if (score >= 4) return "text-yellow-500";
    return "text-red-500";
  };

  const exportCSV = () => {
    if (!results.length) return;

    const headers = [
      "ID", "Model", "Theme ID", "Theme Category", "Style ID", "Style Category",
      "Style Score", "Theme Score", "Quality Score", "Success", "Error", "Created At"
    ];

    const rows = results.map(r => [
      r.id,
      r.model,
      r.theme_id,
      r.theme_category,
      r.style_id || "",
      r.style_category || "",
      r.llava_style_score || "",
      r.llava_theme_score || "",
      r.llava_quality_score || "",
      r.success,
      r.error || "",
      r.created_at,
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gpu-test-${sectionId}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        <div className="flex items-center gap-4">
          <Link href="/admin/gpu-tests">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Section {sectionId}</h1>
            <p className="text-muted-foreground">
              Detailed test results and analysis
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.totalImages}</div>
              <div className="text-sm text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.successCount}</div>
              <div className="text-sm text-muted-foreground">Success</div>
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
              <div className={`text-2xl font-bold ${getScoreColor(stats.avgStyleScore)}`}>
                {stats.avgStyleScore?.toFixed(1) || "-"}
              </div>
              <div className="text-sm text-muted-foreground">Avg Style</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${getScoreColor(stats.avgThemeScore)}`}>
                {stats.avgThemeScore?.toFixed(1) || "-"}
              </div>
              <div className="text-sm text-muted-foreground">Avg Theme</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${getScoreColor(stats.avgQualityScore)}`}>
                {stats.avgQualityScore?.toFixed(1) || "-"}
              </div>
              <div className="text-sm text-muted-foreground">Avg Quality</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.passRate.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground">Pass Rate</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={filterModel} onValueChange={(v) => { setFilterModel(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="sdxl-playground-lora">Playground</SelectItem>
                <SelectItem value="sdxl-animagine">Animagine</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterThemeCategory} onValueChange={(v) => { setFilterThemeCategory(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Theme Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="anime">Anime</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="exotic">Exotic</SelectItem>
                <SelectItem value="fantasy">Fantasy</SelectItem>
                <SelectItem value="fractal">Fractal</SelectItem>
                <SelectItem value="jobs">Jobs</SelectItem>
                <SelectItem value="nature">Nature</SelectItem>
                <SelectItem value="space">Space</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success Only</SelectItem>
                <SelectItem value="failed">Failed Only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMinScore} onValueChange={(v) => { setFilterMinScore(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Min Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Score</SelectItem>
                <SelectItem value="8">8+ (Excellent)</SelectItem>
                <SelectItem value="6">6+ (Good)</SelectItem>
                <SelectItem value="5">5+ (Pass)</SelectItem>
                <SelectItem value="4">&lt;5 (Fail)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
          <CardDescription>
            {results.length} results on page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Theme</th>
                  <th className="text-left py-3 px-4 font-medium">Style</th>
                  <th className="text-left py-3 px-4 font-medium">Model</th>
                  <th className="text-center py-3 px-4 font-medium">Style</th>
                  <th className="text-center py-3 px-4 font-medium">Theme</th>
                  <th className="text-center py-3 px-4 font-medium">Quality</th>
                  <th className="text-center py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">GPU</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr
                    key={result.id}
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedImage(result)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium">{result.theme_id}</div>
                      <div className="text-xs text-muted-foreground">{result.theme_category}</div>
                    </td>
                    <td className="py-3 px-4">
                      {result.style_id ? (
                        <div>
                          <div className="font-medium">{result.style_id}</div>
                          <div className="text-xs text-muted-foreground">{result.style_category}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">default</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={result.model.includes("animagine") ? "secondary" : "default"}>
                        {result.model.includes("animagine") ? "Animagine" : "Playground"}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${getScoreColor(result.llava_style_score)}`}>
                        {result.llava_style_score || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${getScoreColor(result.llava_theme_score)}`}>
                        {result.llava_theme_score || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`font-bold ${getScoreColor(result.llava_quality_score)}`}>
                        {result.llava_quality_score || "-"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {result.success ? (
                        <CheckCircle className="w-4 h-4 text-green-500 inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 inline" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {result.gpu_server}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Image Detail Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setSelectedImage(null)}
        >
          <Card className="max-w-4xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {selectedImage.theme_id}
                  {selectedImage.style_id && ` - ${selectedImage.style_id}`}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedImage(null)}>
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                {/* Image placeholder - would show actual image if available */}
                <div className="bg-muted rounded-lg aspect-square flex items-center justify-center">
                  {selectedImage.image_path ? (
                    <div className="text-center">
                      <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Image saved to disk
                      </p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {selectedImage.image_path}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                      No image available
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Model</label>
                      <p className="font-medium">{selectedImage.model}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">GPU Server</label>
                      <p className="font-medium">{selectedImage.gpu_server}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Theme Category</label>
                      <p className="font-medium">{selectedImage.theme_category}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Style Category</label>
                      <p className="font-medium">{selectedImage.style_category || "default"}</p>
                    </div>
                  </div>

                  {/* Scores */}
                  <div>
                    <label className="text-sm text-muted-foreground">LLaVA Scores</label>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <div className="bg-muted rounded p-2 text-center">
                        <div className={`text-xl font-bold ${getScoreColor(selectedImage.llava_style_score)}`}>
                          {selectedImage.llava_style_score || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">Style</div>
                      </div>
                      <div className="bg-muted rounded p-2 text-center">
                        <div className={`text-xl font-bold ${getScoreColor(selectedImage.llava_theme_score)}`}>
                          {selectedImage.llava_theme_score || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">Theme</div>
                      </div>
                      <div className="bg-muted rounded p-2 text-center">
                        <div className={`text-xl font-bold ${getScoreColor(selectedImage.llava_prompt_score)}`}>
                          {selectedImage.llava_prompt_score || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">Prompt</div>
                      </div>
                      <div className="bg-muted rounded p-2 text-center">
                        <div className={`text-xl font-bold ${getScoreColor(selectedImage.llava_quality_score)}`}>
                          {selectedImage.llava_quality_score || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">Quality</div>
                      </div>
                    </div>
                  </div>

                  {/* Prompt */}
                  <div>
                    <label className="text-sm text-muted-foreground">Prompt</label>
                    <p className="text-sm bg-muted rounded p-2 mt-1">{selectedImage.prompt}</p>
                  </div>

                  {/* LLaVA Reasoning */}
                  {selectedImage.llava_reasoning && (
                    <div>
                      <label className="text-sm text-muted-foreground">LLaVA Analysis</label>
                      <div className="text-sm bg-muted rounded p-2 mt-1 max-h-40 overflow-auto">
                        {(() => {
                          try {
                            const reasoning = JSON.parse(selectedImage.llava_reasoning);
                            return (
                              <pre className="whitespace-pre-wrap text-xs">
                                {JSON.stringify(reasoning, null, 2)}
                              </pre>
                            );
                          } catch {
                            return selectedImage.llava_reasoning;
                          }
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {selectedImage.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded p-2">
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">Error</span>
                      </div>
                      <p className="text-sm mt-1">{selectedImage.error}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
