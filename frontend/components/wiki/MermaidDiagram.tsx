"use client";

import { useEffect, useRef, useState } from "react";

export function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const renderDiagram = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#8b5cf6",
            primaryTextColor: "#fff",
            primaryBorderColor: "#7c3aed",
            lineColor: "#64748b",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
            background: "#0f172a",
            mainBkg: "#1e293b",
            nodeBkg: "#1e293b",
            nodeBorder: "#475569",
            clusterBkg: "#1e293b",
            clusterBorder: "#475569",
            titleColor: "#f1f5f9",
            edgeLabelBackground: "#1e293b",
            actorTextColor: "#f1f5f9",
            actorBkg: "#1e293b",
            actorBorder: "#8b5cf6",
            signalColor: "#f1f5f9",
            signalTextColor: "#f1f5f9",
            labelBoxBkgColor: "#1e293b",
            labelBoxBorderColor: "#475569",
            labelTextColor: "#f1f5f9",
            loopTextColor: "#f1f5f9",
            noteBorderColor: "#8b5cf6",
            noteBkgColor: "#1e293b",
            noteTextColor: "#f1f5f9",
            activationBorderColor: "#8b5cf6",
            activationBkgColor: "#1e293b",
            sequenceNumberColor: "#fff",
          },
          flowchart: { htmlLabels: true, curve: "basis" },
          sequence: {
            diagramMarginX: 10,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            mirrorActors: true,
            useMaxWidth: true,
          },
        });
        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
        setSvg(svg);
        setError("");
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError("Failed to render diagram");
      }
    };
    renderDiagram();
  }, [chart, id]);

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-slate-900/50 rounded-lg p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
