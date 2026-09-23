"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Palette,
  Sparkles,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  PenLine,
} from "lucide-react";
import Link from "next/link";

// Style categories with their styles
const STYLE_CATEGORIES = [
  {
    name: "General Styles",
    badge: "bg-amber-600",
    styles: [
      { id: "cyberpunk", desc: "Neon lights, futuristic tech & dark city vibes" },
      { id: "nature", desc: "Organic elements, lush greenery & earth tones" },
      { id: "corporate", desc: "Clean professional, minimalist business aesthetic" },
      { id: "retro", desc: "80s synthwave, neon pink/blue & nostalgic vibes" },
      { id: "minimalist", desc: "Clean lines, negative space & modern design" },
      { id: "fantasy", desc: "Magical elements, ethereal glow & mystical atmosphere" },
      { id: "industrial", desc: "Metallic textures, gears & steampunk aesthetic" },
      { id: "cosmic", desc: "Space elements, stars, galaxies & nebula colors" },
      { id: "abstract", desc: "Bold geometric shapes, modern art & vibrant colors" },
      { id: "elegant", desc: "Sophisticated gold accents & luxury premium feel" },
    ],
  },
  {
    name: "Business Styles",
    badge: "bg-blue-600",
    styles: [
      { id: "tech", desc: "Digital interface, code elements & circuit patterns" },
      { id: "food", desc: "Appetizing colors, warm lighting & culinary art" },
      { id: "medical", desc: "Clean clinical white, healing energy & trust" },
      { id: "finance", desc: "Wealth aesthetic, charts/graphs & prosperity" },
      { id: "realestate", desc: "Architectural elements & property showcase" },
      { id: "ecommerce", desc: "Shopping elements, product display & vibrant commerce" },
      { id: "gaming", desc: "Game UI elements, action dynamic & RGB lighting" },
      { id: "education", desc: "Books, knowledge & learning environment" },
      { id: "travel", desc: "Wanderlust aesthetic, landmarks & adventure vibes" },
      { id: "fitness", desc: "Athletic energy, motion blur & strength" },
    ],
  },
];

