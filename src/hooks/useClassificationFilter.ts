import { useState, useCallback, useMemo } from 'react';
import type { CanvasObject } from '../types';

// Predefined classification colors for consistent visual identification
const CLASSIFICATION_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#6366f1', // indigo
];

function getClassificationColor(classification: string): string {
  if (!CLASSIFICATION_COLORS[classification]) {
    const idx = Object.keys(CLASSIFICATION_COLORS).length % COLOR_PALETTE.length;
    CLASSIFICATION_COLORS[classification] = COLOR_PALETTE[idx];
  }
  return CLASSIFICATION_COLORS[classification];
}

export interface ClassificationFilterState {
  // All known classifications derived from objects
  classifications: string[];
  // Currently active filter (null = show all, string = filter to one classification)
  activeFilter: string | null;
  // Whether filter view is active
  isFilterActive: boolean;
  // Computed: objects to display (filtered or all)
  filteredObjects: Map<string, CanvasObject>;
  // Computed: grouped positions for filter view
  groupedPositions: Map<string, { left: number; top: number }>;
  // Pre-computed badge positions for cluster labels (one per cluster)
  clusterBadges: Array<{ left: number; top: number; classification: string }>;
  // Actions
  setActiveFilter: (classification: string | null) => void;
  enterFilterView: (classification: string | null) => void;
  exitFilterView: () => void;
  addClassification: (name: string) => void;
  removeClassification: (name: string) => void;
  renameClassification: (oldName: string, newName: string) => void;
  getClassificationColor: (classification: string) => string;
  // Custom classifications (user-created)
  customClassifications: string[];
}

// Layout constants for grouped view
const GROUP_HEADER_HEIGHT = 50;
const GROUP_PADDING = 40;
const CLUSTER_GAP = 100; // px — objects within this distance are spatially clustered
const MAX_ROW_WIDTH = 1200; // px — clusters wrap to next row beyond this width

