import { WikiBreadcrumbs } from "./WikiBreadcrumbs";
import { WikiPrevNext } from "./WikiPrevNext";
import { getBreadcrumbs, getPrevNextPages } from "@/lib/wiki";

export function WikiPageShell({
  categoryId,
  slug,
  children,
}: {
  categoryId: string;
  slug: string;
  children: React.ReactNode;
}) {
  const breadcrumbs = getBreadcrumbs(categoryId, slug);
  const { prev, next } = getPrevNextPages(categoryId, slug);

  return (
    <div>
      <WikiBreadcrumbs items={breadcrumbs} />
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        {children}
      </article>
      <WikiPrevNext prev={prev} next={next} />
    </div>
  );
}