export default function NFTCustomizationPage() {
  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <Badge variant="outline" className="mb-4">Customization</Badge>
        <h1 className="text-4xl font-bold mb-4">NFT Visual Styles & Custom Prompts</h1>
        <p className="text-xl text-muted-foreground">
          Create unique NFT artwork by describing your subject and choosing a visual style
        </p>
      </div>

      {/* How It Works Overview */}
      <section>
        <h2 className="text-2xl font-bold mb-4">How NFT Generation Works</h2>
        <p className="text-muted-foreground mb-6">
          Creating your NFT is a two-step process: First, describe <strong className="text-foreground">what</strong> you want to see,
          then choose <strong className="text-foreground">how</strong> it should look.
        </p>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <Card className="border-primary">
            <CardContent className="pt-6 text-center">
              <PenLine className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">1. Describe Your Subject</h4>
              <p className="text-sm text-muted-foreground">
                <strong>Required:</strong> Tell us what you want to see (e.g., &quot;bigfoot catching a fish&quot;)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Palette className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">2. Choose a Style</h4>
              <p className="text-sm text-muted-foreground">
                Pick from 20 visual styles that define the look and atmosphere
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold">3. Preview & Refine</h4>
              <p className="text-sm text-muted-foreground">
                10 free preview credits to get it perfect
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Key Change Notice */}
      <section>
        <Card className="bg-yellow-500/10 border-yellow-500/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-lg mb-2">Important: Custom Prompt is Now Required</h3>
                <p className="text-muted-foreground mb-3">
                  You must describe your subject to generate NFT artwork. The style you choose will enhance how your subject looks,
                  but won&apos;t define what it is.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <Card className="bg-green-500/10 border-green-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium text-green-600 mb-2">Correct</p>
                      <p className="text-sm">
                        Prompt: &quot;bigfoot catching a fish by a mountain lake&quot;<br/>
                        Style: Nature
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Result: Bigfoot fishing, rendered with organic elements, lush greenery, and earth tones
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-red-500/10 border-red-500/30">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium text-red-600 mb-2">Won&apos;t Work</p>
                      <p className="text-sm">
                        Prompt: (empty)<br/>
                        Style: Nature
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Error: You must describe what you want to see
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Examples */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Style + Prompt Examples</h2>
        <p className="text-muted-foreground mb-6">
          Your prompt describes the subject. The style determines its visual treatment.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <Badge className="bg-amber-600 mb-3">Cyberpunk</Badge>
              <div className="space-y-2 text-sm">
                <p><strong>Prompt:</strong> &quot;samurai warrior with katana&quot;</p>
                <p className="text-muted-foreground">
                  Result: A samurai rendered with neon lights, futuristic tech elements, dark city backdrop, rain-soaked atmosphere
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Badge className="bg-green-600 mb-3">Nature</Badge>
              <div className="space-y-2 text-sm">
                <p><strong>Prompt:</strong> &quot;golden dragon flying&quot;</p>
                <p className="text-muted-foreground">
                  Result: A golden dragon rendered with organic textures, lush forest backdrop, natural sunlight, earth tones
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Badge className="bg-blue-600 mb-3">Tech</Badge>
              <div className="space-y-2 text-sm">
                <p><strong>Prompt:</strong> &quot;rocket ship launching&quot;</p>
                <p className="text-muted-foreground">
                  Result: A rocket ship with digital interfaces, circuit patterns, blue glow, innovation aesthetic
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Badge className="bg-orange-600 mb-3">Retro</Badge>
              <div className="space-y-2 text-sm">
                <p><strong>Prompt:</strong> &quot;sports car racing&quot;</p>
                <p className="text-muted-foreground">
                  Result: A sports car with 80s synthwave style, neon pink and blue, grid lines, nostalgic vibes
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Writing Good Prompts */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Writing Good Prompts</h2>
        <p className="text-muted-foreground mb-4">
          Your prompt should describe the subject or scene you want. Keep it simple - the style handles the visual treatment.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card className="border-green-500/30">
            <CardContent className="pt-6">
              <h4 className="font-bold text-green-500 mb-3">Good Prompts</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">+</span>
                  <span>&quot;bigfoot catching a fish by a mountain lake&quot;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">+</span>
                  <span>&quot;golden dragon breathing fire&quot;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">+</span>
                  <span>&quot;astronaut planting a flag on mars&quot;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">+</span>
                  <span>&quot;wolf howling at the moon&quot;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">+</span>
                  <span>&quot;treasure chest overflowing with gold&quot;</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-red-500/30">
            <CardContent className="pt-6">
              <h4 className="font-bold text-red-500 mb-3">Avoid These</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">-</span>
                  <span>&quot;something cool&quot; - too vague</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">-</span>
                  <span>&quot;neon blue cyberpunk style&quot; - style words belong in style selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">-</span>
                  <span>&quot;not ugly, no bad quality&quot; - negative terms don&apos;t work well</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">-</span>
                  <span>Real people&apos;s names or faces</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">-</span>
                  <span>Empty or blank - prompts are required</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold mb-2">Pro Tip</h4>
                <p className="text-sm text-muted-foreground">
                  Focus on describing <strong>what</strong> you want to see, not <strong>how</strong> it should look.
                  The style selection handles colors, lighting, atmosphere, and aesthetic. Your prompt just needs to say
                  &quot;bigfoot fishing&quot; - not &quot;bigfoot fishing in a green forest with organic textures.&quot;
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* All Styles */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Available Styles (20 Total)</h2>
        <p className="text-muted-foreground mb-6">
          Every style is available for all subdomain tiers. Higher tiers get more inference steps for better quality.
        </p>

        {STYLE_CATEGORIES.map((category) => (
          <div key={category.name} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Badge className={category.badge}>{category.name}</Badge>
              <span className="text-sm text-muted-foreground">{category.styles.length} styles</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {category.styles.map((style) => (
                <Card key={style.id} className="bg-secondary/30">
                  <CardContent className="py-3 px-4">
                    <div className="font-medium capitalize">{style.id}</div>
                    <div className="text-xs text-muted-foreground">{style.desc}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Preview System */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Preview System</h2>
        <p className="text-muted-foreground mb-4">
          Before purchasing, you can preview your NFT artwork to see how it will look:
        </p>

        <ul className="space-y-2 mb-6">
          <li className="flex items-start gap-2">
            <span className="text-green-500">+</span>
            <span><strong>10 free preview credits</strong> - Experiment with different prompts and styles</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">+</span>
            <span><strong>Different seed = different result</strong> - Each generation is unique</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500">+</span>
            <span><strong>Save multiple previews</strong> - Compare options before purchasing</span>
          </li>
        </ul>

        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <h4 className="font-bold mb-2">Running Out of Previews?</h4>
            <p className="text-sm text-muted-foreground">
              If you use all 10 free preview credits, you can purchase additional credits
              to continue experimenting. This helps cover the cost of AI image generation.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* CTA */}
      <section className="pt-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">Ready to create your NFT?</h3>
                <p className="text-muted-foreground">Search for a subdomain and bring your vision to life</p>
              </div>
              <Link
                href="/register-v2"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Register Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