function getObjectBounds(obj: CanvasObject) {
  const left = obj.props.left ?? 0;
  const top = obj.props.top ?? 0;
  const width = obj.props.width ?? 100;
  const height = obj.props.height ?? 100;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function getGroupBounds(objects: CanvasObject[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const obj of objects) {
    const b = getObjectBounds(obj);
    if (b.left < left) left = b.left;
    if (b.top < top) top = b.top;
    if (b.right > right) right = b.right;
    if (b.bottom > bottom) bottom = b.bottom;
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function clusterObjects(objects: CanvasObject[]): CanvasObject[][] {
  if (objects.length === 0) return [];
  if (objects.length === 1) return [objects];

  // Union-Find to group spatially close objects
  const parent = objects.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b);
  }

  // Union objects whose bounding boxes are within CLUSTER_GAP of each other
  for (let i = 0; i < objects.length; i++) {
    const bi = getObjectBounds(objects[i]);
    for (let j = i + 1; j < objects.length; j++) {
      const bj = getObjectBounds(objects[j]);
      const horizDist = Math.max(0, Math.max(bi.left, bj.left) - Math.min(bi.right, bj.right));
      const vertDist = Math.max(0, Math.max(bi.top, bj.top) - Math.min(bi.bottom, bj.bottom));
      if (horizDist <= CLUSTER_GAP && vertDist <= CLUSTER_GAP) {
        union(i, j);
      }
    }
  }

  // Collect clusters
  const clusterMap = new Map<number, CanvasObject[]>();
  objects.forEach((obj, i) => {
    const root = find(i);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(obj);
  });

  // Sort clusters by size descending for visual priority
  return Array.from(clusterMap.values()).sort((a, b) => b.length - a.length);
}

function computeGroupedPositions(
  objects: Map<string, CanvasObject>,
  activeFilter: string | null
): { positions: Map<string, { left: number; top: number }>; clusterBadges: Array<{ left: number; top: number; classification: string }> } {
  const positions = new Map<string, { left: number; top: number }>();
  const clusterBadges: Array<{ left: number; top: number; classification: string }> = [];

  // Group objects by classification
  const groups = new Map<string, CanvasObject[]>();

  objects.forEach((obj) => {
    if (activeFilter !== null) {
      // When filtering to one classification, only position matching objects
      if (obj.classification === activeFilter) {
        const list = groups.get(activeFilter) || [];
        list.push(obj);
        groups.set(activeFilter, list);
      }
    } else {
      // Show all, grouped by classification
      const cls = obj.classification || '__unclassified__';
      const list = groups.get(cls) || [];
      list.push(obj);
      groups.set(cls, list);
    }
  });

  // Layout groups vertically
  let currentY = GROUP_PADDING;
  const startX = GROUP_PADDING;

  // Sort group names alphabetically, with unclassified last
  const sortedGroups = Array.from(groups.keys()).sort((a, b) => {
    if (a === '__unclassified__') return 1;
    if (b === '__unclassified__') return -1;
    return a.localeCompare(b);
  });

  for (const groupName of sortedGroups) {
    const groupObjects = groups.get(groupName) || [];
    if (groupObjects.length === 0) continue;

    currentY += GROUP_HEADER_HEIGHT;

    // Split group into spatial clusters and lay them out compactly
    const clusters = clusterObjects(groupObjects);
    let rowX = startX;
    let rowMaxHeight = 0;

    for (const cluster of clusters) {
      const clusterBounds = getGroupBounds(cluster);

      // Wrap to next row if this cluster would exceed max width
      if (rowX > startX && rowX + clusterBounds.width > MAX_ROW_WIDTH) {
        currentY += rowMaxHeight + GROUP_PADDING;
        rowX = startX;
        rowMaxHeight = 0;
      }

      // Rigid-body translate cluster (preserves internal spatial relationships)
      const offsetX = rowX - clusterBounds.left;
      const offsetY = currentY - clusterBounds.top;
      for (const obj of cluster) {
        positions.set(obj.id, {
          left: (obj.props.left ?? 0) + offsetX,
          top: (obj.props.top ?? 0) + offsetY,
        });
      }

      // Add a badge at the cluster's top-left position (skip unclassified groups)
      if (groupName !== '__unclassified__') {
        clusterBadges.push({ left: rowX, top: currentY, classification: groupName });
      }

      rowX += clusterBounds.width + GROUP_PADDING;
      rowMaxHeight = Math.max(rowMaxHeight, clusterBounds.height);
    }

    currentY += rowMaxHeight + GROUP_PADDING;
  }

  return { positions, clusterBadges };
}

export function useClassificationFilter(
  objects: Map<string, CanvasObject>
): ClassificationFilterState {
  const [activeFilter, setActiveFilterState] = useState<string | null>(null);
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [customClassifications, setCustomClassifications] = useState<string[]>([]);

  // Derive all classifications from objects + custom ones
  const classifications = useMemo(() => {
    const classSet = new Set<string>(customClassifications);
    objects.forEach((obj) => {
      if (obj.classification) {
        classSet.add(obj.classification);
      }
    });
    return Array.from(classSet).sort();
  }, [objects, customClassifications]);

  // Compute filtered objects based on active filter
  const filteredObjects = useMemo(() => {
    if (!isFilterActive || activeFilter === null) {
      return objects;
    }
    // In filter view, return all objects (they'll be repositioned, unclassified dimmed)
    return objects;
  }, [objects, activeFilter, isFilterActive]);

  // Compute grouped positions and cluster badges for filter view
  const { groupedPositions, clusterBadges } = useMemo(() => {
    if (!isFilterActive) return { groupedPositions: new Map<string, { left: number; top: number }>(), clusterBadges: [] as Array<{ left: number; top: number; classification: string }> };
    const result = computeGroupedPositions(objects, activeFilter);
    return { groupedPositions: result.positions, clusterBadges: result.clusterBadges };
  }, [objects, activeFilter, isFilterActive]);

  const setActiveFilter = useCallback((classification: string | null) => {
    setActiveFilterState(classification);
  }, []);

  const enterFilterView = useCallback((classification: string | null) => {
    setActiveFilterState(classification);
    setIsFilterActive(true);
  }, []);

  const exitFilterView = useCallback(() => {
    setIsFilterActive(false);
    setActiveFilterState(null);
    // Position snapshot is kept for restoration by the caller
  }, []);

  const addClassification = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed && !customClassifications.includes(trimmed)) {
      setCustomClassifications((prev) => [...prev, trimmed]);
    }
  }, [customClassifications]);

  const removeClassification = useCallback((name: string) => {
    setCustomClassifications((prev) => prev.filter((c) => c !== name));
    // Note: removing a classification from the list doesn't un-tag objects
    // That's handled separately by the caller
  }, []);

  const renameClassification = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCustomClassifications((prev) =>
      prev.map((c) => (c === oldName ? trimmed : c))
    );
    // Note: renaming objects' classifications is handled by the caller
  }, []);

  return {
    classifications,
    activeFilter,
    isFilterActive,
    filteredObjects,
    groupedPositions,
    clusterBadges,
    setActiveFilter,
    enterFilterView,
    exitFilterView,
    addClassification,
    removeClassification,
    renameClassification,
    getClassificationColor,
    customClassifications,
  };
}
