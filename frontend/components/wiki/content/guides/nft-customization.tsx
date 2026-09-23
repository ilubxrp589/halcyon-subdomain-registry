"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Palette,
  Sparkles,
  Lightbulb,
  ArrowRight,
  PenLine,
  Image as ImageIcon,
  Layers,
  Camera,
  Wand2,
  Monitor,
  Tv,
  Stamp,
  ChevronRight,
  Zap,
  Coins,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

export default function NFTCustomizationContent() {
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Palette className="h-6 w-6 text-amber-400" />
          </div>
          <Badge variant="secondary">Guide</Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">NFT Customization</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">
          Create unique AI-generated artwork for your domain NFT. Choose a model,
          pick a theme, add an optional prompt, select an art style, and apply a watermark
          before minting.
        </p>
      </div>

      {/* Generation Flow Overview */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="p-6">
          <h3 className="text-white font-semibold mb-4">Generation Flow</h3>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[
              { label: "Choose Model", color: "bg-amber-500/20 text-amber-400", icon: <Monitor className="h-3 w-3" /> },
              { label: "Art Style", color: "bg-amber-500/20 text-amber-400", icon: <Wand2 className="h-3 w-3" />, optional: true },
              { label: "Pick Theme", color: "bg-blue-500/20 text-blue-400", icon: <Palette className="h-3 w-3" /> },
              { label: "Add Prompt", color: "bg-green-500/20 text-green-400", icon: <PenLine className="h-3 w-3" />, optional: true },
              { label: "Generate", color: "bg-red-500/20 text-red-400", icon: <Zap className="h-3 w-3" /> },
              { label: "Watermark", color: "bg-cyan-500/20 text-cyan-400", icon: <Stamp className="h-3 w-3" /> },
              { label: "Mint NFT", color: "bg-pink-500/20 text-pink-400", icon: <Sparkles className="h-3 w-3" /> },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${step.color}`}>
                  {step.icon}
                  {step.label}
                  {step.optional && <span className="text-zinc-600 text-[10px]">(opt)</span>}
                </span>
                {i < 6 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="text-center p-3 rounded-lg bg-zinc-800/50">
              <p className="text-2xl font-bold text-white">100+</p>
              <p className="text-zinc-500 text-xs">Curated Themes</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-zinc-800/50">
              <p className="text-2xl font-bold text-white">60</p>
              <p className="text-zinc-500 text-xs">Art Styles</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-zinc-800/50">
              <p className="text-2xl font-bold text-white">34</p>
              <p className="text-zinc-500 text-xs">Watermark Styles</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Model */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            1
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Monitor className="h-5 w-5 text-amber-400" />
            Choose Your Model
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            HSR offers two AI models that produce fundamentally different visual styles.
            Your choice determines which theme categories are available.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="bg-zinc-900/50 border-zinc-800 border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="h-5 w-5 text-blue-400" />
                  <h4 className="text-white font-medium">Playground</h4>
                  <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/30">Photorealistic</Badge>
                </div>
                <p className="text-zinc-500 text-sm mb-3">
                  High-quality photorealistic images with detailed textures, lighting,
                  and depth. Best for realistic scenes and subjects.
                </p>
                <p className="text-zinc-600 text-xs">
                  75 curated themes across Exotic, Fantasy, Space, Fractal, Nature, and Jobs
                </p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900/50 border-zinc-800 border-l-4 border-l-pink-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Tv className="h-5 w-5 text-pink-400" />
                  <h4 className="text-white font-medium">Animagine</h4>
                  <Badge variant="outline" className="text-xs text-pink-400 border-pink-500/30">Anime</Badge>
                </div>
                <p className="text-zinc-500 text-sm mb-3">
                  Stylized anime aesthetic with vibrant colors and expressive characters.
                  Best for anime-style characters, landscapes, and creatures.
                </p>
                <p className="text-zinc-600 text-xs">
                  25+ curated themes across Characters, Landscapes, Sci-Fi, and Creatures
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Step 2: Art Style */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            2
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-amber-400" />
            Select an Art Style
            <Badge variant="outline" className="text-xs text-zinc-500">Optional</Badge>
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Art styles control the rendering technique — how the image is &quot;painted.&quot;
            There are 60 styles across 6 categories. This is separate from themes (what you see)
            and adds a visual filter on top.
          </p>

          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <h4 className="text-white text-sm font-medium flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-amber-400" />
                  Art Style Categories
                  <Badge variant="outline" className="text-xs">60 total</Badge>
                </h4>
              </div>
              <div className="divide-y divide-zinc-800">
                {[
                  { name: "Artistic", color: "text-red-400", desc: "Traditional mediums", examples: "Watercolor, oil painting, pencil sketch, charcoal" },
                  { name: "Digital", color: "text-blue-400", desc: "Digital art", examples: "Pixel art, vector, 3D render, voxel" },
                  { name: "Film", color: "text-amber-400", desc: "Film & photography", examples: "Cinematic, film noir, analog, Polaroid" },
                  { name: "Movements", color: "text-amber-400", desc: "Art movements", examples: "Impressionist, pop art, art nouveau, surrealism" },
                  { name: "Rendering", color: "text-green-400", desc: "Rendering techniques", examples: "Photorealistic, anime, comic book, cel-shaded" },
                  { name: "Mood", color: "text-pink-400", desc: "Mood & atmosphere", examples: "Dark & moody, bright & vibrant, dreamy, ethereal" },
                ].map((cat) => (
                  <div key={cat.name} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${cat.color}`}>{cat.name}</span>
                      <span className="text-zinc-600 text-xs">— {cat.desc}</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{cat.examples}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <p className="text-zinc-500 text-xs w-full mb-1">Popular art styles:</p>
            {[
              "Cinematic", "Watercolor", "Anime", "Cyberpunk",
              "Impressionist", "Photorealistic", "Pop Art", "Dreamy",
              "Film Noir", "Pixel Art", "Ghibli", "Art Nouveau",
            ].map((style) => (
              <Badge key={style} variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                {style}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Step 3: Theme */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            3
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Palette className="h-5 w-5 text-amber-400" />
            Pick a Theme
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Themes define the core subject and composition of your image. There are
            100+ curated themes selected from a library of 350+, organized by category.
          </p>

          {/* Playground Themes */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <h4 className="text-white text-sm font-medium flex items-center gap-2">
                  <Camera className="h-4 w-4 text-blue-400" />
                  Playground Themes
                  <Badge variant="outline" className="text-xs">75 curated</Badge>
                </h4>
              </div>
              <div className="divide-y divide-zinc-800">
                {[
                  { name: "Exotic", count: 30, color: "text-orange-400", examples: "Melting clocks, cyber samurai, ghost forest, neon jellyfish" },
                  { name: "Fantasy", count: 24, color: "text-amber-400", examples: "Crimson moon, emerald dragon, enchanted forest, crystal cave" },
                  { name: "Space", count: 22, color: "text-blue-400", examples: "Nebula nursery, Mars terraforming, black hole, space station" },
                  { name: "Fractal", count: 14, color: "text-pink-400", examples: "Fractal eyes, DMT portal, kaleidoscope, infinite spiral" },
                  { name: "Nature", count: 8, color: "text-green-400", examples: "Nocturnal life, ancient trees, underwater coral, aurora" },
                  { name: "Jobs", count: 2, color: "text-amber-400", examples: "Balloon pilot, deep sea diver" },
                ].map((cat) => (
                  <div key={cat.name} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${cat.color}`}>{cat.name}</span>
                      <span className="text-zinc-600 text-xs">{cat.count} themes</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{cat.examples}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Anime Themes */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <h4 className="text-white text-sm font-medium flex items-center gap-2">
                  <Tv className="h-4 w-4 text-pink-400" />
                  Animagine Themes
                  <Badge variant="outline" className="text-xs">25+ curated</Badge>
                </h4>
              </div>
              <div className="divide-y divide-zinc-800">
                {[
                  { name: "Characters", count: 25, color: "text-pink-400", examples: "Magical girl, samurai spirit, festival night, shadow ninja" },
                  { name: "Landscapes", count: 12, color: "text-green-400", examples: "Cherry blossom, floating islands, bamboo forest, volcanic land" },
                  { name: "Sci-Fi", count: 12, color: "text-cyan-400", examples: "Cyberpunk city, space station, mech warrior, neon district" },
                  { name: "Creatures", count: 12, color: "text-amber-400", examples: "Dragon, kitsune, phoenix, water dragon" },
                ].map((cat) => (
                  <div key={cat.name} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-medium ${cat.color}`}>{cat.name}</span>
                      <span className="text-zinc-600 text-xs">{cat.count} themes</span>
                    </div>
                    <p className="text-zinc-500 text-xs">{cat.examples}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-zinc-500 text-sm">
            You can search themes by name or use the random selection button to discover
            new options. A &quot;Popular&quot; category shows trending themes based on usage.
          </p>
        </div>
      </section>

      {/* Step 4: Custom Prompt */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            4
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <PenLine className="h-5 w-5 text-amber-400" />
            Add a Custom Prompt
            <Badge variant="outline" className="text-xs text-zinc-500">Optional</Badge>
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Optionally describe what you want to see. The prompt adds detail on top of
            your chosen theme. Leave it empty to let the theme speak for itself, or add
            a description to personalize the result.
          </p>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <h4 className="text-white text-sm font-medium mb-3">Prompt Details</h4>
              <div className="space-y-2 text-sm text-zinc-400">
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/50">
                  <span className="text-zinc-500">Max length</span>
                  <span className="text-white font-mono text-xs">350 characters</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/50">
                  <span className="text-zinc-500">Required?</span>
                  <span className="text-green-400 text-xs">No — themes work great on their own</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-zinc-500">AI suggestions</span>
                  <span className="text-zinc-300 text-xs">Describe your domain&apos;s purpose to get ideas</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Good vs Bad Prompts */}
          <div className="grid sm:grid-cols-2 gap-3">
            <Card className="bg-green-500/5 border-green-500/20">
              <CardContent className="p-4">
                <h4 className="text-green-400 text-sm font-medium mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Good Prompts
                </h4>
                <ul className="space-y-2 text-xs text-zinc-400">
                  {[
                    "bigfoot catching a fish by a mountain lake",
                    "golden dragon breathing fire",
                    "astronaut planting a flag on mars",
                    "wolf howling at the moon",
                    "treasure chest overflowing with gold",
                  ].map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">+</span>
                      <span>&quot;{p}&quot;</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="p-4">
                <h4 className="text-red-400 text-sm font-medium mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Avoid These
                </h4>
                <ul className="space-y-2 text-xs text-zinc-400">
                  {[
                    { text: "\"something cool\"", why: "too vague" },
                    { text: "\"neon blue cyberpunk style\"", why: "style words go in style selection" },
                    { text: "\"not ugly, no bad quality\"", why: "negative terms don't work well" },
                    { text: "Real people's names or faces", why: "content policy" },
                  ].map((p) => (
                    <li key={p.text} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">-</span>
                      <span>{p.text} <span className="text-zinc-600">— {p.why}</span></span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-4 flex gap-3">
              <Lightbulb className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-blue-400 text-sm font-medium mb-1">Pro Tip</h4>
                <p className="text-zinc-400 text-xs">
                  Focus on describing <strong className="text-white">what</strong> you want to see, not{" "}
                  <strong className="text-white">how</strong> it should look. The theme and art style
                  handle colors, lighting, and atmosphere. Just say &quot;bigfoot fishing&quot; — not
                  &quot;bigfoot fishing in a green forest with organic textures.&quot;
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Step 5: Watermark */}
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-amber-500/20 text-amber-400 text-sm font-bold">
            5
          </div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Stamp className="h-5 w-5 text-amber-400" />
            Apply a Watermark Style
          </h2>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            After generating your image, choose a watermark style before minting.
            The watermark embeds your domain name into the image with a
            stylized visual treatment. There are 34 watermark styles to choose from.
          </p>
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-4">
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>After generation, your image appears in the preview</li>
                <li>Use the <strong className="text-white">up/down arrows</strong> to cycle through 34 watermark styles</li>
                <li>Each style previews instantly on your image</li>
                <li>The default style is <strong className="text-white">Cinematic</strong></li>
              </ol>
              <p className="text-zinc-500 text-xs mt-3">
                The watermark is permanently applied during finalization and becomes
                part of the NFT metadata stored on IPFS.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Style + Prompt Examples */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          Style + Prompt Examples
        </h2>
        <p className="text-zinc-400 text-sm">
          Your theme sets the scene, your prompt adds the subject, and the art style
          controls the rendering. Here are some combinations:
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              theme: "Cyber Samurai",
              themeColor: "bg-orange-500/20 text-orange-400",
              prompt: "samurai warrior with katana",
              artStyle: "Cinematic",
              result: "A samurai in neon-lit cyberpunk armor, rendered with dramatic film lighting and depth of field",
            },
            {
              theme: "Ancient Trees",
              themeColor: "bg-green-500/20 text-green-400",
              prompt: "golden dragon breathing fire",
              artStyle: "Watercolor",
              result: "A golden dragon among ancient trees, rendered with soft watercolor washes and organic textures",
            },
            {
              theme: "Nebula Nursery",
              themeColor: "bg-blue-500/20 text-blue-400",
              prompt: "astronaut planting a flag",
              artStyle: "Photorealistic",
              result: "An astronaut in a vibrant nebula, hyper-realistic detail on suit textures and cosmic gas clouds",
            },
            {
              theme: "Magical Girl",
              themeColor: "bg-pink-500/20 text-pink-400",
              prompt: "warrior princess with crystal sword",
              artStyle: "Anime",
              result: "An anime magical girl with a crystal blade, cel-shaded with vibrant colors and sparkle effects",
            },
          ].map((ex) => (
            <Card key={ex.theme} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs ${ex.themeColor}`}>{ex.theme}</Badge>
                  <span className="text-zinc-600 text-xs">+</span>
                  <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700">{ex.artStyle}</Badge>
                </div>
                <p className="text-zinc-300 text-sm">
                  <span className="text-zinc-500">Prompt:</span> &quot;{ex.prompt}&quot;
                </p>
                <p className="text-zinc-500 text-xs">{ex.result}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Credits System */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-400" />
          Credits System
        </h2>
        <div className="space-y-4">
          <p className="text-zinc-400 leading-relaxed">
            Each image generation costs 1 credit. You start with free preview credits
            to experiment with different combinations before committing.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: <Zap className="h-5 w-5 text-green-400" />, title: "Free Credits", desc: "Start with 10 free generations to find your perfect look" },
              { icon: <ImageIcon className="h-5 w-5 text-blue-400" />, title: "1 Credit = 1 Image", desc: "Each generation produces one unique image" },
              { icon: <Sparkles className="h-5 w-5 text-amber-400" />, title: "Unique Every Time", desc: "Different seed each generation — no two images alike" },
            ].map((item) => (
              <Card key={item.title} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {item.icon}
                    <h4 className="text-white text-sm font-medium">{item.title}</h4>
                  </div>
                  <p className="text-zinc-500 text-xs">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-zinc-500 text-sm">
            If you use all your free credits, you can purchase additional credits to
            keep experimenting. Generation typically takes 8-12 seconds per image.
          </p>
        </div>
      </section>

      {/* The 5-Step Modal Flow */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Layers className="h-5 w-5 text-amber-400" />
          What Happens in the Modal
        </h2>
        <p className="text-zinc-400 text-sm mb-2">
          When you click &quot;Generate&quot; on the registration page, a modal walks you
          through 5 steps:
        </p>

        <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-800">
              {[
                {
                  step: "1",
                  name: "Configure",
                  color: "text-amber-400",
                  desc: "Choose model, art style, theme, and optional prompt. Hit Generate when ready.",
                },
                {
                  step: "2",
                  name: "Generating",
                  color: "text-blue-400",
                  desc: "Your image is being created on the GPU cluster. Takes 8-12 seconds. Don't navigate away.",
                },
                {
                  step: "3",
                  name: "Select & Preview",
                  color: "text-green-400",
                  desc: "View your image, cycle through watermark styles, or generate more images to compare.",
                },
                {
                  step: "4",
                  name: "Finalizing",
                  color: "text-amber-400",
                  desc: "Your image and metadata are uploaded to IPFS and the NFT is minted on-chain.",
                },
                {
                  step: "5",
                  name: "Success",
                  color: "text-pink-400",
                  desc: "Your domain NFT is minted! View it in your dashboard under My Domains.",
                },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-4 px-4 py-3">
                  <div className={`flex items-center justify-center h-7 w-7 rounded-full bg-zinc-800 text-xs font-bold shrink-0 mt-0.5 ${s.color}`}>
                    {s.step}
                  </div>
                  <div>
                    <h4 className={`text-sm font-medium ${s.color}`}>{s.name}</h4>
                    <p className="text-zinc-500 text-xs mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <p className="text-zinc-500 text-xs">
          Your progress is saved locally — if you close the browser, you can resume
          where you left off within 1 hour.
        </p>
      </section>

      {/* CTA */}
      <Card className="bg-amber-500/5 border-amber-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-white font-semibold mb-1">Ready to create your NFT?</h3>
              <p className="text-zinc-400 text-sm">Search for a subdomain and bring your vision to life</p>
            </div>
            <Link href="/register-v2">
              <Button className="bg-amber-600 hover:bg-amber-700">
                Register Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
