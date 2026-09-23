"use client";

import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface DomainEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  filterCount: number;
}

export function DomainEmptyState({
  hasFilters,
  onClearFilters,
  filterCount,
}: DomainEmptyStateProps) {
  if (!hasFilters) {
    return null;
  }

  return (
    <Card>
      <CardContent className="py-12">
        <div className="text-center">
          <SearchX className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-semibold mb-2">No Domains Found</h3>
          <p className="text-muted-foreground mb-6">
            No domains match your current filters.
            {filterCount > 0 && (
              <span className="block mt-1 text-sm">
                {filterCount} filter{filterCount > 1 ? "s" : ""} active
              </span>
            )}
          </p>
          <Button variant="outline" onClick={onClearFilters}>
            Clear All Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
