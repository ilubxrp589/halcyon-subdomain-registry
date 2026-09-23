"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { WikiBreadcrumbs } from "@/components/wiki/WikiBreadcrumbs";
import { wikiCategories, getBreadcrumbs } from "@/lib/wiki";
import { ArrowRight } from "lucide-react";

export default function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: categoryId } = use(params);
  const category = wikiCategories.find((c) => c.id === categoryId);
  if (!category) notFound();

  const breadcrumbs = getBreadcrumbs(categoryId);

  return (
    <div>
      <WikiBreadcrumbs items={breadcrumbs} />
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <category.icon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">{category.title}</h1>
        </div>
        <p className="text-lg text-muted-foreground">{category.description}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {category.pages.map((page) => (
          <Link key={page.slug} href={`/wiki/${categoryId}/${page.slug}`}>
            <Card className="h-full hover:bg-secondary/30 transition-colors group cursor-pointer">
              <CardContent className="pt-6">
                <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                  {page.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">{page.description}</p>
                <div className="flex items-center gap-1 text-sm text-primary">
                  Read article
                  <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
