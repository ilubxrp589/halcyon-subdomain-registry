"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Cpu,
  Workflow,
  Activity,
  RefreshCw,
  Zap,
  ArrowRight,
  Clock,
  Image,
  Globe,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Server,
  Timer,
  Repeat,
} from "lucide-react";

export default function JobQueuePage() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/20 border border-amber-500/30">
            <Workflow className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">Developers</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Background Processing</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          How HSR handles long-running tasks like AI image generation, DNS provisioning,
          blockchain event processing, and scheduled maintenance — all without blocking
          user requests.
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { label: "Direct Processing", color: "bg-green-500/10 text-green-400 border-green-500/20" },
            { label: "Async Generation", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
            { label: "Auto Restart", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
            { label: "Event-Driven", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
            { label: "Scheduled Tasks", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
          ].map((badge) => (
            <span key={badge.label} className={`text-xs px-2.5 py-1 rounded-full border ${badge.color}`}>
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* Architecture Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          Architecture Overview
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          HSR uses a direct processing model — tasks are dispatched immediately to
          the appropriate service without intermediate message brokers. Long-running
          operations like image generation run asynchronously, returning control to the
          user while work completes in the background.
        </p>

        {/* Processing model visual */}
        <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/5 border-amber-500/20">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-4">Request Flow</h4>
            <div className="space-y-3">
              {[
                {
                  badge: "API Request",
                  color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
                  desc: "User action triggers an endpoint (e.g., generate image, register domain)",
                },
                {
                  badge: "Route Handler",
                  color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
                  desc: "Validates input, authenticates wallet, prepares parameters",
                },
                {
                  badge: "Service Layer",
                  color: "bg-green-500/20 text-green-400 border-green-500/30",
                  desc: "Dispatches to appropriate service (ComfyUI, PowerDNS, blockchain, IPFS)",
                },
                {
                  badge: "Response",
                  color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
                  desc: "Returns immediately — long tasks continue in background with status tracking",
                },
              ].map((item, i) => (
                <div key={item.badge}>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono px-2.5 py-1 rounded border ${item.color} w-28 text-center flex-shrink-0`}>
                      {item.badge}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                    <span className="text-zinc-400 text-sm">{item.desc}</span>
                  </div>
                  {i < 3 && (
                    <div className="ml-14 my-1">
                      <div className="w-px h-3 bg-zinc-700 mx-auto" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Background Task Types */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-400" />
          Background Task Types
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          These are the main categories of background work in HSR:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              icon: <Image className="h-5 w-5 text-amber-400" />,
              title: "AI Image Generation",
              desc: "NFT artwork generation dispatched to the GPU cluster via ComfyUI. Each generation runs as a prompt workflow, with the server managing its own internal queue.",
              timing: "10-60 seconds per image",
              color: "border-amber-500/20 from-amber-500/5 to-amber-600/5",
              timingColor: "text-amber-400",
            },
            {
              icon: <Globe className="h-5 w-5 text-cyan-400" />,
              title: "DNS Provisioning",
              desc: "After domain registration, DNS records are created in PowerDNS. Includes SOA zone setup for new TLDs and individual record creation.",
              timing: "1-5 seconds",
              color: "border-cyan-500/20 from-cyan-500/5 to-cyan-600/5",
              timingColor: "text-cyan-400",
            },
            {
              icon: <Zap className="h-5 w-5 text-yellow-400" />,
              title: "Blockchain Events",
              desc: "The contract listener polls for on-chain events (transfers, escrow completions, marketplace activity) and processes them sequentially to maintain ordering.",
              timing: "Continuous polling",
              color: "border-yellow-500/20 from-yellow-500/5 to-yellow-600/5",
              timingColor: "text-yellow-400",
            },
            {
              icon: <Shield className="h-5 w-5 text-blue-400" />,
              title: "IPFS Pinning",
              desc: "NFT metadata and images are pinned to IPFS via Pinata after generation. Ensures permanent decentralized storage of domain artwork.",
              timing: "5-15 seconds",
              color: "border-blue-500/20 from-blue-500/5 to-blue-600/5",
              timingColor: "text-blue-400",
            },
            {
              icon: <RefreshCw className="h-5 w-5 text-orange-400" />,
              title: "Price Synchronization",
              desc: "Periodic sync between the FTSO oracle and the on-chain PriceOracle contract. Updates automatically when price drifts beyond threshold.",
              timing: "Every 5 minutes",
              color: "border-orange-500/20 from-orange-500/5 to-orange-600/5",
              timingColor: "text-orange-400",
            },
            {
              icon: <Server className="h-5 w-5 text-green-400" />,
              title: "TLD Watcher",
              desc: "Monitors the Handshake wallet for new TLD ownership changes and automatically syncs available TLDs in the database.",
              timing: "Periodic polling",
              color: "border-green-500/20 from-green-500/5 to-green-600/5",
              timingColor: "text-green-400",
            },
          ].map((task) => (
            <Card key={task.title} className={`bg-gradient-to-br ${task.color}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{task.icon}</div>
                  <div>
                    <h4 className="text-white text-sm font-medium mb-1">{task.title}</h4>
                    <p className="text-zinc-500 text-xs leading-relaxed mb-2">{task.desc}</p>
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-3 w-3 text-zinc-600" />
                      <span className={`text-[11px] font-mono ${task.timingColor}`}>{task.timing}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Image Generation Pipeline */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Cpu className="h-5 w-5 text-amber-400" />
          Image Generation Pipeline
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          AI image generation is the most complex background task. Here&apos;s how a generation
          request flows through the system:
        </p>

        <Card className="bg-gradient-to-br from-amber-500/5 to-pink-500/5 border-amber-500/20">
          <CardContent className="p-5 space-y-4">
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Request Received",
                  desc: "User triggers generation with domain name, style, and optional custom prompt.",
                },
                {
                  step: "2",
                  title: "Server Selection",
                  desc: "The system selects an available GPU server that is online, not restarting, and has capacity.",
                },
                {
                  step: "3",
                  title: "Workflow Built",
                  desc: "A ComfyUI workflow is constructed with the appropriate model, prompt, and parameters.",
                },
                {
                  step: "4",
                  title: "Prompt Queued",
                  desc: "The workflow is sent to the ComfyUI server's native prompt queue via its REST API.",
                },
                {
                  step: "5",
                  title: "Generation Tracked",
                  desc: "The system polls for completion, then retrieves the generated image from the server.",
                },
                {
                  step: "6",
                  title: "Post-Processing",
                  desc: "Image is watermarked, pinned to IPFS, and metadata is stored in the database.",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <span className="text-amber-400 text-xs font-bold">{item.step}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{item.title}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Parallel generation */}
        <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
          <Zap className="h-5 w-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Parallel Generation</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              When generating multiple images (e.g., 3 style variations), the system dispatches
              to multiple GPU servers simultaneously. Each server processes independently,
              and results are collected as they complete.
            </p>
          </div>
        </div>
      </section>

      {/* GPU Lifecycle Management */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-yellow-400" />
          GPU Lifecycle Management
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          The ComfyUI Manager handles automatic GPU health monitoring and restart scheduling
          to maintain generation quality over time.
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="p-5">
            <h4 className="text-white text-sm font-semibold mb-3">Auto-Restart System</h4>
            <div className="space-y-2">
              {[
                {
                  label: "Generation Threshold",
                  value: "After a configurable number of generations, a GPU is queued for restart",
                  icon: <Repeat className="h-4 w-4 text-yellow-400" />,
                },
                {
                  label: "Staggered Restarts",
                  value: "GPUs restart one at a time to maintain generation capacity during restarts",
                  icon: <Clock className="h-4 w-4 text-blue-400" />,
                },
                {
                  label: "Restart Detection",
                  value: "Before processing, the system checks if a GPU is restarting and routes work elsewhere",
                  icon: <Shield className="h-4 w-4 text-green-400" />,
                },
                {
                  label: "Cooldown Period",
                  value: "After restart, a cooldown prevents immediate re-queuing for restart",
                  icon: <Timer className="h-4 w-4 text-orange-400" />,
                },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/30">
                  <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-white text-sm font-medium">{item.label}</p>
                    <p className="text-zinc-500 text-xs">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Scheduled Services */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-orange-400" />
          Scheduled Services
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Several background services run on intervals to keep the system in sync:
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <span className="text-zinc-500 text-xs font-medium">Service</span>
              <span className="text-zinc-500 text-xs font-medium">Interval</span>
              <span className="text-zinc-500 text-xs font-medium">Purpose</span>
            </div>
            <div className="divide-y divide-zinc-800">
              {[
                { service: "Contract Listener", interval: "Polling", desc: "Monitors on-chain events (transfers, escrow, marketplace)", color: "text-yellow-400" },
                { service: "Price Sync", interval: "5 minutes", desc: "Syncs FTSO price to on-chain PriceOracle", color: "text-orange-400" },
                { service: "TLD Watcher", interval: "Periodic", desc: "Scans Handshake wallet for new TLD ownership", color: "text-green-400" },
                { service: "Domain Reminders", interval: "Daily", desc: "Checks for expiring domains and sends notifications", color: "text-blue-400" },
              ].map((item, i) => (
                <div key={item.service} className={`grid grid-cols-3 px-4 py-3 ${i % 2 === 0 ? "bg-zinc-900/30" : ""}`}>
                  <span className={`text-sm font-medium ${item.color}`}>{item.service}</span>
                  <span className="text-zinc-400 text-sm font-mono">{item.interval}</span>
                  <span className="text-zinc-400 text-xs">{item.desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Error Handling & Resilience */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          Error Handling &amp; Resilience
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          Background tasks are designed to handle failures gracefully without affecting
          the user experience.
        </p>

        <div className="space-y-3">
          {[
            {
              title: "Generation Failures",
              desc: "If a GPU server is unreachable, the system automatically tries the next available server. Failed generations return a clear error to the user.",
              icon: <Cpu className="h-4 w-4 text-amber-400" />,
              color: "border-amber-500/20 from-amber-500/5 to-amber-600/5",
            },
            {
              title: "DNS Provisioning Retries",
              desc: "DNS record creation is retried on transient failures. Zone setup errors are logged and can be manually resolved.",
              icon: <Globe className="h-4 w-4 text-cyan-400" />,
              color: "border-cyan-500/20 from-cyan-500/5 to-cyan-600/5",
            },
            {
              title: "Contract Listener Recovery",
              desc: "The blockchain listener tracks its last processed block. On restart, it catches up from where it left off without missing events.",
              icon: <Zap className="h-4 w-4 text-yellow-400" />,
              color: "border-yellow-500/20 from-yellow-500/5 to-yellow-600/5",
            },
            {
              title: "Service Independence",
              desc: "Each background service runs independently. A failure in image generation does not affect DNS provisioning, blockchain listening, or price sync.",
              icon: <Shield className="h-4 w-4 text-green-400" />,
              color: "border-green-500/20 from-green-500/5 to-green-600/5",
            },
          ].map((item) => (
            <Card key={item.title} className={`bg-gradient-to-br ${item.color}`}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                <div>
                  <h4 className="text-white text-sm font-medium mb-1">{item.title}</h4>
                  <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Default NFT Generation */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Image className="h-5 w-5 text-pink-400" />
          Post-Registration Processing
        </h2>
        <p className="text-zinc-400 leading-relaxed">
          When a domain is registered, several background tasks are triggered automatically:
        </p>

        <Card className="bg-gradient-to-br from-pink-500/5 to-amber-500/5 border-pink-500/20">
          <CardContent className="p-5">
            <div className="space-y-3">
              {[
                {
                  step: "1",
                  title: "Database Record Created",
                  desc: "Domain ownership, tier, and registration date stored in the database.",
                },
                {
                  step: "2",
                  title: "DNS Zone Provisioned",
                  desc: "SOA and initial DNS records created in PowerDNS for the new subdomain.",
                },
                {
                  step: "3",
                  title: "Preview Credits Awarded",
                  desc: "The owner receives preview credits for AI image generation.",
                },
                {
                  step: "4",
                  title: "Default NFT Generated",
                  desc: "A default NFT image is generated asynchronously — the registration response returns immediately without waiting.",
                },
                {
                  step: "5",
                  title: "IPFS Pinning",
                  desc: "The generated image and metadata are pinned to IPFS for permanent storage.",
                },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-pink-500/20 flex items-center justify-center">
                    <span className="text-pink-400 text-xs font-bold">{item.step}</span>
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{item.title}</p>
                    <p className="text-zinc-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 bg-green-500/5 border border-green-500/20 rounded-lg p-4">
          <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-medium">Non-Blocking Registration</p>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Domain registration completes immediately after on-chain confirmation. NFT generation
              and IPFS pinning happen in the background — the user can start using their domain
              right away while their custom artwork is being created.
            </p>
          </div>
        </div>
      </section>

      {/* Related Guides */}
      <div className="border-t border-zinc-800 pt-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Related Guides</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {[
            { title: "Architecture", desc: "System architecture overview", section: "developers", page: "architecture" },
            { title: "Smart Contracts", desc: "On-chain contract reference", section: "developers", page: "smart-contracts" },
            { title: "Flare Network", desc: "Blockchain & FTSO details", section: "concepts", page: "flare-network" },
          ].map((guide) => (
            <div
              key={guide.title}
              className="flex items-center gap-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3"
            >
              <ArrowRight className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-medium">{guide.title}</p>
                <p className="text-zinc-500 text-xs">{guide.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
